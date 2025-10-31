/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  And,
  Between,
  DataSource,
  EntityManager,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { ReceiptEntity } from './entities/payment.entity';
import { StudentsService } from '../profiles/students/students.service';
import { EnrolmentService } from '../enrolment/enrolment.service';
import { InjectRepository } from '@nestjs/typeorm';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { CreateReceiptDto } from './dtos/createPayment.dto';
import { ROLES } from 'src/auth/models/roles.enum';
import { FinanceService } from 'src/finance/finance.service';
import { Invoice } from './models/invoice.model';
import { ResourceByIdService } from 'src/resource-by-id/resource-by-id.service';
import * as PDFDocument from 'pdfkit';
import { Stream } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { BillsEntity } from 'src/finance/entities/bills.entity';
import { FeesNames } from 'src/finance/models/fees-names.enum';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceStatsModel } from 'src/finance/models/invoice-stats.model';
import * as crypto from 'crypto';
import { BalancesEntity } from 'src/finance/entities/balances.entity';
import { InvoiceStatus } from 'src/finance/models/invoice-status.enum';

import { ReceiptInvoiceAllocationEntity } from './entities/receipt-invoice-allocation.entity';
import { ExemptionEntity } from 'src/exemptions/entities/exemptions.entity';
import { ExemptionType } from 'src/exemptions/enums/exemptions-type.enum';
import { FeesEntity } from 'src/finance/entities/fees.entity';
import { StudentCreditEntity } from './entities/student-credit.entity';
@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepository: Repository<InvoiceEntity>,
    @InjectRepository(ReceiptEntity)
    private readonly receiptRepository: Repository<ReceiptEntity>,
    @InjectRepository(ReceiptInvoiceAllocationEntity)
    private allocationRepository: Repository<ReceiptInvoiceAllocationEntity>,
    private readonly enrolmentService: EnrolmentService,
    private readonly financeService: FinanceService,
    private studentsService: StudentsService,
    private resourceById: ResourceByIdService,
    private dataSource: DataSource, // Inject DataSource for transactional queries
  ) {}

  /**
   * Helper method to calculate the net bill amount after applying exemptions.
   * This logic is central and used by invoice saving/updating and statement generation.
   *
   * @param bills - An array of FeeBillEntity objects associated with an invoice or student.
   * @param studentExemption - The ExemptionEntity for the student, or null if none.
   * @returns The total bill amount after any applicable exemptions.
   */
  private calculateNetBillAmount(
    bills: BillsEntity[],
    studentExemption: ExemptionEntity | null,
  ): number {
    let totalGrossBill = 0;
    let totalExemptionAmount = 0;

    for (const bill of bills) {
      totalGrossBill += Number(bill.fees.amount);
    }

    if (studentExemption && studentExemption.isActive) {
      if (studentExemption.type === ExemptionType.FIXED_AMOUNT) {
        // For FIXED_AMOUNT, deduct the fixed amount.
        totalExemptionAmount = studentExemption.fixedAmount || 0;
      } else if (studentExemption.type === ExemptionType.PERCENTAGE) {
        // For PERCENTAGE, deduct the specified percentage.
        totalExemptionAmount =
          (totalGrossBill * (studentExemption.percentageAmount || 0)) / 100;
      } else if (studentExemption.type === ExemptionType.STAFF_SIBLING) {
        // Special logic for STAFF_SIBLING: 100% on most fees, 50% on foodFee.
        let foodFeeTotal = 0;
        let otherFeesTotal = 0;
        for (const bill of bills) {
          if (bill.fees.name === FeesNames.foodFee) {
            foodFeeTotal += Number(bill.fees.amount);
          } else {
            otherFeesTotal += Number(bill.fees.amount);
          }
        }
        // Exemption amount = 100% of other fees + 50% of food fee
        totalExemptionAmount = otherFeesTotal + foodFeeTotal * 0.5;
      }
    }

    // Ensure the net bill doesn't go below zero
    const netBill = totalGrossBill - totalExemptionAmount;
    return Math.max(0, netBill);
  }

  async voidReceipt(
    receiptId: number,
    voidedByEmail: string,
  ): Promise<ReceiptEntity> {
    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        const receiptToVoid = await transactionalEntityManager.findOne(
          ReceiptEntity,
          {
            where: { id: receiptId },
            relations: ['allocations', 'allocations.invoice'], // Load allocations and their related invoices
          },
        );

        if (!receiptToVoid) {
          throw new NotFoundException(
            `Receipt with ID ${receiptId} not found.`,
          );
        }
        if (receiptToVoid.isVoided) {
          throw new BadRequestException(
            `Receipt with ID ${receiptId} is already voided.`,
          );
        }

        // 1. Mark the receipt as voided
        receiptToVoid.isVoided = true;
        receiptToVoid.voidedAt = new Date();
        receiptToVoid.voidedBy = voidedByEmail;
        await transactionalEntityManager.save(receiptToVoid);

        const updatedInvoices: InvoiceEntity[] = [];

        // 2. Reverse allocations and update affected invoices
        for (const allocation of receiptToVoid.allocations) {
          const invoice = allocation.invoice;
          const amountApplied = Number(allocation.amountApplied);

          if (invoice) {
            // Decrease amountPaidOnInvoice and increase balance
            invoice.amountPaidOnInvoice = Math.max(
              0,
              Number(invoice.amountPaidOnInvoice) - amountApplied,
            );
            invoice.balance = Number(invoice.balance) + amountApplied;
            invoice.status = this.getInvoiceStatus(invoice); // Recalculate status

            updatedInvoices.push(invoice);
          }

          // Optionally, you might want to delete or mark allocations as voided.
          // For simplicity and audit trail, marking them as voided might be better.
          // For now, if the receipt is voided, these allocations are implicitly invalid.
          // If you need to explicitly mark allocations, you'd add an `isVoided` column to `ReceiptInvoiceAllocationEntity`.
          // For this example, we'll just reverse the financial impact.
        }

        // 3. Save all updated invoices
        await transactionalEntityManager.save(updatedInvoices);

        // 4. Optionally, handle any remaining `remainingPaymentAmount` if the original receipt had an overpayment that wasn't allocated to an invoice.
        // This is where a dedicated "credit" balance entity would come in handy.
        // For now, if the receipt was fully allocated, reversing allocations is enough.
        // If an overpayment existed and was *not* allocated to an invoice, you'd need to create a credit entry or add it back to a general student credit balance.

        // After voiding, you might want to consider creating a negative balance entry if the student now owes money they previously didn't,
        // or updating an existing balance carried forward. This depends on how you want to reflect "credits" vs. "amounts due".
        // If the entire receipt was an overpayment and formed a credit, voiding it means that credit disappears.

        return receiptToVoid;
      },
    );
  }

  async getStudentBalance(
    studentNumber: string,
  ): Promise<{ amountDue: number }> {
    const student = await this.resourceById.getStudentByStudentNumber(
      studentNumber,
    );
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Calculate total outstanding invoices
    const outstandingInvoices = await this.invoiceRepository.find({
      where: {
        student: { studentNumber },
        status: In([
          InvoiceStatus.Pending,
          InvoiceStatus.PartiallyPaid,
          InvoiceStatus.Overdue,
        ]),
      },
    });

    const totalInvoiceBalance = outstandingInvoices.reduce(
      (sum, inv) => sum + Number(inv.balance),
      0,
    );

    return {
      amountDue: totalInvoiceBalance,
    };
  }

  async createReceipt(
    createReceiptDto: CreateReceiptDto,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ReceiptEntity> {
    // 1. Authorization Check (already provided)
    const allowedRoles = [ROLES.reception, ROLES.auditor];
    if (!allowedRoles.includes(profile.role as ROLES)) {
      throw new UnauthorizedException(
        'You are not allowed to generate receipts',
      );
    }

    // 2. Fetch Student Entity
    const studentNumber = createReceiptDto.studentNumber;
    const student = await this.resourceById.getStudentByStudentNumber(
      studentNumber,
    );
    if (!student) {
      throw new BadRequestException(
        `Student with number ${studentNumber} not found.`,
      );
    }

    const enrol = await this.enrolmentService.getCurrentEnrollment(
      studentNumber,
    );

    // Initialize the new Receipt entity
    const newReceipt = this.receiptRepository.create({
      amountPaid: createReceiptDto.amountPaid,
      description: createReceiptDto.description,
      paymentMethod: createReceiptDto.paymentMethod,
      student: student,
      receiptNumber: this.generateReceiptNumber(),
      servedBy: profile.email,
      enrol: enrol,
      isVoided: false, // Ensure this is explicitly set to false for new receipts
      voidedAt: null,
      voidedBy: null,
    });

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        const savedReceipt = await transactionalEntityManager.save(newReceipt);

        let remainingPaymentAmount = savedReceipt.amountPaid;
        const allocationsToSave: ReceiptInvoiceAllocationEntity[] = [];
        const updatedInvoices: InvoiceEntity[] = [];

        // 3. Fetch and Order Outstanding Invoices
        const openInvoices = await transactionalEntityManager.find(
          InvoiceEntity,
          {
            where: {
              student: { studentNumber },
              status: In([
                InvoiceStatus.Pending,
                InvoiceStatus.PartiallyPaid,
                InvoiceStatus.Overdue,
              ]),
            },
            order: {
              invoiceDueDate: 'ASC',
            },
          },
        );

        // 4. Apply payment amount to invoices sequentially (FIFO)
        for (const invoice of openInvoices) {
          if (remainingPaymentAmount <= 0) {
            break;
          }

          const invoiceCurrentBalance = Number(invoice.balance);

          if (invoiceCurrentBalance <= 0) {
            continue;
          }

          const amountToApplyToCurrentInvoice = Math.min(
            remainingPaymentAmount,
            invoiceCurrentBalance,
          );

          const allocation = transactionalEntityManager.create(
            ReceiptInvoiceAllocationEntity,
            {
              receipt: savedReceipt,
              invoice: invoice,
              amountApplied: amountToApplyToCurrentInvoice,
              allocationDate: new Date(),
            },
          );
          allocationsToSave.push(allocation);

          invoice.amountPaidOnInvoice =
            Number(invoice.amountPaidOnInvoice) + amountToApplyToCurrentInvoice;

          invoice.balance =
            Number(invoice.balance) - amountToApplyToCurrentInvoice;
          invoice.status = this.getInvoiceStatus(invoice);
          updatedInvoices.push(invoice);

          remainingPaymentAmount =
            remainingPaymentAmount - amountToApplyToCurrentInvoice;
        }

        // 5. Handle any remaining payment amount as a credit
        if (remainingPaymentAmount > 0) {
          // Use the new service method to create or update student credit
          await this.createOrUpdateStudentCredit(
            student.studentNumber,
            remainingPaymentAmount,
            transactionalEntityManager,
            `Overpayment from Receipt ${savedReceipt.receiptNumber}`, // Add a clear source
          );
        }

        // 6. Save all changes within the transaction
        await transactionalEntityManager.save(updatedInvoices);
        await transactionalEntityManager.save(allocationsToSave);

        const finalReceipt = await transactionalEntityManager.findOne(
          ReceiptEntity,
          {
            where: { id: savedReceipt.id },
            relations: [
              'allocations',
              'allocations.invoice',
              'student',
              'enrol',
            ],
          },
        );

        if (!finalReceipt) {
          throw new Error(
            'Failed to retrieve full receipt details after save.',
          );
        }

        return finalReceipt;
      },
    );
  }

  async createOrUpdateStudentCredit(
    studentNumber: string,
    amount: number,
    transactionalEntityManager: EntityManager,
    source = 'Overpayment',
  ): Promise<StudentCreditEntity> {
    let studentCredit = await transactionalEntityManager.findOne(
      StudentCreditEntity,
      {
        where: { studentNumber: studentNumber },
        relations: ['student'], // Load the student relation if needed
      },
    );

    if (studentCredit) {
      // Update existing credit
      studentCredit.amount = Number(studentCredit.amount) + amount;
      studentCredit.lastCreditSource = source;
    } else {
      // Create new credit entry
      const student = await transactionalEntityManager.findOne(StudentsEntity, {
        where: { studentNumber },
      });
      if (!student) {
        throw new NotFoundException(
          `Student with number ${studentNumber} not found for credit creation.`,
        );
      }
      studentCredit = transactionalEntityManager.create(StudentCreditEntity, {
        student: student,
        studentNumber: studentNumber,
        amount: amount,
        lastCreditSource: source,
      });
    }

    return await transactionalEntityManager.save(studentCredit);
  }

  async deductStudentCredit(
    studentNumber: string,
    amountToDeduct: number,
    transactionalEntityManager: EntityManager,
    reason = 'Applied to Invoice',
  ): Promise<StudentCreditEntity | null> {
    const studentCredit = await transactionalEntityManager.findOne(
      StudentCreditEntity,
      {
        where: { studentNumber: studentNumber },
      },
    );

    if (studentCredit && Number(studentCredit.amount) >= amountToDeduct) {
      studentCredit.amount = Number(studentCredit.amount) - amountToDeduct;
      studentCredit.lastCreditSource = `Deducted: ${reason}`;

      if (studentCredit.amount <= 0) {
        // If credit becomes zero or negative, you might choose to delete the entry
        // or keep it with amount 0 for historical purposes. Keeping it at 0 is safer.
        studentCredit.amount = 0;
        await transactionalEntityManager.save(studentCredit); // Save updated zero credit
        // await transactionalEntityManager.remove(studentCredit); // Or remove if desired
        return null; // Or return the updated entity
      } else {
        return await transactionalEntityManager.save(studentCredit);
      }
    } else if (studentCredit && Number(studentCredit.amount) < amountToDeduct) {
      throw new BadRequestException(
        `Insufficient credit balance for student ${studentNumber}. Available: ${studentCredit.amount}, Requested: ${amountToDeduct}`,
      );
    }
    return null; // No credit found for student
  }

  async getAllReceipts(): Promise<ReceiptEntity[]> {
    return await this.receiptRepository.find({
      relations: ['student', 'enrol', 'allocations', 'allocations.invoice'],
    });
  }

  async getNotApprovedPayments(): Promise<ReceiptEntity[]> {
    return await this.receiptRepository.find({
      where: {
        approved: false,
      },
    });
  }

  async getPaymentsByStudent(studentNumber: string): Promise<ReceiptEntity[]> {
    const receipts = await this.receiptRepository.find({
      where: {
        student: { studentNumber },
      },
      relations: ['student', 'enrol', 'allocations', 'allocations.invoice'],
    });
    return receipts;
  }

  async getReceiptByReceiptNumber(
    receiptNumber: string,
  ): Promise<ReceiptEntity> {
    return await this.receiptRepository.findOne({
      where: { receiptNumber },
      relations: ['student', 'enrol', 'allocations', 'allocations.invoice'],
    });
  }

  async getPaymentsInTerm(num: number, year: number): Promise<ReceiptEntity[]> {
    const term = await this.enrolmentService.getOneTerm(num, year);

    if (!term) {
      return []; // Return an empty array if term is not found
    }

    return await this.receiptRepository.find({
      where: {
        paymentDate: And(
          MoreThanOrEqual(term.startDate),
          LessThanOrEqual(term.endDate),
        ),
      },
    });
  }

  async getPaymentsByYear(year: number): Promise<ReceiptEntity[]> {
    const startDate = new Date(year, 0, 1); // January 1st of the year
    const endDate = new Date(year + 1, 0, 1); // January 1st of the next year (exclusive)

    return await this.receiptRepository.find({
      where: {
        paymentDate: Between(startDate, endDate),
      },
    });
  }

  async generateStatementOfAccount(
    studentNumber: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<Invoice> {
    // Changed return type to Invoice
    // Fetch student with exemption
    const student =
      await this.studentsService.getStudentByStudentNumberWithExemption(
        studentNumber,
      );
    if (!student) {
      throw new NotFoundException(
        `Student with number ${studentNumber} not found.`,
      );
    }

    const studentExemption = student.exemption;
    const payments = await this.getPaymentsByStudent(studentNumber);
    const bills = await this.financeService.getStudentBills(studentNumber);

    // Calculate the total bill *after* applying exemption for the statement
    const totalBillAfterExemption = this.calculateNetBillAmount(
      bills,
      studentExemption,
    );

    const enrol = await this.enrolmentService.getCurrentEnrollment(
      studentNumber,
    );

    const totalPayments = payments.reduce(
      (sum, payment) => sum + Number(payment.amountPaid),
      0,
    );

    const balanceBfwd = await this.financeService.findStudentBalance(
      studentNumber,
    );

    const invoice = new Invoice(
      totalBillAfterExemption, // Pass the net total bill to the Invoice constructor
      balanceBfwd,
      student,
      bills,
      // The final balance for the statement: net bill + bfwd - payments
      Number(totalBillAfterExemption) +
        Number(balanceBfwd.amount) -
        Number(totalPayments),
    );

    return invoice;
  }

  async saveInvoice(invoice: Invoice): Promise<InvoiceEntity> {
    // Wrap the entire logic in a database transaction
    return await this.dataSource.transaction(
      async (transactionalEntityManager: EntityManager) => {
        try {
          // Fetch student with exemption to ensure it's loaded for calculation
          // Make sure getStudentByStudentNumberWithExemption uses the transactionalEntityManager
          const student =
            await this.studentsService.getStudentByStudentNumberWithExemption(
              invoice.student.studentNumber,
            );
          if (!student) {
            throw new NotFoundException(
              `Student with number ${invoice.student.studentNumber} not found.`,
            );
          }

          const studentExemption = student.exemption;

          // Calculate the net total bill based on current bills and exemption
          const calculatedNetTotalBill = this.calculateNetBillAmount(
            invoice.bills,
            studentExemption,
          );

          let invoiceToSave: InvoiceEntity; // Declared but not initialized yet

          // Use transactionalEntityManager for finding the invoice
          const foundInvoice = await transactionalEntityManager.findOne(
            InvoiceEntity, // Use the entity directly with transactionalEntityManager
            {
              where: {
                student: { studentNumber: student.studentNumber },
                enrol: { num: invoice.enrol.num, year: invoice.enrol.year },
              },
              relations: [
                'student',
                'enrol',
                'balanceBfwd',
                'bills',
                'bills.fees',
                'exemption',
              ],
            },
          );

          if (foundInvoice) {
            invoiceToSave = foundInvoice;
            // Update totalBill (which is the net bill AFTER exemption but BEFORE balanceBfwd/credits)
            invoiceToSave.totalBill = calculatedNetTotalBill;
            invoiceToSave.bills = invoice.bills;
            invoiceToSave.invoiceDate = invoice.invoiceDate;
            invoiceToSave.invoiceDueDate = invoice.invoiceDueDate;

            // Recalculate balance based on new totalBill and existing payments
            let totalPaymentsOnInvoice = invoiceToSave.amountPaidOnInvoice
              ? Number(invoiceToSave.amountPaidOnInvoice)
              : 0;

            const balanceBfwdAmount = invoiceToSave.balanceBfwd
              ? Number(invoiceToSave.balanceBfwd.amount)
              : 0;

            // If a balance brought forward existed, add it to the total for this invoice
            if (+balanceBfwdAmount > 0) {
              invoiceToSave.totalBill += +balanceBfwdAmount; // This increases the total amount due for this invoice
            }

            // --- Apply existing student credits (if any) ---
            const studentCredit = await this.getStudentCredit(
              // Call via financeService
              student.studentNumber,
              transactionalEntityManager, // Pass the transactionalEntityManager
            );

            if (studentCredit && Number(studentCredit.amount) > 0) {
              // Determine how much credit to apply to this invoice
              // Apply up to the remaining amount of the invoice, or the available credit, whichever is smaller
              // The `balance` field represents the *current* outstanding amount before this application.
              // So we should compare against the `totalBill` (which now includes `balanceBfwd` if applicable)
              // minus any `amountPaidOnInvoice` already present.
              const currentOutstandingAmount =
                invoiceToSave.totalBill - totalPaymentsOnInvoice;

              const amountToApplyFromCredit = Math.min(
                currentOutstandingAmount,
                Number(studentCredit.amount),
              );

              if (amountToApplyFromCredit > 0) {
                // Deduct from student's credit balance
                await this.deductStudentCredit(
                  // Call via financeService
                  student.studentNumber,
                  amountToApplyFromCredit,
                  transactionalEntityManager,
                  `Applied to Invoice ${invoiceToSave.invoiceNumber}`,
                );

                // Update invoice's amountPaidOnInvoice and consequently its balance
                invoiceToSave.amountPaidOnInvoice =
                  Number(invoiceToSave.amountPaidOnInvoice) +
                  amountToApplyFromCredit;
                totalPaymentsOnInvoice += amountToApplyFromCredit; // This includes both cash and credit payments
              }
            }

            // Final balance calculation for existing invoice
            invoiceToSave.balance =
              invoiceToSave.totalBill - totalPaymentsOnInvoice;

            // Now that invoiceToSave is initialized, you can set the exemption
            invoiceToSave.exemption = studentExemption || null;
            // invoiceToSave.exemptedAmount = this._calculateExemptionAmount(invoiceToSave);
            invoiceToSave.status = this.getInvoiceStatus(invoiceToSave);
          } else {
            // This is a NEW invoice
            invoiceToSave = new InvoiceEntity();
            invoiceToSave.student = student;
            invoiceToSave.enrol = invoice.enrol;
            invoiceToSave.bills = invoice.bills;
            invoiceToSave.invoiceNumber = invoice.invoiceNumber;
            invoiceToSave.invoiceDate = invoice.invoiceDate;
            invoiceToSave.invoiceDueDate = invoice.invoiceDueDate;
            invoiceToSave.totalBill = calculatedNetTotalBill; // Initial total bill without balanceBfwd or credits
            invoiceToSave.amountPaidOnInvoice = 0; // New invoice, no payments yet from cash

            let initialOutstandingAmount = calculatedNetTotalBill;

            // If balanceBfwd is provided in the input Invoice, incorporate it.
            if (invoice.balanceBfwd && Number(invoice.balanceBfwd.amount) > 0) {
              invoiceToSave.balanceBfwd = invoice.balanceBfwd;
              // Add balanceBfwd to the totalBill for this new invoice
              invoiceToSave.totalBill += Number(invoice.balanceBfwd.amount);
              initialOutstandingAmount += Number(invoice.balanceBfwd.amount);
            }

            // --- Apply existing student credits to a NEW invoice ---
            const studentCredit = await this.getStudentCredit(
              // Call via financeService
              student.studentNumber,
              transactionalEntityManager, // Pass the transactionalEntityManager
            );

            if (studentCredit && Number(studentCredit.amount) > 0) {
              // Determine how much credit to apply
              const amountToApplyFromCredit = Math.min(
                initialOutstandingAmount, // Apply against the calculated total (including balanceBfwd)
                Number(studentCredit.amount),
              );

              if (amountToApplyFromCredit > 0) {
                // Deduct from student's credit balance
                await this.deductStudentCredit(
                  // Call via financeService
                  student.studentNumber,
                  amountToApplyFromCredit,
                  transactionalEntityManager,
                  `Applied to Invoice ${invoiceToSave.invoiceNumber}`,
                );

                // Update invoice's amountPaidOnInvoice (initial payment from credit)
                invoiceToSave.amountPaidOnInvoice =
                  Number(invoiceToSave.amountPaidOnInvoice) +
                  amountToApplyFromCredit;
              }
            }

            // Final balance calculation for new invoice
            invoiceToSave.balance =
              invoiceToSave.totalBill - invoiceToSave.amountPaidOnInvoice;

            // Set exemption and initial status for new invoice
            invoiceToSave.exemption = studentExemption || null;
            invoiceToSave.status = this.getInvoiceStatus(invoiceToSave);
          }

          invoiceToSave.exemptedAmount =
            this._calculateExemptionAmount(invoiceToSave);

          // Use transactionalEntityManager for saving the invoice
          const saved = await transactionalEntityManager.save(invoiceToSave);

          // Only delete the balanceBfwd if it was actually applied to a NEW invoice
          // And ensure this deletion is part of the same transaction
          if (
            !foundInvoice &&
            invoice.balanceBfwd &&
            Number(invoice.balanceBfwd.amount) > 0
          ) {
            await this.financeService.deleteBalance(
              invoice.balanceBfwd,
              transactionalEntityManager,
            );
          }

          return saved;
        } catch (error) {
          // Log the actual error for better debugging
          console.error('Error saving invoice:', error);
          // Re-throw the error to ensure the transaction is rolled back
          throw error;
        }
      },
    );
  }

  // You will also need to update your FinanceService's deleteBalance method
  // to accept an EntityManager if you're going to call it within a transaction.
  // Example:
  // async deleteBalance(balance: BalancesEntity, transactionalEntityManager: EntityManager): Promise<void> {
  //   await transactionalEntityManager.delete(BalancesEntity, balance.id);
  // }

  async getStudentCredit(
    studentNumber: string,
    transactionalEntityManager: EntityManager, // To ensure it's part of the same transaction
  ): Promise<StudentCreditEntity | null> {
    return await transactionalEntityManager.findOne(StudentCreditEntity, {
      where: { studentNumber },
    });
  }

  async generateEmptyInvoice(
    studentNumber: string,
    num: number,
    year: number,
  ): Promise<InvoiceEntity> {
    const balanceBfwd = await this.financeService.findStudentBalance(
      studentNumber,
    );

    const student = await this.resourceById.getStudentByStudentNumber(
      studentNumber,
    );

    const enrol = await this.enrolmentService.getOneEnrolment(
      studentNumber,
      num,
      year,
    );

    if (!enrol) {
      throw new NotImplementedException(
        `Student ${studentNumber} not enrolled in Term ${num}, ${year}`,
      );
    }

    const newInv = this.invoiceRepository.create();
    newInv.student = student;
    //no longer nedded since the balance bfwd was a legacy feature to cater for balances at the adoption of the system
    // if (+balanceBfwd.amount > 0) {
    //   newInv.balanceBfwd = balanceBfwd;
    //   newInv.totalBill = +newInv.totalBill + +balanceBfwd.amount;
    // }
    newInv.enrol = enrol;
    newInv.bills = [];

    return newInv;
  }

  /**
   * Applies the current student exemption to all existing invoices for that student.
   * This is called when an exemption is created, updated, or deactivated.
   * @param studentNumber - The student number whose invoices need to be re-calculated.
   */
  async applyExemptionToExistingInvoices(studentNumber: string): Promise<void> {
    const student =
      await this.studentsService.getStudentByStudentNumberWithExemption(
        studentNumber,
      );

    if (!student) {
      // Student not found, or no invoices to update
      return;
    }

    const studentExemption = student.exemption;

    const invoicesToUpdate = await this.invoiceRepository.find({
      where: {
        student: { studentNumber },
      },
      relations: ['bills', 'bills.fees', 'balanceBfwd'], // Need to load these to re-calculate accurately
    });

    for (const invoice of invoicesToUpdate) {
      // Re-calculate the total bill for this invoice based on its bills and the current exemption
      const newNetTotalBill = this.calculateNetBillAmount(
        invoice.bills,
        studentExemption,
      );

      // Re-calculate the balance: New Net Total Bill + Balance Brought Forward - Payments Made on This Invoice
      const paymentsOnInvoice = invoice.amountPaidOnInvoice;
      const balanceBfwdAmount = invoice.balanceBfwd
        ? Number(invoice.balanceBfwd.amount)
        : 0;

      invoice.totalBill = newNetTotalBill; // Update the invoice's total bill (net amount)
      invoice.balance = newNetTotalBill + balanceBfwdAmount - paymentsOnInvoice; // Update the invoice's balance
      invoice.status = this.getInvoiceStatus(invoice); // Update status based on new balance
      if (studentExemption) invoice.exemption = studentExemption;

      await this.invoiceRepository.save(invoice); // Save the updated invoice
    }
  }

  async getTermInvoices(num: number, year: number): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      where: {
        enrol: {
          num: num,
          year: year,
        },
      },
      relations: [
        'student',
        'enrol',
        'balanceBfwd',
        'bills',
        'bills.fees',
        'exemption',
      ],
    });
  }

  async getAllInvoices(): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      relations: [
        'student',
        'enrol',
        'balanceBfwd',
        'bills',
        'bills.fees',
        'exemption',
      ],
    });
  }

  async getStudentInvoices(studentNumber: string): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      where: {
        student: {
          studentNumber: studentNumber,
        },
      },
      relations: [
        'student',
        'enrol',
        'balanceBfwd',
        'bills',
        'bills.fees',
        'exemption',
      ],
    });
  }

  async getInvoice(studentNumber: string, num: number, year: number) {
    const invoice = await this.invoiceRepository.findOne({
      where: {
        student: {
          studentNumber: studentNumber,
        },
        enrol: {
          num: num,
          year: year,
        },
      },
      relations: [
        'student',
        'enrol',
        'balanceBfwd',
        'bills',
        'bills.fees',
        'exemption',
      ],
    });

    if (!invoice) {
      const newInvoice = await this.generateEmptyInvoice(
        studentNumber,
        num,
        year,
      );
      return newInvoice;
    } else {
      return invoice;
    }
  }

  async getInvoiceByInvoiceNumber(invoiceNumber: string) {
    return await this.invoiceRepository.findOne({
      where: { invoiceNumber },
      relations: [
        'student',
        'enrol',
        'balanceBfwd',
        'bills',
        'bills.fees',
        'exemption',
      ],
    });
  }

  async getInvoiceStats(
    num: number,
    year: number,
  ): Promise<InvoiceStatsModel[]> {
    // const term = await this.enrolmentService.getOneTerm(num, year);
    // console.log('num : ', num, 'year : ', year);
    const invoices = await this.invoiceRepository.find({
      where: {
        enrol: {
          num,
          year,
        },
      },
      relations: ['student', 'enrol', 'balanceBfwd', 'bills', 'bills.fees'],
    });

    // console.log('invoices: ', invoices.length);

    const invoiceStats: InvoiceStatsModel[] = [];
    const totalTitles = [
      'amount',
      'tuition',
      'boarders',
      'dayScholars',
      'food',
      'transport',
      'science',
      'desk',
      'development',
      'application',
    ];
    totalTitles.map((title) => {
      const invoiceState = new InvoiceStatsModel();
      invoiceState.total = 0;
      invoiceState.oLevel = 0;
      invoiceState.aLevel = 0;
      invoiceState.title = title;
      invoiceStats.push(invoiceState);
    });

    invoices.map((invoice) => {
      const amountIndex = totalTitles.indexOf('amount');
      invoiceStats[amountIndex].total += Number(invoice.totalBill);
      if (
        invoice.enrol.name.charAt(0) == '5' ||
        invoice.enrol.name.charAt(0) == '6'
      ) {
        invoiceStats[amountIndex].aLevel += Number(invoice.totalBill);
      } else {
        invoiceStats[amountIndex].oLevel += Number(invoice.totalBill);
      }

      invoice.bills.map((bill) => {
        // console.log('bill: ', bill.)

        switch (bill.fees.name) {
          case FeesNames.aLevelApplicationFee: {
            const statIndex = totalTitles.indexOf('application');
            invoiceStats[statIndex].aLevel += Number(bill.fees.amount);
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            break;
          }
          case FeesNames.oLevelApplicationFee: {
            const statIndex = totalTitles.indexOf('application');
            invoiceStats[statIndex].oLevel += Number(bill.fees.amount);
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            break;
          }
          case FeesNames.developmentFee: {
            const statIndex = totalTitles.indexOf('development');
            if (
              invoice.enrol.name.charAt(0) === '5' ||
              invoice.enrol.name.charAt(0) === '6'
            ) {
              invoiceStats[statIndex].aLevel += Number(bill.fees.amount);
            } else {
              invoiceStats[statIndex].oLevel += Number(bill.fees.amount);
            }
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            break;
          }
          case FeesNames.deskFee: {
            const statIndex = totalTitles.indexOf('desk');
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            if (
              invoice.enrol.name.charAt(0) === '5' ||
              invoice.enrol.name.charAt(0) === '6'
            ) {
              invoiceStats[statIndex].aLevel += Number(bill.fees.amount);
            } else {
              invoiceStats[statIndex].oLevel += Number(bill.fees.amount);
            }
            break;
          }

          case FeesNames.alevelScienceFee: {
            const statIndex = totalTitles.indexOf('science');
            invoiceStats[statIndex].aLevel += Number(bill.fees.amount);
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            break;
          }
          case FeesNames.oLevelScienceFee: {
            const statIndex = totalTitles.indexOf('science');
            invoiceStats[statIndex].oLevel += Number(bill.fees.amount);
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            break;
          }
          case FeesNames.transportFee: {
            const statIndex = totalTitles.indexOf('transport');
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            if (
              invoice.enrol.name.charAt(0) === '5' ||
              invoice.enrol.name.charAt(0) === '6'
            ) {
              invoiceStats[statIndex].aLevel += Number(bill.fees.amount);
            } else {
              invoiceStats[statIndex].oLevel += Number(bill.fees.amount);
            }
            break;
          }
          case FeesNames.foodFee: {
            const statIndex = totalTitles.indexOf('food');
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            if (
              invoice.enrol.name.charAt(0) === '5' ||
              invoice.enrol.name.charAt(0) === '6'
            ) {
              invoiceStats[statIndex].aLevel += Number(bill.fees.amount);
            } else {
              invoiceStats[statIndex].oLevel += Number(bill.fees.amount);
            }
            break;
          }
          case FeesNames.aLevelTuitionDay: {
            const statIndex = totalTitles.indexOf('dayScholars');
            invoiceStats[statIndex].aLevel += Number(bill.fees.amount);
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            break;
          }
          case FeesNames.oLevelTuitionDay: {
            const statIndex = totalTitles.indexOf('dayScholars');
            invoiceStats[statIndex].oLevel += Number(bill.fees.amount);
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            break;
          }

          case FeesNames.aLevelTuitionBoarder: {
            const statIndex = totalTitles.indexOf('boarders');
            invoiceStats[statIndex].aLevel += Number(bill.fees.amount);
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            break;
          }
          case FeesNames.oLevelTuitionBoarder: {
            const statIndex = totalTitles.indexOf('boarders');
            invoiceStats[statIndex].oLevel += Number(bill.fees.amount);
            invoiceStats[statIndex].total += Number(bill.fees.amount);
            break;
          }
        }
      });
    });

    //calculate and update the total tuition
    const tuitionIndex = totalTitles.indexOf('tuition');
    const boardersTuitionIndex = totalTitles.indexOf('boarders');
    const dayScholarsTuitionIndex = totalTitles.indexOf('dayScholars');

    const totalTuition =
      Number(invoiceStats[boardersTuitionIndex].total) +
      Number(invoiceStats[dayScholarsTuitionIndex].total);
    invoiceStats[tuitionIndex].total = totalTuition;

    invoiceStats[tuitionIndex].aLevel =
      Number(invoiceStats[boardersTuitionIndex].aLevel) +
      Number(invoiceStats[dayScholarsTuitionIndex].aLevel);
    invoiceStats[tuitionIndex].oLevel =
      Number(invoiceStats[boardersTuitionIndex].oLevel) +
      Number(invoiceStats[dayScholarsTuitionIndex].oLevel);

    return invoiceStats;
  }

  async updatePayment(
    receiptNumber: string,
    approved: boolean,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    switch (profile.role) {
      case ROLES.admin:
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher: {
        throw new UnauthorizedException(
          'You are not allowed to approve payments',
        );
      }
    }

    return await this.receiptRepository.update(
      { receiptNumber: receiptNumber }, // Where clause: find the payment by receiptNumber
      { approved: approved }, // What to update: set approved to the provided value
    );
  }

  createAddressBlock(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    name: string,
    address: string,
    phone: string,
    email: string,
  ): void {
    const lineHeight = 20;
    const valueXOffset = 80;

    doc
      .font('Helvetica-Bold')
      .text(name, x, y)
      .font('Helvetica')
      .text(address, x, y + lineHeight);

    doc
      .text(`Phone`, x, y + 2 * lineHeight)
      .text(`${phone}`, x + valueXOffset, y + 2 * lineHeight)
      .text(`Email`, x, y + 3 * lineHeight)
      .text(`${email}`, x + valueXOffset, y + 3 * lineHeight)
      .moveDown();
  }

  drawTable(
    doc: PDFKit.PDFDocument,
    data: BillsEntity[],
    balanceBfwd: BalancesEntity,
    startX: number,
    startY: number,
    columnWidths: number[],
    headers: string[],
    finalTotalAmount: number | string | null | undefined,
    headerColor = '#2196f3',
    textColor = '#2c3e50',
    amountAlign: 'left' | 'right' = 'right',
  ): number {
    const rowHeight = 21;
    const headerHeight = 28;
    const borderColor = '#e0e0e0';
    const font = 'Helvetica';
    const boldFont = 'Helvetica-Bold';
    const fontSize = 11;
    const headerFontSize = 11;
    const padding = 15;

    let y = startY;

    // Draw table headers with gradient background
    const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
    
    // Gradient-like header background (blue)
    doc
      .rect(startX, y, totalWidth, headerHeight)
      .fill(headerColor);

    doc.font(boldFont).fontSize(headerFontSize);
    headers.forEach((header, i) => {
      const columnX = startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
      
      doc
        .fillColor('#ffffff') // White text on blue background
        .text(
          header.toUpperCase(),
          columnX + padding,
          y + headerHeight / 2 - headerFontSize / 2,
          {
            width: columnWidths[i] - 2 * padding,
            align: i === headers.length - 1 ? amountAlign : 'left',
            lineBreak: false,
          },
        );
    });
    
    doc.fillColor(textColor); // Reset text color
    y += headerHeight;

    // --- Draw Balance B/Fwd row if balanceBfwd.amount > 0 ---
    if (balanceBfwd && balanceBfwd.amount > 0) {
      const totalRowWidth = columnWidths.reduce((a, b) => a + b, 0);
      
      // Orange background tint
      doc
        .rect(startX, y, totalRowWidth, rowHeight)
        .fillOpacity(0.05)
        .fill('#ff9800')
        .fillOpacity(1.0);

      // Orange left border accent
      doc.rect(startX, y, 3, rowHeight).fill('#ff9800');

      doc.font(font).fontSize(fontSize).fillColor(textColor);

      // Description
      const bfwdDate = this.formatDate(balanceBfwd.dateCreated);
      doc.text(
        `Balance Brought Forward`,
        startX + padding,
        y + 5,
        {
          width: columnWidths[0] - 2 * padding,
          align: 'left',
        },
      );
      doc
        .fontSize(9)
        .fillColor('#7f8c8d')
        .font('Helvetica-Oblique')
        .text(`as at ${bfwdDate}`, startX + padding, y + 18, {
          width: columnWidths[0] - 2 * padding,
          align: 'left',
        });

      // Amount
      doc
        .fontSize(fontSize)
        .fillColor(textColor)
        .font('Helvetica-Bold')
        .text(
          this.formatCurrency(balanceBfwd.amount),
          startX + columnWidths[0] + padding,
          y + rowHeight / 2 - fontSize / 2,
          {
            width: columnWidths[1] - 2 * padding,
            align: amountAlign,
          },
        );

      // Bottom border
      doc
        .strokeColor(borderColor)
        .lineWidth(1)
        .moveTo(startX, y + rowHeight)
        .lineTo(startX + totalRowWidth, y + rowHeight)
        .stroke();

      y += rowHeight;
    }

    // Draw table rows
    doc.font(font).fontSize(fontSize).fillColor(textColor);
    data.forEach((row) => {
      const isExemption = row.fees && row.fees.name === FeesNames.exemption;
      const totalRowWidth = columnWidths.reduce((a, b) => a + b, 0);

      // Green background for exemption rows
      if (isExemption) {
        doc
          .rect(startX, y, totalRowWidth, rowHeight)
          .fillOpacity(0.05)
          .fill('#4caf50')
          .fillOpacity(1.0);

        // Green left border accent
        doc.rect(startX, y, 3, rowHeight).fill('#4caf50');
      }

      headers.forEach((header, i) => {
        let text = '';
        let align: 'left' | 'right' = 'left';
        let rowTextColor = textColor;

        if (i === 0) {
          if (isExemption && row.fees.exemptionType) {
            text = 'Exemption';
            const exemptionDesc = `(${row.fees.exemptionType.replace(/_/g, ' ')}${
              row.fees.description ? `: ${row.fees.description}` : ''
            })`;
            // Description below in italic
            doc
              .fontSize(9)
              .fillColor('#7f8c8d')
              .font('Helvetica-Oblique')
              .text(exemptionDesc, startX + padding, y + 18, {
                width: columnWidths[0] - 2 * padding,
                align: 'left',
              });
          } else if (
            row.fees &&
            row.fees.name !== undefined &&
            row.fees.name !== null
          ) {
            text = this.feesNamesToString(row.fees.name);
          }
        } else if (i === 1) {
          if (isExemption) {
            const amount = Number(row.fees.amount);
            text = `-${this.formatCurrency(Math.abs(amount))}`;
            rowTextColor = '#4caf50';
          } else {
            text =
              row.fees &&
              row.fees.amount !== undefined &&
              row.fees.amount !== null
                ? this.formatCurrency(row.fees.amount)
                : '';
          }
          align = amountAlign;
        }

        doc.fillColor(rowTextColor);

        // Description text
        if (i === 0 && text) {
          doc
            .fontSize(fontSize)
            .font('Helvetica-Bold')
            .text(text, startX + padding, y + 5, {
              width: columnWidths[i] - 2 * padding,
              align: 'left',
            });
        } else if (i === 1) {
          doc
            .fontSize(fontSize)
            .font('Helvetica-Bold')
            .text(text, startX + columnWidths[0] + padding, y + rowHeight / 2 - fontSize / 2, {
              width: columnWidths[i] - 2 * padding,
              align: align,
            });
        }
      });

      // Bottom border
      doc
        .strokeColor(borderColor)
        .lineWidth(1)
        .moveTo(startX, y + rowHeight)
        .lineTo(startX + totalRowWidth, y + rowHeight)
        .stroke();

      y += rowHeight;
    });

    // --- Add the "Total" row with blue background ---
    const totalRowWidth = columnWidths.reduce((a, b) => a + b, 0);
    
    // Blue gradient background
    doc
      .rect(startX, y, totalRowWidth, rowHeight)
      .fillOpacity(0.1)
      .fill(headerColor)
      .fillOpacity(1.0);

    // Top border (blue, thicker)
    doc
      .strokeColor(headerColor)
      .lineWidth(2)
      .moveTo(startX, y)
      .lineTo(startX + totalRowWidth, y)
      .stroke();

    doc.font(boldFont).fontSize(14).fillColor(textColor);
    doc.text(
      'Total'.toUpperCase(),
      startX + padding,
      y + rowHeight / 2 - 7,
      {
        width: columnWidths[0] - 2 * padding,
        align: 'left',
      },
    );

    const displayTotalAmount = !isNaN(Number(finalTotalAmount))
      ? Number(finalTotalAmount)
      : 0;
    
    // Format total amount to prevent wrapping
    const totalAmountText = this.formatCurrency(displayTotalAmount);
    
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(headerColor)
      .text(
        totalAmountText,
        startX + columnWidths[0] + padding,
        y + rowHeight / 2 - 7,
        {
          width: columnWidths[1] - 2 * padding,
          align: amountAlign,
          lineBreak: false,
        },
      );
    
    y += rowHeight;

    return y;
  }

  private _getGrossBillAmount(bills: BillsEntity[]): number {
    return bills.reduce((sum, bill) => sum + (+bill.fees?.amount || 0), 0);
  }

  private _calculateExemptionAmount(invoiceData: InvoiceEntity): number {
    if (!invoiceData.exemption || !invoiceData.exemption.type) {
      return 0;
    }

    const exemption = invoiceData.exemption;
    let calculatedAmount = 0;

    switch (exemption.type) {
      case ExemptionType.FIXED_AMOUNT:
        if (
          exemption.fixedAmount !== undefined &&
          exemption.fixedAmount !== null
        ) {
          calculatedAmount = exemption.fixedAmount;
        }
        break;
      case ExemptionType.PERCENTAGE:
        if (
          exemption.percentageAmount !== undefined &&
          exemption.percentageAmount !== null
        ) {
          const grossBillAmount = this._getGrossBillAmount(invoiceData.bills);
          // console.log('Gross bill amount', grossBillAmount);
          calculatedAmount =
            grossBillAmount * (exemption.percentageAmount / 100);

          // console.log('calculated percentage amount', calculatedAmount);
        }
        break;
      case ExemptionType.STAFF_SIBLING:
        let totalFoodFee = 0;
        let totalOtherFees = 0;

        invoiceData.bills.forEach((bill) => {
          if (bill.fees) {
            if (bill.fees.name === FeesNames.foodFee) {
              totalFoodFee += +bill.fees.amount;
            } else {
              totalOtherFees += +bill.fees.amount;
            }
          }
        });

        calculatedAmount += +totalFoodFee * 0.5;
        calculatedAmount += +totalOtherFees;
        break;
      default:
        calculatedAmount = 0;
    }
    return calculatedAmount;
  }

  async generateInvoicePdf(invoiceData: InvoiceEntity): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const stream = new Stream.PassThrough();
    doc.pipe(stream);

    // Color constants matching frontend
    const primaryBlue = '#2196f3';
    const primaryBlueDark = '#1976d2';
    const textPrimary = '#2c3e50';
    const textSecondary = '#7f8c8d';
    const successGreen = '#4caf50';
    const warningOrange = '#ff9800';
    const errorRed = '#f44336';
    const accentGold = '#ffc107';

    let currentY = 50;

    // --- Document Header with Logo and Contact (Centered) ---
    const companyName = 'Junior High School';
    const companyAddress = '30588 Lundi Drive, Rhodene, Masvingo';
    const companyPhone = '+263 392 263 293 / +263 78 223 8026';
    const companyEmail = 'info@juniorhighschool.ac.zw';
    const companyWebsite = 'www.juniorhighschool.ac.zw';

    // Logo
    try {
      const imgPath = path.join(process.cwd(), 'public', 'jhs_logo.jpg');
      if (fs.existsSync(imgPath)) {
        doc.image(imgPath, 50, currentY, { width: 120, height: 120 });
      }
    } catch (e) {
      console.log('Error adding image:', e.message);
    }

    // Company info - positioned right after logo, left-aligned
    const logoWidth = 120;
    const logoEndX = 50 + logoWidth;
    const textStartX = logoEndX + 15;
    const textWidth = doc.page.width - textStartX - 50;

    // School name - left-aligned, uppercase, blue
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor(primaryBlue)
      .text(companyName.toUpperCase(), textStartX, currentY, {
        align: 'left',
        width: textWidth,
      });

    currentY += 20;

    // Address - left-aligned
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(textSecondary)
      .text(companyAddress, textStartX, currentY, {
        align: 'left',
        width: textWidth,
      });

    currentY += 16;

    // Phone - left-aligned
    doc.text(companyPhone, textStartX, currentY, {
      align: 'left',
      width: textWidth,
    });

    currentY += 16;

    // Email and Website on same line - left-aligned
    doc.text(
      `${companyEmail} | ${companyWebsite}`,
      textStartX,
      currentY,
      {
        align: 'left',
        width: textWidth,
      },
    );

    // Calculate where blue border should be (below both logo and text)
    const logoBottom = 50 + 120; // logo starts at 50, height is 120
    const textBottom = currentY + 12; // text ends at currentY, add some padding
    const borderY = Math.max(logoBottom, textBottom);

    currentY = borderY + 15;

    // Blue border bottom - positioned below both logo and text
    doc
      .strokeColor(primaryBlue)
      .lineWidth(2)
      .moveTo(50, currentY)
      .lineTo(doc.page.width - 50, currentY)
      .stroke();

    currentY += 15;

    // --- Invoice Title Section (with gradient background box) ---
    const titleBoxY = currentY;
    const titleBoxHeight = 58;
    
    // Gradient background box (light blue)
    doc
      .rect(50, titleBoxY, doc.page.width - 100, titleBoxHeight)
      .fillOpacity(0.08)
      .fill('#2196f3')
      .fillOpacity(1.0);
    
    // Left border accent (blue)
    doc
      .rect(50, titleBoxY, 4, titleBoxHeight)
      .fill(primaryBlue);

    // Invoice title text - left side
    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(textPrimary)
      .text('INVOICE', 70, titleBoxY + 8);

    // Term text below title
    doc
      .font('Helvetica')
      .fontSize(14)
      .fillColor(textSecondary)
      .text(
        `Term ${invoiceData.enrol.num} ${invoiceData.enrol.year}`,
        70,
        titleBoxY + 37,
      );

    // Invoice metadata - right side (each on separate lines)
    const invoiceNumber = invoiceData.invoiceNumber || 'N/A';
    const invoiceDate = invoiceData.invoiceDate
      ? new Date(invoiceData.invoiceDate)
      : new Date();
    const dueDate = invoiceData.invoiceDueDate
      ? new Date(invoiceData.invoiceDueDate)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const metaX = doc.page.width / 2 + 40;
    let metaY = titleBoxY + 12;

    // Invoice # on same line
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(textSecondary)
      .text('Invoice # ', metaX, metaY, { width: 50 });
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(textPrimary)
      .text(invoiceNumber, metaX + 50, metaY, { width: 120 });

    metaY += 18;

    // Date on its own line
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(textSecondary)
      .text('Date ', metaX, metaY, { width: 35 });
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(textPrimary)
      .text(this.formatDate(invoiceDate), metaX + 35, metaY, { width: 120 });

    metaY += 18;

    // Due Date on its own line
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(textSecondary)
      .text('Due Date ', metaX, metaY, { width: 60 });
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(textPrimary)
      .text(this.formatDate(dueDate), metaX + 60, metaY, { width: 120 });

    currentY = titleBoxY + titleBoxHeight + 15;

    // --- Bill To and Summary Section (Two Column Grid) ---
    const infoSectionY = currentY;
    const columnWidth = (doc.page.width - 120) / 2;
    const leftColumnX = 50;
    const rightColumnX = leftColumnX + columnWidth + 20;

    // Bill To Section (Left Column)
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(primaryBlue)
      .text('Bill To', leftColumnX, infoSectionY);

    // Blue underline
    doc
      .strokeColor(primaryBlue)
      .lineWidth(2)
      .moveTo(leftColumnX, infoSectionY + 18)
      .lineTo(leftColumnX + 150, infoSectionY + 18)
      .stroke();

    let billToY = infoSectionY + 30;
    const lineHeight = 18;

    // Name
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(textSecondary)
      .text('Name', leftColumnX, billToY, { width: 120 })
      .font('Helvetica')
      .fontSize(10)
      .fillColor(textPrimary)
      .text(
        `${invoiceData.student.surname} ${invoiceData.student.name}`,
        leftColumnX,
        billToY + 13,
        { width: columnWidth - 10 },
      );

    billToY += 30;

    // Student Number
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(textSecondary)
      .text('Student Number', leftColumnX, billToY, { width: 120 })
      .font('Helvetica')
      .fontSize(10)
      .fillColor(textPrimary)
      .text(
        invoiceData.student.studentNumber || 'N/A',
        leftColumnX,
        billToY + 13,
        { width: columnWidth - 10 },
      );

    billToY += 30;

    // Class
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(textSecondary)
      .text('Class', leftColumnX, billToY, { width: 120 })
      .font('Helvetica')
      .fontSize(10)
      .fillColor(textPrimary)
      .text(
        invoiceData.enrol.name || 'N/A',
        leftColumnX,
        billToY + 13,
        { width: columnWidth - 10 },
      );

    billToY += 30;

    // Residence
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(textSecondary)
      .text('Residence', leftColumnX, billToY, { width: 120 })
      .font('Helvetica')
      .fontSize(10)
      .fillColor(textPrimary)
      .text(
        invoiceData.enrol.residence || 'N/A',
        leftColumnX,
        billToY + 13,
        { width: columnWidth - 10 },
      );

    if (invoiceData.student.cell) {
      billToY += 30;
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(textSecondary)
        .text('Phone', leftColumnX, billToY, { width: 120 })
        .font('Helvetica')
        .fontSize(10)
        .fillColor(textPrimary)
        .text(invoiceData.student.cell, leftColumnX, billToY + 13, {
          width: columnWidth - 10,
        });
    }

    if (invoiceData.student.email) {
      billToY += 30;
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(textSecondary)
        .text('Email', leftColumnX, billToY, { width: 120 })
        .font('Helvetica')
        .fontSize(10)
        .fillColor(textPrimary)
        .text(invoiceData.student.email, leftColumnX, billToY + 13, {
          width: columnWidth - 10,
        });
    }

    const billToEndY = billToY + 35;

    // Invoice Summary Section (Right Column)
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(primaryBlue)
      .text('Invoice Summary', rightColumnX, infoSectionY);

    // Blue underline
    doc
      .strokeColor(primaryBlue)
      .lineWidth(2)
      .moveTo(rightColumnX, infoSectionY + 18)
      .lineTo(rightColumnX + 150, infoSectionY + 18)
      .stroke();

    let summaryY = infoSectionY + 30;
    const summaryItemHeight = 24;

    // Get status color based on invoice status
    const getStatusColor = (status: string): string => {
      const statusLower = status?.toLowerCase() || '';
      if (statusLower.includes('paid')) return successGreen;
      if (statusLower.includes('pending') || statusLower.includes('partially')) return warningOrange;
      if (statusLower.includes('overdue')) return errorRed;
      return textSecondary;
    };

    // Summary items with background boxes
    const summaryItems = [
      {
        label: 'Total Bill',
        value: this.formatCurrency(invoiceData.totalBill),
        highlight: false,
      },
      {
        label: 'Amount Paid',
        value: this.formatCurrency(invoiceData.amountPaidOnInvoice),
        highlight: false,
      },
      {
        label: 'Balance Due',
        value: this.formatCurrency(invoiceData.balance),
        highlight: true,
        color: errorRed,
      },
      {
        label: 'Status',
        value: invoiceData.status || 'N/A',
        highlight: false,
        isStatus: true,
        statusColor: getStatusColor(invoiceData.status || ''),
      },
    ];

    summaryItems.forEach((item, index) => {
      const itemY = summaryY + index * summaryItemHeight;

      // Background box (light blue)
      doc
        .rect(rightColumnX, itemY, columnWidth, 22)
        .fillOpacity(0.05)
        .fill(primaryBlue)
        .fillOpacity(1.0);

      // Left border accent
      doc.rect(rightColumnX, itemY, 3, 22).fill(primaryBlue);

      // Label and Value on same line, properly aligned
      const labelWidth = 100;
      const valueWidth = columnWidth - labelWidth - 20;
      
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(textSecondary)
        .text(item.label, rightColumnX + 10, itemY + 6, {
          width: labelWidth,
        });

      // Value - aligned right
      const valueColor = item.isStatus
        ? item.statusColor
        : item.highlight && item.color
        ? item.color
        : textPrimary;
      
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(valueColor)
        .text(item.value, rightColumnX + labelWidth + 10, itemY + 6, {
          width: valueWidth,
          align: 'right',
        });
    });

    currentY = Math.max(billToEndY, summaryY + summaryItems.length * summaryItemHeight) + 8;

    // --- Invoice Items Table ---
    const tableStartX = 50;
    const tableStartY = currentY;

    const columnWidths = [390, 100];
    const headers = ['Description', 'Amount'];

    const items = invoiceData.bills || [];

    // Check if an exemption entity exists and calculate its amount
    if (invoiceData.exemption) {
      const calculatedExemptionAmount =
        this._calculateExemptionAmount(invoiceData);

      // Add exemption as a line item if it's positive
      if (calculatedExemptionAmount > 0) {
        // Create a dummy FeesEntity instance for the exemption
        const exemptionFees: FeesEntity = {
          id: 0,
          name: FeesNames.exemption,
          amount: -calculatedExemptionAmount,
          description: 'Exemption Discount',
          bills: [],
          exemptionType: invoiceData.exemption.type,
        };

        // Create a dummy BillsEntity instance for the exemption row
        const exemptionBill: BillsEntity = {
          id: 0,
          date: new Date(),
          student: invoiceData.student,
          fees: exemptionFees,
          enrol: invoiceData.enrol,
          invoice: invoiceData,
        };
        items.push(exemptionBill);
      }
    }

    // Use gradient blue header color for table
    const tableEndY = this.drawTable(
      doc,
      items,
      invoiceData.balanceBfwd,
      tableStartX,
      tableStartY,
      columnWidths,
      headers,
      invoiceData.totalBill,
      primaryBlue, // headerColor
      textPrimary, // textColor
      'right', // amountAlign
    );

    currentY = tableEndY + 10;

    // --- Terms and Conditions Section (Gold/Amber background) ---
    const termsBoxY = currentY;
    const termsBoxHeight = 45;

    // Gold background box
    doc
      .rect(50, termsBoxY, doc.page.width - 100, termsBoxHeight)
      .fillOpacity(0.5)
      .fill('#fff3e0')
      .fillOpacity(1.0);

    // Left border accent (gold)
    doc.rect(50, termsBoxY, 4, termsBoxHeight).fill(accentGold);

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(textPrimary)
      .text('Terms and Conditions', 70, termsBoxY + 8);

    const termsText =
      'Payment is due within 30 days or before schools open, whichever comes first. Please include the Student Number on your payment.';

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(textSecondary)
      .text(termsText, 70, termsBoxY + 20, {
        width: doc.page.width - 140,
        lineGap: 2,
      });

    currentY = termsBoxY + termsBoxHeight + 10;

    // --- Banking Details Section ---
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(primaryBlue)
      .text('Banking Details', 50, currentY);

    // Blue underline
    doc
      .strokeColor(primaryBlue)
      .lineWidth(2)
      .moveTo(50, currentY + 16)
      .lineTo(200, currentY + 16)
      .stroke();

    currentY += 24;

    // Banking details grid - more compact
    const bankingDetails = [
      { label: 'Account Name', value: 'JUNIOR HIGH SCHOOL' },
      { label: 'Bank', value: 'ZB BANK' },
      { label: 'Branch', value: 'MASVINGO' },
      {
        label: 'Account Number',
        value: '4564 00321642 405',
        highlight: true,
      },
    ];

    bankingDetails.forEach((item) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(textSecondary)
        .text(item.label, 50, currentY, { width: 140 });
      doc
        .font(item.highlight ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(item.highlight ? 10 : 9)
        .fillColor(item.highlight ? primaryBlue : textPrimary)
        .text(item.value, 190, currentY, { width: 250 });

      currentY += 14;
    });

    currentY += 8;

    // --- Footer ---
    // Top border
    doc
      .strokeColor('#e0e0e0')
      .lineWidth(1)
      .moveTo(50, currentY)
      .lineTo(doc.page.width - 50, currentY)
      .stroke();

    currentY += 8;

    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor(textSecondary)
      .text('Thank you for your business!', 50, currentY, {
        align: 'center',
        width: doc.page.width - 100,
      });

    doc.end();

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  feesNamesToString(
    feesName: FeesNames,
    exemptionTypeFromBill?: ExemptionType,
  ) {
    switch (feesName) {
      case FeesNames.aLevelApplicationFee:
        return 'A Level Application Fee';
      case FeesNames.aLevelTuitionBoarder:
        return 'A Level Boarder Tuition';
      case FeesNames.aLevelTuitionDay:
        return 'A Level Day Tuition';
      case FeesNames.alevelScienceFee:
        return 'A Level Science Fee';
      case FeesNames.deskFee:
        return 'Desk Fee';
      case FeesNames.developmentFee:
        return 'Development Fee';
      case FeesNames.foodFee:
        return 'Food Fee';
      case FeesNames.oLevelApplicationFee:
        return 'O Level Application Fee';
      case FeesNames.oLevelScienceFee:
        return 'O Level Science Fee';
      case FeesNames.oLevelTuitionBoarder:
        return 'O Level Boarder Tuition';
      case FeesNames.oLevelTuitionDay:
        return 'O Level Day Tuition';
      case FeesNames.transportFee:
        return 'Transport Fee';
      case FeesNames.exemption:
        if (exemptionTypeFromBill) {
          return `Exemption (${exemptionTypeFromBill.replace(/_/g, ' ')})`;
        }
        return 'Exemption';
      default:
        return String(feesName);
    }
  }

  generateReceiptNumber() {
    const timestamp = Date.now();
    const random = Math.random();
    const hash = crypto
      .createHash('md5')
      .update(`${timestamp}-${random}`)
      .digest('hex')
      .slice(0, 6) // Take first 6 characters
      .toUpperCase();
    return `REC-${hash}`;
  }

  // --- Helper to convert mm to points ---
  private mmToPt(mm: number): number {
    return mm * 2.83465; // 1mm = 2.83465 points
  }

  // --- Helper to convert px to points (for CSS px values) ---
  private pxToPt(px: number): number {
    return px * 0.75; // Common conversion, adjust if results are off
  }

  // --- Helper for formatting currency (replicates Angular's currency pipe) ---
  private formatCurrency(amount: number): string {
    // Ensure amount is treated as a number for Intl.NumberFormat
    const numericAmount =
      typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  }

  // --- Helper for formatting date (replicates Angular's shortDate pipe) ---
  private formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    // For 'shortDate' equivalent: 'M/d/yy' or 'MMM d, yyyy'
    // Let's use 'MMM d, yyyy' for clarity in PDF
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  }

  async generateReceiptPdf(receipt: ReceiptEntity): Promise<Buffer> {
    // --- PDF Document Constants (A4 in Points) ---
    const pageHeight = 841.89; // A4 height
    const pageWidth = 595.28; // A4 width

    // --- Margins (converting 15mm from your CSS to points) ---
    const pageMargin = this.mmToPt(15);
    const contentWidth = pageWidth - 2 * pageMargin;

    // --- Font Settings (using Helvetica as it's built-in and resembles Arial) ---
    const defaultFont = 'Helvetica';
    const defaultFontBold = 'Helvetica-Bold';
    const defaultFontSize = 10;
    const headerTitleFontSize = 24; // 2em
    const sectionHeadingFontSize = 13; // 1.1em
    const totalRowFontSize = 12; // 1.1em
    const footerFontSize = 9; // 0.85em
    const detailItemFontSize = 10; // 0.9em

    // const logoPath = join(process.cwd(), 'assets', 'jhs_logo.jpg');
    // Corrected path using process.cwd()
    const logoPath = path.join(process.cwd(), 'public', 'jhs_logo.jpg');
    // console.log('Attempting to load image from:', imgPath); // For debugging

    return new Promise(async (resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0, // Manage margins manually for precise control
        layout: 'portrait',
        bufferPages: true, // Essential for calculating page breaks and total pages if content flows
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      let currentY = this.mmToPt(15); // Start at 15mm from top (like your CSS padding)

      // ========================== Header Section ==========================
      const headerBarHeight = this.mmToPt(55); // Increased height to accommodate logo with tagline
      const headerBarY = currentY;

      // 2. Receipt Title ("RECEIPT") and Status Badge - Calculate title position first
      const titleText = 'RECEIPT';
      doc.font(defaultFontBold).fontSize(30); // Larger, more prominent
      const titleWidth = doc.widthOfString(titleText);
      const titleX = pageWidth / 2 - titleWidth / 2;
      const titleY = headerBarY + this.mmToPt(8);

      // 1. Logo Container - aligned with RECEIPT text (matching frontend glassy shade effect)
      const logoWidthPt = this.pxToPt(100); // Logo width
      const logoHeightPt = this.pxToPt(100); // Logo height
      const logoPadding = this.mmToPt(2); // Padding inside container
      const logoContainerWidth = logoWidthPt + logoPadding * 2;
      const logoContainerHeight = logoHeightPt + logoPadding * 2;
      const logoX = pageMargin;
      // Align container top with RECEIPT title top
      const logoContainerY = titleY;

      // Draw logo container with glassy shade effect (matching frontend)
      doc.save();
      // Background with subtle grey (glassy shade)
      doc.fillColor('#f5f7fa'); // Light grey background matching frontend
      doc.roundedRect(logoX, logoContainerY, logoContainerWidth, logoContainerHeight, 3)
        .fill();
      // Border (light grey)
      doc.strokeColor('#e0e0e0'); // Border color
      doc.lineWidth(0.5);
      doc.roundedRect(logoX, logoContainerY, logoContainerWidth, logoContainerHeight, 3)
        .stroke();
      doc.restore();

      // Logo image inside container
      const logoImageX = logoX + logoPadding;
      const logoImageY = logoContainerY + logoPadding;

      try {
        if (fs.existsSync(logoPath)) {
          // Load image to show full logo including tagline
          doc.image(logoPath, logoImageX, logoImageY, {
            width: logoWidthPt,
            height: logoHeightPt
          });
        } else {
          doc
            .fillColor('#ccc')
            .text(
              'LOGO',
              logoImageX + logoWidthPt / 2 - doc.widthOfString('LOGO') / 2,
              logoImageY + logoHeightPt / 2 - doc.currentLineHeight() / 2,
            );
        }
      } catch (error) {
        doc.fillColor('red').text('LOGO_ERR', logoImageX, logoImageY + logoHeightPt / 2);
      }
      doc.fillColor('#000'); // Reset fill color
      
      // Draw title after logo positioning
      doc.fillColor('#2196f3'); // Blue color for title
      doc.text(titleText, titleX, titleY);
      doc.fillColor('#000'); // Reset

      // Status Badge (Approved/Pending)
      const statusText = receipt.approved ? 'APPROVED' : 'PENDING';
      const statusColor = receipt.approved ? '#4caf50' : '#ff9800'; // Green for approved, orange for pending
      const statusBgColor = receipt.approved ? '#e8f5e9' : '#fff3e0'; // Light green background for approved, light orange for pending
      doc.font(defaultFontBold).fontSize(9);
      const statusBadgeWidth = doc.widthOfString(statusText) + this.mmToPt(4);
      const statusBadgeHeight = doc.currentLineHeight() + this.mmToPt(2);
      const statusX = pageWidth / 2 - statusBadgeWidth / 2;
      // Position badge below RECEIPT text with increased spacing
      const statusY = titleY + doc.currentLineHeight() + this.mmToPt(8);
      
      // Draw badge background with proper colors
      doc.save();
      doc.fillColor(statusBgColor);
      doc.roundedRect(statusX - this.mmToPt(2), statusY, statusBadgeWidth, statusBadgeHeight, 3).fill();
      doc.restore();
      
      // Draw badge border
      doc.save();
      doc.strokeColor(statusColor);
      doc.lineWidth(1);
      doc.roundedRect(statusX - this.mmToPt(2), statusY, statusBadgeWidth, statusBadgeHeight, 3).stroke();
      doc.restore();
      
      // Draw badge text
      doc.fillColor(statusColor);
      doc.text(statusText, statusX, statusY + this.mmToPt(1));
      doc.fillColor('#000'); // Reset

      // Position meta section below the logo (not just below status badge)
      // Calculate the bottom of the logo container
      const logoBottom = logoContainerY + logoContainerHeight;
      // Ensure meta section starts below logo with reduced spacing
      currentY = Math.max(statusY + statusBadgeHeight, logoBottom) + this.mmToPt(8); // Space after header

      // ========================== Receipt Details ==========================
      const detailsPadding = this.mmToPt(5);
      const detailsBoxY = currentY;
      const detailsBoxHeight = this.mmToPt(30); // Reduced height
      
      // Draw background box for details
      doc.roundedRect(pageMargin, detailsBoxY, contentWidth, detailsBoxHeight, 6)
        .fillAndStroke('#f5f5f5', '#e0e0e0');
      
      currentY += detailsPadding;

      // Set up for detail items
      doc.font(defaultFont).fontSize(8); // Label size
      const detailItemWidth = contentWidth / 3;
      const detailItemHeight = this.mmToPt(20);

      // Detail Item 1: Receipt #
      let detailX = pageMargin + this.mmToPt(6);
      let detailY = currentY;
      doc.fillColor('#7f8c8d').text('RECEIPT #', detailX, detailY);
      doc.font(defaultFontBold).fontSize(11).fillColor('#000');
      doc.text(receipt.receiptNumber || 'N/A', detailX, detailY + this.mmToPt(5));

      // Detail Item 2: Payment Date
      detailX = pageMargin + detailItemWidth + this.mmToPt(6);
      detailY = currentY;
      doc.font(defaultFont).fontSize(8).fillColor('#7f8c8d');
      doc.text('PAYMENT DATE', detailX, detailY);
      doc.font(defaultFontBold).fontSize(11).fillColor('#000');
      doc.text(this.formatDate(receipt.paymentDate), detailX, detailY + this.mmToPt(5));

      // Detail Item 3: Payment Method
      detailX = pageMargin + 2 * detailItemWidth + this.mmToPt(6);
      detailY = currentY;
      doc.font(defaultFont).fontSize(8).fillColor('#7f8c8d');
      doc.text('PAYMENT METHOD', detailX, detailY);
      doc.font(defaultFontBold).fontSize(11).fillColor('#000');
      doc.text(receipt.paymentMethod || 'N/A', detailX, detailY + this.mmToPt(5));

      currentY = detailsBoxY + detailsBoxHeight + this.mmToPt(8); // Space after details

      // ========================== From / To Section ==========================
      // Section Header
      doc.font(defaultFontBold).fontSize(sectionHeadingFontSize).fillColor('#000');
      const sectionHeaderY = currentY;
      doc.text('PARTIES', pageMargin, sectionHeaderY);
      
      // Draw underline
      doc.strokeColor('#2196f3').lineWidth(2);
      doc.moveTo(pageMargin, sectionHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .lineTo(pageMargin + doc.widthOfString('PARTIES'), sectionHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .stroke();
      
      currentY += doc.currentLineHeight() + this.mmToPt(5); // Reduced spacing

      const partyBlockWidth = contentWidth / 2 - this.mmToPt(6); // Reduced gap
      const partyBlockPadding = this.mmToPt(4); // Reduced padding
      const lineSpacing = this.mmToPt(3); // Reduced line spacing

      // From Block (Student) - Left side
      const fromBlockX = pageMargin;
      const fromBlockY = currentY;
      const fromBlockHeight = this.mmToPt(45); // Reduced height
      
      // Draw From block background
      doc.roundedRect(fromBlockX, fromBlockY, partyBlockWidth, fromBlockHeight, 5)
        .fillAndStroke('#f5f7fa', '#2196f3');
      doc.rect(fromBlockX, fromBlockY, 4, fromBlockHeight).fill('#2196f3'); // Left border
      
      // From Block Heading
      doc.font(defaultFontBold).fontSize(11).fillColor('#000');
      doc.text('FROM', fromBlockX + partyBlockPadding, fromBlockY + partyBlockPadding);
      
      let fromContentY = fromBlockY + partyBlockPadding + doc.currentLineHeight() + this.mmToPt(2); // Reduced spacing
      doc.font(defaultFont).fontSize(defaultFontSize).fillColor('#000');
      
      // Student name (bold)
      if (receipt.student) {
        doc.font(defaultFontBold).fontSize(10);
        doc.text(
          `${receipt.student.name} ${receipt.student.surname} (${receipt.student.studentNumber})`,
          fromBlockX + partyBlockPadding,
          fromContentY,
          { width: partyBlockWidth - partyBlockPadding * 2 }
        );
        fromContentY += doc.currentLineHeight() + lineSpacing;
        doc.font(defaultFont).fontSize(9);
        
        if (receipt.enrol) {
          doc.text(
            `Enrolled in ${receipt.enrol.name} Term ${receipt.enrol.num}, ${receipt.enrol.year}`,
            fromBlockX + partyBlockPadding,
            fromContentY,
            { width: partyBlockWidth - partyBlockPadding * 2 }
          );
          fromContentY += doc.currentLineHeight() + lineSpacing;
        }
        
        if (receipt.student.address) {
          doc.text(
            receipt.student.address,
            fromBlockX + partyBlockPadding,
            fromContentY,
            { width: partyBlockWidth - partyBlockPadding * 2 }
          );
          fromContentY += doc.currentLineHeight() + lineSpacing;
        }
        
        if (receipt.student.cell) {
          doc.text(
            receipt.student.cell,
            fromBlockX + partyBlockPadding,
            fromContentY,
            { width: partyBlockWidth - partyBlockPadding * 2 }
          );
          fromContentY += doc.currentLineHeight() + lineSpacing;
        }
        
        if (receipt.student.email) {
          doc.text(
            receipt.student.email,
            fromBlockX + partyBlockPadding,
            fromContentY,
            { width: partyBlockWidth - partyBlockPadding * 2 }
          );
        }
      }

      // To Block (School) - Right side
      const toBlockX = pageMargin + partyBlockWidth + this.mmToPt(6); // Reduced gap
      const toBlockY = currentY;
      const toBlockHeight = this.mmToPt(45); // Reduced height
      
      // Draw To block background
      doc.roundedRect(toBlockX, toBlockY, partyBlockWidth, toBlockHeight, 5)
        .fillAndStroke('#f5f7fa', '#4caf50');
      doc.rect(toBlockX, toBlockY, 4, toBlockHeight).fill('#4caf50'); // Left border (green)
      
      // To Block Heading
      doc.font(defaultFontBold).fontSize(11).fillColor('#000');
      doc.text('TO', toBlockX + partyBlockPadding, toBlockY + partyBlockPadding);
      
      let toContentY = toBlockY + partyBlockPadding + doc.currentLineHeight() + this.mmToPt(2); // Reduced spacing
      doc.font(defaultFont).fontSize(defaultFontSize).fillColor('#000');
      
      // School name (bold)
      doc.font(defaultFontBold).fontSize(10);
      doc.text('Junior High School', toBlockX + partyBlockPadding, toContentY);
      toContentY += doc.currentLineHeight() + lineSpacing;
      doc.font(defaultFont).fontSize(9);
      
      doc.text('30588 Lundi Drive, Rhodene, Masvingo', toBlockX + partyBlockPadding, toContentY);
      toContentY += doc.currentLineHeight() + lineSpacing;
      doc.text('+263 392 263 293', toBlockX + partyBlockPadding, toContentY);
      toContentY += doc.currentLineHeight() + lineSpacing;
      doc.text('+263 78 223 8026', toBlockX + partyBlockPadding, toContentY);
      toContentY += doc.currentLineHeight() + lineSpacing;
      doc.text('info@juniorhighschool.ac.zw', toBlockX + partyBlockPadding, toContentY);

      currentY = Math.max(fromBlockY + fromBlockHeight, toBlockY + toBlockHeight) + this.mmToPt(8); // Reduced spacing

      // ========================== Summary Section ==========================
      // Section Header
      doc.font(defaultFontBold).fontSize(sectionHeadingFontSize).fillColor('#000');
      const summaryHeaderY = currentY;
      doc.text('PAYMENT SUMMARY', pageMargin, summaryHeaderY);
      
      // Draw underline
      doc.strokeColor('#2196f3').lineWidth(2);
      doc.moveTo(pageMargin, summaryHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .lineTo(pageMargin + doc.widthOfString('PAYMENT SUMMARY'), summaryHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .stroke();
      
      currentY += doc.currentLineHeight() + this.mmToPt(6); // Reduced spacing

      const summaryBoxY = currentY;
      const summaryBoxHeight = this.mmToPt(42); // Reduced height
      
      // Draw summary box background
      doc.roundedRect(pageMargin, summaryBoxY, contentWidth, summaryBoxHeight, 6)
        .fillAndStroke('#f5f5f5', '#e0e0e0');
      
      let summaryY = summaryBoxY + this.mmToPt(4); // Reduced padding
      const rowHeight = this.mmToPt(12);
      const padding = this.mmToPt(4);
      const valueStartX = pageWidth - pageMargin - padding; // Right edge minus padding

      // Invoice Paid Row
      doc.font(defaultFont).fontSize(9).fillColor('#7f8c8d');
      doc.text('INVOICE PAID', pageMargin + padding, summaryY);
      
      const invoiceNumbersString = receipt.allocations && receipt.allocations.length > 0
        ? receipt.allocations
            .map((all) => all.invoice?.invoiceNumber || 'N/A')
            .join(', ')
        : 'None';
      
      doc.font(defaultFontBold).fontSize(10).fillColor('#000');
      // Right-align invoice number
      const invoiceWidth = doc.widthOfString(invoiceNumbersString);
      doc.text(invoiceNumbersString, valueStartX - invoiceWidth, summaryY);
      
      // Draw separator line
      summaryY += doc.currentLineHeight() + this.mmToPt(1.5); // Reduced spacing
      doc.strokeColor('#ddd').lineWidth(0.5);
      doc.moveTo(pageMargin + padding, summaryY)
        .lineTo(pageWidth - pageMargin - padding, summaryY)
        .stroke();
      
      summaryY += this.mmToPt(3); // Reduced spacing

      // Amount Paid Row (Green)
      doc.font(defaultFont).fontSize(9).fillColor('#7f8c8d');
      doc.text('AMOUNT PAID', pageMargin + padding, summaryY);
      
      doc.font(defaultFontBold).fontSize(11).fillColor('#4caf50');
      // Right-align amount paid
      const amountPaidText = this.formatCurrency(receipt.amountPaid);
      const amountPaidWidth = doc.widthOfString(amountPaidText);
      doc.text(amountPaidText, valueStartX - amountPaidWidth, summaryY);
      
      // Draw separator line (green)
      summaryY += doc.currentLineHeight() + this.mmToPt(1.5); // Reduced spacing
      doc.strokeColor('#4caf50').lineWidth(1.5);
      doc.moveTo(pageMargin + padding, summaryY)
        .lineTo(pageWidth - pageMargin - padding, summaryY)
        .stroke();
      
      summaryY += this.mmToPt(3); // Reduced spacing

      // Amount Outstanding Row (Red)
      doc.font(defaultFont).fontSize(9).fillColor('#7f8c8d');
      doc.text('AMOUNT OUTSTANDING', pageMargin + padding, summaryY);
      
      const amountOutstanding = receipt.student 
        ? await this.getStudentBalance(receipt.student.studentNumber)
        : { amountDue: 0 };
      
      doc.font(defaultFontBold).fontSize(11).fillColor('#f44336');
      // Right-align amount outstanding
      const amountOutstandingText = this.formatCurrency(amountOutstanding.amountDue);
      const amountOutstandingWidth = doc.widthOfString(amountOutstandingText);
      doc.text(amountOutstandingText, valueStartX - amountOutstandingWidth, summaryY);
      
      doc.fillColor('#000'); // Reset color

      currentY = summaryBoxY + summaryBoxHeight + this.mmToPt(8); // Space after summary (reduced)

      // ========================== Remarks ==========================
      currentY += this.mmToPt(6); // Reduced extra space for remarks
      doc
        .font(defaultFontBold)
        .fontSize(sectionHeadingFontSize)
        .fillColor('#000');
      const remarksHeaderY = currentY;
      doc.text('REMARKS:', pageMargin, remarksHeaderY);
      
      // Draw underline
      doc.strokeColor('#2196f3').lineWidth(2);
      doc.moveTo(pageMargin, remarksHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .lineTo(pageMargin + doc.widthOfString('REMARKS:'), remarksHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .stroke();

      currentY += doc.currentLineHeight() + this.mmToPt(5); // Reduced spacing

      doc.font(defaultFont).fontSize(defaultFontSize).fillColor('#000');
      const remarksText =
        receipt.description ||
        'Thank You For Your Prompt Payment, We Appreciate Your Business';
      doc.text(remarksText, pageMargin, currentY, {
        width: contentWidth,
        align: 'left',
      });

      // ========================== Footer ==========================
      const footerContentHeight = this.mmToPt(18); // Reduced height for footer text
      const footerBorderTopOffset = this.mmToPt(8); // Reduced space from content to footer line
      const footerPaddingTop = this.mmToPt(4); // Reduced padding

      // Calculate the Y position for the footer, ensuring it's at the bottom if content is short
      const minFooterY =
        pageHeight - pageMargin - footerContentHeight - footerPaddingTop;
      const actualFooterY = Math.max(doc.y + footerBorderTopOffset, minFooterY);

      doc.strokeColor('#eee').lineWidth(1);
      doc
        .moveTo(pageMargin, actualFooterY)
        .lineTo(pageWidth - pageMargin, actualFooterY)
        .stroke();

      doc.font(defaultFont).fontSize(footerFontSize).fillColor('#777');

      doc.text(
        `served by : ${receipt.servedBy}`,
        pageMargin,
        actualFooterY + footerPaddingTop,
        {
          width: contentWidth,
          align: 'center',
        },
      );
      doc.text(
        'Thank you for your business!',
        pageMargin,
        actualFooterY + footerPaddingTop + doc.currentLineHeight() * 1.2,
        {
          width: contentWidth,
          align: 'center',
        },
      );

      // ========================== Void Overlay (drawn on top) ==========================
      if (receipt.isVoided) {
        // Draw semi-transparent overlay
        doc.save();
        doc.fillOpacity(0.25);
        doc.rect(0, 0, pageWidth, pageHeight).fill('#000');
        doc.restore();
        
        // Draw large diagonal VOID text
        doc.save();
        doc.translate(pageWidth / 2, pageHeight / 2);
        doc.rotate(45);
        doc.font(defaultFontBold).fontSize(72).fillColor('#f44336');
        const voidText = 'VOIDED';
        const voidWidth = doc.widthOfString(voidText);
        doc.text(voidText, -voidWidth / 2, 0, {
          align: 'center',
          width: voidWidth
        });
        doc.restore();
        
        // Void details at bottom
        doc.font(defaultFontBold).fontSize(16).fillColor('#f44336');
        doc.text('VOIDED', pageWidth / 2, pageHeight - this.mmToPt(40), {
          align: 'center',
          width: contentWidth
        });
        
        if (receipt.voidedBy) {
          doc.font(defaultFont).fontSize(10).fillColor('#666');
          doc.text(`By: ${receipt.voidedBy}`, pageWidth / 2, pageHeight - this.mmToPt(35), {
            align: 'center',
            width: contentWidth
          });
        }
        
        if (receipt.voidedAt) {
          doc.font(defaultFont).fontSize(10).fillColor('#666');
          doc.text(`On: ${this.formatDate(receipt.voidedAt)}`, pageWidth / 2, pageHeight - this.mmToPt(30), {
            align: 'center',
            width: contentWidth
          });
        }
      }

      // --- Finalize Document ---
      doc.end();
    });
  }

  private getInvoiceStatus(invoice: InvoiceEntity): InvoiceStatus {
    if (invoice.balance <= 0.0) {
      // Use a small epsilon for floating point comparison if necessary, but 0.00 is typically safe for decimal types
      return InvoiceStatus.Paid;
    }
    if (invoice.amountPaidOnInvoice > 0.0) {
      return InvoiceStatus.PartiallyPaid;
    }
    // You might also want to check invoiceDueDate for Overdue status
    if (new Date() > invoice.invoiceDueDate) {
      return InvoiceStatus.Overdue;
    }
    return InvoiceStatus.Pending;
  }
}

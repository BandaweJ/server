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
    if (+balanceBfwd.amount > 0) {
      newInv.balanceBfwd = balanceBfwd;
      newInv.totalBill = +newInv.totalBill + +balanceBfwd.amount;
    }
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
    headerColor = '#96d4d4',
    textColor = '#000000',
    amountAlign: 'left' | 'right' = 'right',
  ): number {
    const rowHeight = 20;
    const headerHeight = 25;
    const borderColor = '#96d4d4';
    const font = 'Helvetica';
    const boldFont = 'Helvetica-Bold';
    const fontSize = 10;
    const headerFontSize = 10;
    const padding = 5;

    let y = startY;

    // Draw table headers
    doc.font(boldFont).fontSize(headerFontSize);
    headers.forEach((header, i) => {
      doc
        .rect(
          startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0),
          y,
          columnWidths[i],
          headerHeight,
        )
        .fill(headerColor)
        .stroke(borderColor)
        .fillColor('#000000')
        .text(
          header,
          startX +
            columnWidths.slice(0, i).reduce((a, b) => a + b, 0) +
            padding,
          y + headerHeight / 2 - headerFontSize / 2,
          {
            width: columnWidths[i] - 2 * padding,
            align: i === headers.length - 1 ? amountAlign : 'left',
          },
        );
    });
    y += headerHeight;

    // --- Draw Balance B/Fwd row if balanceBfwd.amount > 0 ---
    if (balanceBfwd && balanceBfwd.amount > 0) {
      doc.font(font).fontSize(fontSize).fillColor(textColor);

      doc
        .rect(
          startX,
          y,
          columnWidths.reduce((a, b) => a + b, 0),
          rowHeight,
        )
        .stroke(borderColor);

      doc.text(
        'Balance B/Fwd as at ' +
          new Date(balanceBfwd.dateCreated).toLocaleDateString(),
        startX + padding,
        y + rowHeight / 2 - fontSize / 2,
        {
          width: columnWidths[0] - 2 * padding,
          align: 'left',
        },
      );

      doc.text(
        `\$${balanceBfwd.amount.toFixed(2)}`,
        startX + columnWidths[0] + padding,
        y + rowHeight / 2 - fontSize / 2,
        {
          width: columnWidths[1] - 2 * padding,
          align: amountAlign,
        },
      );
      y += rowHeight;
    }

    // Draw table rows
    doc.font(font).fontSize(fontSize).fillColor(textColor);
    data.forEach((row) => {
      headers.forEach((header, i) => {
        let text = '';
        let align: 'left' | 'right' = 'left';
        let rowTextColor = textColor; // Default text color

        if (i === 0) {
          if (
            row.fees &&
            row.fees.name === FeesNames.exemption &&
            row.fees.exemptionType
          ) {
            text = this.feesNamesToString(
              row.fees.name,
              row.fees.exemptionType,
            );
            rowTextColor = 'green'; // Red color for exemption text
          } else if (
            row.fees &&
            row.fees.name !== undefined &&
            row.fees.name !== null
          ) {
            text = this.feesNamesToString(row.fees.name);
          }
        } else if (i === 1) {
          if (row.fees && row.fees.name === FeesNames.exemption) {
            const amount = Number(row.fees.amount);
            text = `-\$${Math.abs(amount).toFixed(2)}`; // Format: -$1,000.00
            rowTextColor = 'green'; // Red color for exemption amount
          } else {
            text =
              row.fees &&
              row.fees.amount !== undefined &&
              row.fees.amount !== null
                ? '$' + Number(row.fees.amount).toFixed(2)
                : '';
          }
          align = amountAlign;
        }

        doc
          .rect(
            startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0),
            y,
            columnWidths[i],
            rowHeight,
          )
          .stroke(borderColor)
          .fillColor(rowTextColor) // Apply row-specific text color
          .text(
            text,
            startX +
              columnWidths.slice(0, i).reduce((a, b) => a + b, 0) +
              padding,
            y + rowHeight / 2 - fontSize / 2,
            {
              width: columnWidths[i] - 2 * padding,
              align: align,
            },
          );
      });
      y += rowHeight;
    });

    // --- Add the "Total" row within the table ---
    doc.font(boldFont).fontSize(fontSize).fillColor(textColor);
    doc
      .rect(
        startX,
        y,
        columnWidths.reduce((a, b) => a + b, 0),
        rowHeight,
      )
      .stroke(borderColor);

    doc.text('Total', startX + padding, y + rowHeight / 2 - fontSize / 2, {
      width: columnWidths[0] - 2 * padding,
      align: 'left',
    });

    const displayTotalAmount = !isNaN(Number(finalTotalAmount))
      ? Number(finalTotalAmount)
      : 0;
    doc.font(font);
    doc.text(
      `\$${displayTotalAmount.toFixed(2)}`,
      startX + columnWidths[0] + padding,
      y + rowHeight / 2 - fontSize / 2,
      {
        width: columnWidths[1] - 2 * padding,
        align: amountAlign,
      },
    );
    y += rowHeight;

    // Draw the final thick line after the total row
    doc
      .strokeColor('#000000')
      .lineWidth(2)
      .moveTo(startX, y)
      .lineTo(startX + columnWidths.reduce((a, b) => a + b, 0), y)
      .stroke();

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

    // --- Document Header (Company Info & Logo) ---
    const companyName = 'Junior High School';
    const companyAddress = '30588 Lundi Drive, Rhodene, Masvingo';
    const companyPhone = '+263 392 263 293 / +263 78 223 8026';
    const companyEmail = 'info@juniorhighschool.ac.zw';

    try {
      const imgPath = path.join(process.cwd(), 'public', 'jhs_logo.jpg');
      const imgBuffer = fs.readFileSync(imgPath);
      doc.image(imgBuffer, 50, 30, { width: 100 });
    } catch (e) {
      console.log('Error adding image:', e.message);
    }

    const companyInfoX = 200;
    this.createAddressBlock(
      doc,
      companyInfoX,
      50,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
    );

    // --- Invoice Title ---
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(
        'INVOICE FOR TERM ' +
          invoiceData.enrol.num +
          ' ' +
          invoiceData.enrol.year,
        50,
        150,
        { align: 'left' },
      );

    // --- Invoice Details (Right Side) ---
    const invoiceDetailsLabelX = 380;
    const invoiceDetailsValueX = invoiceDetailsLabelX + 80;
    const invoiceNumber = invoiceData.invoiceNumber || 'N/A';
    const invoiceDate = invoiceData.invoiceDate
      ? new Date(invoiceData.invoiceDate)
      : new Date();
    const dueDate = invoiceData.invoiceDueDate
      ? new Date(invoiceData.invoiceDueDate)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const dateFormatOptions: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    };

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(`Invoice #:`, invoiceDetailsLabelX, 150)
      .font('Helvetica')
      .text(invoiceNumber, invoiceDetailsValueX, 150)
      .font('Helvetica-Bold')
      .text(`Date:`, invoiceDetailsLabelX, 170)
      .font('Helvetica')
      .text(
        invoiceDate.toLocaleDateString('en-GB', dateFormatOptions),
        invoiceDetailsValueX,
        170,
      )
      .font('Helvetica-Bold')
      .text(`Due Date:`, invoiceDetailsLabelX, 190)
      .font('Helvetica')
      .text(
        dueDate.toLocaleDateString('en-GB', dateFormatOptions),
        invoiceDetailsValueX,
        190,
      );

    // --- Bill To Address & Student Details (Left Side, grid-like) ---
    const billToStartY = 220;
    const studentLabelX = 50;
    const studentValueX = studentLabelX + 80;
    const studentLineHeight = 18;

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#3185fc')
      .text('Bill To:', studentLabelX, billToStartY)
      .font('Helvetica')
      .fillColor('#000');

    // Student Name
    doc
      .text(`Student:`, studentLabelX, billToStartY + studentLineHeight)
      .text(
        `${invoiceData.student.name} ${invoiceData.student.surname}`,
        studentValueX,
        billToStartY + studentLineHeight,
      );

    // Class
    doc
      .text(`Class:`, studentLabelX, billToStartY + 2 * studentLineHeight)
      .text(
        `${invoiceData.enrol.name}`,
        studentValueX,
        billToStartY + 2 * studentLineHeight,
      );

    // Term (Num and Year)
    doc
      .text(`Term:`, studentLabelX, billToStartY + 3 * studentLineHeight)
      .text(
        `${invoiceData.enrol.num} ${invoiceData.enrol.year}`,
        studentValueX,
        billToStartY + 3 * studentLineHeight,
      );

    // Residence
    doc
      .text(`Residence:`, studentLabelX, billToStartY + 4 * studentLineHeight)
      .text(
        `${invoiceData.enrol.residence}`,
        studentValueX,
        billToStartY + 4 * studentLineHeight,
      );

    let currentStudentDetailY = billToStartY + 4 * studentLineHeight;

    // Phone (if available)
    if (invoiceData.student.cell) {
      currentStudentDetailY += studentLineHeight;
      doc
        .text(`Phone:`, studentLabelX, currentStudentDetailY)
        .text(
          `${invoiceData.student.cell}`,
          studentValueX,
          currentStudentDetailY,
        );
    }

    // Email (if available)
    if (invoiceData.student.email) {
      currentStudentDetailY += studentLineHeight;
      doc
        .text(`Email:`, studentLabelX, currentStudentDetailY)
        .text(
          `${invoiceData.student.email}`,
          studentValueX,
          currentStudentDetailY,
        );
    }

    // --- Invoice Summary (Right Side, grid-like) ---
    const invoiceSummaryLabelX = doc.page.width / 2;
    const invoiceSummaryValueX = invoiceSummaryLabelX + 100;
    const invoiceSummaryStartY = 220;
    const summaryLineHeight = 20;

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#3185fc')
      .text('Invoice Summary:', invoiceSummaryLabelX, invoiceSummaryStartY)
      .font('Helvetica')
      .fillColor('#000');

    // Total Bill (Net bill after exemption) - Ensure it's a number here too
    doc
      .text(
        `Total Bill:`,
        invoiceSummaryLabelX,
        invoiceSummaryStartY + summaryLineHeight,
      )
      .text(
        `\$${Number(invoiceData.totalBill).toFixed(2)}`,
        invoiceSummaryValueX,
        invoiceSummaryStartY + summaryLineHeight,
      );

    // Amount Paid
    doc
      .text(
        `Amount Paid:`,
        invoiceSummaryLabelX,
        invoiceSummaryStartY + 2 * summaryLineHeight,
      )
      .text(
        `\$${Number(invoiceData.amountPaidOnInvoice).toFixed(2)}`,
        invoiceSummaryValueX,
        invoiceSummaryStartY + 2 * summaryLineHeight,
      );

    // Balance Due
    doc
      .text(
        `Balance Due:`,
        invoiceSummaryLabelX,
        invoiceSummaryStartY + 3 * summaryLineHeight,
      )
      .text(
        `\$${Number(invoiceData.balance).toFixed(2)}`,
        invoiceSummaryValueX,
        invoiceSummaryStartY + 3 * summaryLineHeight,
      );

    // Status
    doc
      .text(
        `Status:`,
        invoiceSummaryLabelX,
        invoiceSummaryStartY + 4 * summaryLineHeight,
      )
      .fillColor('#3185fc')
      .text(
        `${invoiceData.status}`,
        invoiceSummaryValueX,
        invoiceSummaryStartY + 4 * summaryLineHeight,
      );

    // --- Invoice Items Table ---
    const tableStartX = 50;
    const tableStartY = Math.max(
      currentStudentDetailY + 20,
      invoiceSummaryStartY + 5 * summaryLineHeight + 20,
    );

    const columnWidths = [390, 100];
    const headers = ['Fee Description', 'Amount'];

    const items = invoiceData.bills || [];

    // Check if an exemption entity exists and calculate its amount
    if (invoiceData.exemption) {
      const calculatedExemptionAmount =
        this._calculateExemptionAmount(invoiceData);

      // Add exemption as a line item if it's positive
      if (calculatedExemptionAmount > 0) {
        // Create a dummy FeesEntity instance for the exemption
        const exemptionFees: FeesEntity = {
          id: 0, // Using 0 as a dummy numeric ID for this generated FeesEntity
          name: FeesNames.exemption,
          amount: -calculatedExemptionAmount, // The calculated negative amount
          description: 'Exemption Discount', // A default description for the generated fee
          bills: [], // As it's a dummy FeesEntity, this array can be empty
          exemptionType: invoiceData.exemption.type, // Assign the exemption type from invoiceData.exemption
        };

        // Create a dummy BillsEntity instance for the exemption row
        const exemptionBill: BillsEntity = {
          id: 0, // Using 0 as a dummy numeric ID for this generated BillsEntity
          date: new Date(), // Use current date for the bill date (matches BillsEntity's 'date' column)
          student: invoiceData.student, // Link to the student from invoiceData
          fees: exemptionFees, // Link to the dummy FeesEntity created above
          enrol: invoiceData.enrol, // Link to the enrolment from invoiceData
          invoice: invoiceData, // Link to the current invoiceData
        };
        items.push(exemptionBill); // Append exemption to the list (now last entry)
      }
    }

    const tableEndY = this.drawTable(
      doc,
      items,
      invoiceData.balanceBfwd,
      tableStartX,
      tableStartY,
      columnWidths,
      headers,
      invoiceData.totalBill,
    );

    // --- Terms and Conditions ---
    const termsAndConditions = `Terms and Conditions: Payment is due within 30 days or before schools open whichever comes first. Please include the Student Number on your payment.`;
    const termsStartY = tableEndY + 50;

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#555555')
      .text(termsAndConditions, 50, termsStartY, {
        align: 'left',
        lineGap: 8,
        width: doc.page.width - 100,
      });

    // --- Banking Details ---
    const bankingDetailsStartY = termsStartY + 40;
    const accountName = 'JUNIOR HIGH SCHOOL';
    const bank = 'ZB BANK';
    const branch = 'MASVINGO';
    const accountNumber = '4564 00321642 405';

    // Calculate the Y position after the banking details block
    const bankingDetailsEndLineY = bankingDetailsStartY + 80;

    doc
      .font('Helvetica-Bold')
      .text('BANKING DETAILS', 50, bankingDetailsStartY, {
        align: 'left',
        lineGap: 8,
      })
      .font('Helvetica')
      .text('Account Name: ' + accountName, 50, bankingDetailsStartY + 20, {
        align: 'left',
        lineGap: 8,
      })
      .text('Bank: ' + bank, 50, bankingDetailsStartY + 40, {
        align: 'left',
        lineGap: 8,
      })
      .text('Branch: ' + branch, 50, bankingDetailsStartY + 60, {
        align: 'left',
        lineGap: 8,
      })
      .text('Account Number: ' + accountNumber, 50, bankingDetailsStartY + 80, {
        align: 'left',
        lineGap: 8,
      });

    // --- Footer (positioned directly after banking details) ---
    const footerText = 'Thank you for your business!';
    const footerY = bankingDetailsEndLineY + 20;

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#888888')
      .text(footerText, 50, footerY, {
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
    const imgBuffer = fs.readFileSync(logoPath);

    const logoWidthPt = this.pxToPt(100); // Your CSS print media query for header-logo was 100px
    const logoHeightPt = this.pxToPt(100); // Assuming square aspect ratio or similar height

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
      const headerBarHeight = this.mmToPt(40); // Generous height for header bar
      const headerBarY = currentY;

      // 1. Logo
      const logoX = pageMargin;
      const logoY = headerBarY + (headerBarHeight - logoHeightPt) / 2; // Vertically center logo

      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, logoX, logoY, {
            width: logoWidthPt,
            height: logoHeightPt,
          });
        } else {
          doc
            .fillColor('#ccc')
            .text(
              'LOGO',
              logoX + logoWidthPt / 2 - doc.widthOfString('LOGO') / 2,
              logoY + logoHeightPt / 2 - doc.currentLineHeight() / 2,
            );
        }
      } catch (error) {
        doc.fillColor('red').text('LOGO_ERR', logoX, logoY + logoHeightPt / 2);
      }
      doc.fillColor('#000'); // Reset fill color

      // 2. Receipt Title ("RECEIPT")
      const titleText = 'RECEIPT';
      doc.font(defaultFontBold).fontSize(headerTitleFontSize);
      const titleWidth = doc.widthOfString(titleText);
      const titleX = pageWidth / 2 - titleWidth / 2; // Horizontally center title
      const titleY =
        headerBarY + (headerBarHeight - doc.currentLineHeight()) / 2; // Vertically center title
      doc.text(titleText, titleX, titleY);

      currentY = headerBarY + headerBarHeight + this.mmToPt(10); // Space after header

      // ========================== Receipt Details ==========================
      const detailsPaddingY = this.mmToPt(5); // Padding inside details section
      const detailsSectionHeight = this.mmToPt(30); // Estimated height for details section
      const detailsLineY = currentY; // Top border line

      doc.strokeColor('#eee').lineWidth(1);
      doc
        .moveTo(pageMargin, detailsLineY)
        .lineTo(pageWidth - pageMargin, detailsLineY)
        .stroke();

      currentY += detailsPaddingY * 2;

      doc.font(defaultFont).fontSize(detailItemFontSize);
      const detailItemSpacing = contentWidth / 3; // For 'space-around' effect

      // Detail Item 1: Receipt #
      let detailLabelY = currentY;
      let detailValueY = currentY + doc.currentLineHeight() * 1.8; // Position value below label
      doc.fillColor('#555').text('Receipt #:', pageMargin, detailLabelY);
      doc
        .fillColor('#000')
        .text(receipt.receiptNumber, pageMargin, detailValueY);

      // Detail Item 2: Payment Date
      detailLabelY = currentY;
      detailValueY = currentY + doc.currentLineHeight() * 1.8;
      doc
        .fillColor('#555')
        .text('Payment Date:', pageMargin + detailItemSpacing, detailLabelY);
      doc
        .fillColor('#000')
        .text(
          this.formatDate(receipt.paymentDate),
          pageMargin + detailItemSpacing,
          detailValueY,
        );

      // Detail Item 3: Payment Method
      detailLabelY = currentY;
      detailValueY = currentY + doc.currentLineHeight() * 1.8;
      doc
        .fillColor('#555')
        .text(
          'Payment Method:',
          pageMargin + 2 * detailItemSpacing,
          detailLabelY,
        );
      doc
        .fillColor('#000')
        .text(
          receipt.paymentMethod,
          pageMargin + 2 * detailItemSpacing,
          detailValueY,
        );

      currentY += detailsSectionHeight - detailsPaddingY * 2; // Move cursor to end of details content
      const detailsLineBottomY = currentY;

      doc.strokeColor('#eee').lineWidth(1);
      doc
        .moveTo(pageMargin, detailsLineBottomY)
        .lineTo(pageWidth - pageMargin, detailsLineBottomY)
        .stroke();

      currentY += this.mmToPt(10); // Space after details

      // ========================== From / To Section ==========================
      const sectionHeadingY = currentY;
      const sectionHeadingUnderlineOffset = this.mmToPt(2); // Distance below heading text for underline
      const lineSpacing = this.mmToPt(4); // For lines in party blocks

      // From Block Heading
      doc
        .font(defaultFontBold)
        .fontSize(sectionHeadingFontSize)
        .fillColor('#000');
      doc.text('From:', pageMargin, sectionHeadingY);
      doc
        .strokeColor('#ccc')
        .lineWidth(1)
        .moveTo(
          pageMargin,
          sectionHeadingY +
            doc.currentLineHeight() +
            sectionHeadingUnderlineOffset,
        )
        .lineTo(
          pageMargin + doc.widthOfString('From:'),
          sectionHeadingY +
            doc.currentLineHeight() +
            sectionHeadingUnderlineOffset,
        )
        .stroke();

      // To Block Heading
      const toBlockX = pageWidth / 2 + this.mmToPt(5); // Start of second column, with 5mm gap
      doc.text('To:', toBlockX, sectionHeadingY);
      doc
        .strokeColor('#ccc')
        .lineWidth(1)
        .moveTo(
          toBlockX,
          sectionHeadingY +
            doc.currentLineHeight() +
            sectionHeadingUnderlineOffset,
        )
        .lineTo(
          toBlockX + doc.widthOfString('To:'),
          sectionHeadingY +
            doc.currentLineHeight() +
            sectionHeadingUnderlineOffset,
        )
        .stroke();

      currentY += doc.currentLineHeight() + this.mmToPt(5); // Move cursor below headings

      doc.font(defaultFont).fontSize(defaultFontSize).fillColor('#000');
      const partyBlockContentWidth = contentWidth / 2 - this.mmToPt(5); // Width for each party block

      // From Block Content
      let fromContentY = currentY;
      doc.text('Junior High School', pageMargin, fromContentY);
      fromContentY += doc.currentLineHeight() + lineSpacing;
      doc.text(
        '30588 Lundi Drive, Rhodene, Masvingo',
        pageMargin,
        fromContentY,
      );
      fromContentY += doc.currentLineHeight() + lineSpacing;
      doc.text('+263 392 263 293', pageMargin, fromContentY);
      fromContentY += doc.currentLineHeight() + lineSpacing;
      doc.text('+263 78 223 8026', pageMargin, fromContentY);
      fromContentY += doc.currentLineHeight() + lineSpacing;
      doc.text('info@juniorhighschool.ac.zw', pageMargin, fromContentY);

      // To Block Content
      let toContentY = currentY;
      doc.text(
        `${receipt.student.name} ${receipt.student.surname} (${receipt.student.studentNumber})`,
        toBlockX,
        toContentY,
      );
      toContentY += doc.currentLineHeight() + lineSpacing;
      doc.text(
        `Enrolled in ${receipt.enrol.name} Term ${receipt.enrol.num}, ${receipt.enrol.year}`,
        toBlockX,
        toContentY,
      );
      toContentY += doc.currentLineHeight() + lineSpacing;
      doc.text(receipt.student.address, toBlockX, toContentY);
      toContentY += doc.currentLineHeight() + lineSpacing;
      doc.text(receipt.student.cell, toBlockX, toContentY);
      toContentY += doc.currentLineHeight() + lineSpacing;
      doc.text(receipt.student.email, toBlockX, toContentY);

      currentY = Math.max(fromContentY, toContentY) + this.mmToPt(10); // Move cursor below the lower of the two blocks

      // ========================== Summary Section ==========================
      const summaryTotalsWidth = this.mmToPt(80); // Adjusted width for totals block
      // const summaryTotalsX = pageWidth - pageMargin - summaryTotalsWidth;
      const summaryTotalsX = pageMargin;
      let totalsY = currentY + this.mmToPt(10); // Space before totals

      // Total Due
      doc.font(defaultFontBold).fontSize(totalRowFontSize).fillColor('#000');
      doc
        .strokeColor('#333')
        .lineWidth(2)
        .moveTo(summaryTotalsX, totalsY)
        .lineTo(pageWidth - pageMargin, totalsY)
        .stroke();
      totalsY += this.mmToPt(5); // Padding top

      const invoiceNumbersString = receipt.allocations
        .map((all) => all.invoice.invoiceNumber) // Get an array of just the invoice numbers
        .join(', '); // Join them into a single string, separated by ', '

      doc.text(
        receipt.allocations.length > 1 ? 'Invoices Paid' : 'Invoice Paid',
        summaryTotalsX,
        totalsY,
      );
      doc.text(
        invoiceNumbersString,
        pageWidth - pageMargin - doc.widthOfString(invoiceNumbersString),
        totalsY,
        // { align: 'right' },
      );
      totalsY += doc.currentLineHeight() + this.mmToPt(5); // Line height + padding

      // Amount Paid
      doc.font(defaultFontBold).fontSize(totalRowFontSize).fillColor('#28a745'); // Green color
      doc
        .strokeColor('#28a745')
        .lineWidth(2)
        .moveTo(summaryTotalsX, totalsY)
        .lineTo(pageWidth - pageMargin, totalsY)
        .stroke();
      totalsY += this.mmToPt(5); // Padding top
      doc.text('Amount Paid:', summaryTotalsX, totalsY);
      doc.text(
        this.formatCurrency(receipt.amountPaid),
        pageWidth - pageMargin - doc.widthOfString(receipt.amountPaid + ''),
        totalsY,
        // { align: 'right' },
      );
      totalsY += doc.currentLineHeight() + this.mmToPt(5); // Line height + padding

      // Amount Outstanding
      doc.font(defaultFontBold).fontSize(totalRowFontSize).fillColor('#000'); // Label black
      doc
        .strokeColor('#28a745')
        .lineWidth(2) // Border green as per your CSS
        .moveTo(summaryTotalsX, totalsY)
        .lineTo(pageWidth - pageMargin, totalsY)
        .stroke();
      totalsY += this.mmToPt(5); // Padding top

      const amountOutstanding = await this.getStudentBalance(
        receipt.student.studentNumber,
      );
      doc.text('Amount Outstanding:', summaryTotalsX, totalsY);
      doc.fillColor('red').text(
        this.formatCurrency(amountOutstanding.amountDue),
        pageWidth -
          pageMargin -
          doc.widthOfString(amountOutstanding.amountDue + ''),
        totalsY,
        // { align: 'right' },
      );
      doc.fillColor('#000'); // Reset color

      currentY = totalsY + this.mmToPt(10); // Space after summary totals

      // ========================== Remarks ==========================
      currentY += this.mmToPt(10); // Add extra space for remarks
      doc
        .font(defaultFontBold)
        .fontSize(sectionHeadingFontSize)
        .fillColor('#000');
      doc.text('Remarks:', pageMargin, currentY);
      doc
        .strokeColor('#ccc')
        .lineWidth(1)
        .moveTo(
          pageMargin,
          currentY + doc.currentLineHeight() + sectionHeadingUnderlineOffset,
        )
        .lineTo(
          pageMargin + doc.widthOfString('Remarks:'),
          currentY + doc.currentLineHeight() + sectionHeadingUnderlineOffset,
        )
        .stroke();

      currentY += doc.currentLineHeight() + this.mmToPt(5);

      doc.font(defaultFont).fontSize(defaultFontSize).fillColor('#000');
      const remarksText =
        receipt.description ||
        'Thank You For Your Prompt Payment, We Appreciate Your Business';
      doc.text(remarksText, pageMargin, currentY, {
        width: contentWidth,
        align: 'left',
      });

      // ========================== Footer ==========================
      const footerContentHeight = this.mmToPt(20); // Estimated height for footer text
      const footerBorderTopOffset = this.mmToPt(10); // Space from content to footer line
      const footerPaddingTop = this.mmToPt(5);

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

/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  Logger,
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
import { CreditInvoiceAllocationEntity } from './entities/credit-invoice-allocation.entity';
import { ReceiptCreditEntity } from './entities/receipt-credit.entity';
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepository: Repository<InvoiceEntity>,
    @InjectRepository(ReceiptEntity)
    private readonly receiptRepository: Repository<ReceiptEntity>,
    @InjectRepository(ReceiptInvoiceAllocationEntity)
    private allocationRepository: Repository<ReceiptInvoiceAllocationEntity>,
    @InjectRepository(CreditInvoiceAllocationEntity)
    private readonly creditAllocationRepository: Repository<CreditInvoiceAllocationEntity>,
    @InjectRepository(StudentCreditEntity)
    private readonly studentCreditRepository: Repository<StudentCreditEntity>,
    private readonly enrolmentService: EnrolmentService,
    private readonly financeService: FinanceService,
    private studentsService: StudentsService,
    private resourceById: ResourceByIdService,
    private dataSource: DataSource, // Inject DataSource for transactional queries
  ) {}

  /**
   * Validates that an amount is positive and greater than zero
   * @param amount - The amount to validate
   * @param fieldName - The name of the field for error messages
   * @throws BadRequestException if amount is invalid
   */
  private validateAmount(amount: number, fieldName: string = 'Amount'): void {
    if (amount === null || amount === undefined || isNaN(amount)) {
      throw new BadRequestException(`${fieldName} must be a valid number`);
    }
    if (amount <= 0) {
      throw new BadRequestException(
        `${fieldName} must be greater than zero. Received: ${amount}`,
      );
    }
    if (amount > 999999999.99) {
      throw new BadRequestException(
        `${fieldName} exceeds maximum allowed value (999,999,999.99)`,
      );
    }
  }

  /**
   * Verifies that invoice balance matches the expected calculation
   * @param invoice - The invoice to verify
   * @throws Error if balance reconciliation fails
   */
  private verifyInvoiceBalance(invoice: InvoiceEntity): void {
    const expectedBalance =
      Number(invoice.totalBill) - Number(invoice.amountPaidOnInvoice);
    const actualBalance = Number(invoice.balance);
    const tolerance = 0.01; // Allow small floating point differences

    if (Math.abs(expectedBalance - actualBalance) > tolerance) {
      const error = `Invoice ${invoice.invoiceNumber} balance mismatch: Expected ${expectedBalance}, Actual ${actualBalance}`;
      this.logger.error(error, {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalBill: invoice.totalBill,
        amountPaidOnInvoice: invoice.amountPaidOnInvoice,
        expectedBalance,
        actualBalance,
      });
      throw new Error(error);
    }
  }

  /**
   * Verifies that receipt allocations sum correctly
   * @param receipt - The receipt to verify
   * @param allocations - The allocations for this receipt
   * @throws Error if allocation sum verification fails
   */
  private verifyReceiptAllocations(
    receipt: ReceiptEntity,
    allocations: ReceiptInvoiceAllocationEntity[],
  ): void {
    const totalAllocated = allocations.reduce(
      (sum, allocation) => sum + Number(allocation.amountApplied),
      0,
    );
    const receiptAmount = Number(receipt.amountPaid);
    const tolerance = 0.01;

    // Allocations should not exceed receipt amount
    if (totalAllocated > receiptAmount + tolerance) {
      const error = `Receipt ${receipt.receiptNumber} allocations exceed receipt amount: Allocated ${totalAllocated}, Receipt ${receiptAmount}`;
      this.logger.error(error, {
        receiptId: receipt.id,
        receiptNumber: receipt.receiptNumber,
        receiptAmount,
        totalAllocated,
        allocationsCount: allocations.length,
      });
      throw new Error(error);
    }
  }

  /**
   * Verifies that credit allocations sum correctly
   * @param studentCredit - The student credit to verify
   * @param allocations - The credit allocations
   * @throws Error if allocation sum verification fails
   */
  private verifyCreditAllocations(
    studentCredit: StudentCreditEntity,
    allocations: CreditInvoiceAllocationEntity[],
  ): void {
    const totalAllocated = allocations.reduce(
      (sum, allocation) => sum + Number(allocation.amountApplied),
      0,
    );
    const creditAmount = Number(studentCredit.amount);
    const tolerance = 0.01;

    // Allocated credit should not exceed available credit (with tolerance for rounding)
    // Note: This check is for verification only, as credit may have been partially applied
    if (totalAllocated > creditAmount + 1000) {
      // Allow some tolerance for credits that were applied and then new credit added
      this.logger.warn(
        `Credit allocations may exceed available credit for student ${studentCredit.studentNumber}: Allocated ${totalAllocated}, Available ${creditAmount}`,
        {
          studentNumber: studentCredit.studentNumber,
          creditAmount,
          totalAllocated,
          allocationsCount: allocations.length,
        },
      );
    }
  }

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
    this.logger.log(
      `Voiding receipt ${receiptId} by ${voidedByEmail}`,
      { receiptId, voidedByEmail },
    );

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        const receiptToVoid = await transactionalEntityManager.findOne(
          ReceiptEntity,
          {
            where: { id: receiptId },
            relations: ['allocations', 'allocations.invoice', 'student'], // Load allocations, invoices, and student
          },
        );

        if (!receiptToVoid) {
          this.logger.error(`Receipt ${receiptId} not found for voiding`, {
            receiptId,
            voidedByEmail,
          });
          throw new NotFoundException(
            `Receipt with ID ${receiptId} not found.`,
          );
        }
        if (receiptToVoid.isVoided) {
          this.logger.warn(
            `Attempt to void already voided receipt ${receiptId}`,
            { receiptId, voidedByEmail },
          );
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

        // 3a. Verify invoice balances after reversal
        for (const invoice of updatedInvoices) {
          this.verifyInvoiceBalance(invoice);
        }

        // 4. Reverse any credit that was created from this receipt's overpayment
        // Find the ReceiptCreditEntity that links this receipt to the credit created
        const receiptCredit = await transactionalEntityManager.findOne(
          ReceiptCreditEntity,
          {
            where: { receipt: { id: receiptId } },
            relations: ['studentCredit', 'receipt'],
          },
        );

        if (receiptCredit) {
          // This receipt created a credit - we have a direct link to it
          const creditAmount = Number(receiptCredit.creditAmount);
          const studentCredit = receiptCredit.studentCredit;
          const currentCreditAmount = Number(studentCredit.amount);
          const creditAlreadyApplied = creditAmount - currentCreditAmount;

          // If credit was already applied to invoices, we need to reverse those allocations
          if (creditAlreadyApplied > 0) {
            // Find credit allocations for this student, ordered by most recent first (LIFO)
            const creditAllocations = await transactionalEntityManager.find(
              CreditInvoiceAllocationEntity,
              {
                where: { studentCredit: { id: studentCredit.id } },
                relations: ['invoice'],
                order: { allocationDate: 'DESC' },
              },
            );

            let remainingToReverse = creditAlreadyApplied;
            const invoicesToUpdate: InvoiceEntity[] = [];

            // Reverse credit allocations in reverse order (LIFO - Last In First Out)
            for (const creditAllocation of creditAllocations) {
              if (remainingToReverse <= 0) {
                break;
              }

              const allocationAmount = Number(creditAllocation.amountApplied);
              const amountToReverse = Math.min(remainingToReverse, allocationAmount);

              if (amountToReverse > 0 && creditAllocation.invoice) {
                const invoice = creditAllocation.invoice;

                // Reverse the credit allocation on the invoice
                invoice.amountPaidOnInvoice = Math.max(
                  0,
                  Number(invoice.amountPaidOnInvoice) - amountToReverse,
                );
                invoice.balance = Number(invoice.balance) + amountToReverse;
                invoice.status = this.getInvoiceStatus(invoice);

                invoicesToUpdate.push(invoice);

                // If we're reversing the entire allocation, delete it
                // Otherwise, reduce the allocation amount
                if (amountToReverse >= allocationAmount) {
                  await transactionalEntityManager.remove(creditAllocation);
                } else {
                  creditAllocation.amountApplied = allocationAmount - amountToReverse;
                  await transactionalEntityManager.save(creditAllocation);
                }

                remainingToReverse -= amountToReverse;
              }
            }

            // Save updated invoices
            if (invoicesToUpdate.length > 0) {
              await transactionalEntityManager.save(invoicesToUpdate);
            }

            // Restore the credit balance for the amount that was reversed
            studentCredit.amount =
              currentCreditAmount + (creditAlreadyApplied - remainingToReverse);
          }

          // Now reverse the remaining credit balance (if any)
          const creditToReverse = Math.min(creditAmount, Number(studentCredit.amount));

          if (creditToReverse > 0) {
            // Deduct the credit that was created from this receipt
            studentCredit.amount = Number(studentCredit.amount) - creditToReverse;
            studentCredit.lastCreditSource = `Reversed: Overpayment from Receipt ${receiptToVoid.receiptNumber} (voided)`;

            // If credit becomes zero or negative, set it to zero
            if (studentCredit.amount <= 0) {
              studentCredit.amount = 0;
            }

            await transactionalEntityManager.save(studentCredit);
          }

          // Delete the ReceiptCreditEntity to remove the link
          await transactionalEntityManager.remove(receiptCredit);

          // Count invoices updated from credit reversal
          const creditReversalInvoicesCount = creditAlreadyApplied > 0 ? 
            (await transactionalEntityManager.find(CreditInvoiceAllocationEntity, {
              where: { studentCredit: { id: studentCredit.id } },
            })).length : 0;

          this.logger.log(
            `Voided receipt ${receiptToVoid.receiptNumber}: Reversed credit ${creditAmount}, Credit was applied: ${creditAlreadyApplied > 0}`,
            {
              receiptId: receiptId,
              receiptNumber: receiptToVoid.receiptNumber,
              creditAmount,
              creditAlreadyApplied,
              creditReversalInvoicesCount,
            },
          );
        } else {
          // Fallback: Calculate overpayment amount if ReceiptCreditEntity doesn't exist
          // (for receipts created before this feature was implemented)
          const totalAllocatedAmount = receiptToVoid.allocations.reduce(
            (sum, allocation) => sum + Number(allocation.amountApplied),
            0,
          );
          const overpaymentAmount =
            Number(receiptToVoid.amountPaid) - totalAllocatedAmount;

          if (overpaymentAmount > 0) {
            // This receipt created a credit from overpayment (legacy receipt)
            // Use the previous logic as fallback
            const studentNumber = receiptToVoid.student?.studentNumber;
            if (studentNumber) {
              const studentCredit = await this.getStudentCredit(
                studentNumber,
                transactionalEntityManager,
              );

              if (studentCredit) {
                const currentCreditAmount = Number(studentCredit.amount);
                const creditToReverse = Math.min(
                  overpaymentAmount,
                  currentCreditAmount,
                );

                if (creditToReverse > 0) {
                  studentCredit.amount = currentCreditAmount - creditToReverse;
                  studentCredit.lastCreditSource = `Reversed: Overpayment from Receipt ${receiptToVoid.receiptNumber} (voided)`;

                  if (studentCredit.amount <= 0) {
                    studentCredit.amount = 0;
                  }

                  await transactionalEntityManager.save(studentCredit);
                }
              }
            }
          }
        }

        // 5. Log void completion
        this.logger.log(
          `Receipt ${receiptToVoid.receiptNumber} voided successfully: ${updatedInvoices.length} invoices updated`,
          {
            receiptId: receiptId,
            receiptNumber: receiptToVoid.receiptNumber,
            invoicesUpdated: updatedInvoices.length,
            voidedBy: voidedByEmail,
          },
        );

        return receiptToVoid;
      },
    );
  }

  /**
   * Voids an invoice - reverses all payments and credit allocations
   * Invoices should NOT be deleted, only voided to maintain audit trail
   * @param invoiceId - The ID of the invoice to void
   * @param voidedByEmail - Email of the user voiding the invoice
   * @returns The voided invoice
   */
  async voidInvoice(
    invoiceId: number,
    voidedByEmail: string,
  ): Promise<InvoiceEntity> {
    this.logger.log(
      `Voiding invoice ${invoiceId} by ${voidedByEmail}`,
      { invoiceId, voidedByEmail },
    );

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        const invoiceToVoid = await transactionalEntityManager.findOne(
          InvoiceEntity,
          {
            where: { id: invoiceId },
            relations: [
              'allocations',
              'allocations.receipt',
              'creditAllocations',
              'creditAllocations.studentCredit',
              'student',
            ],
          },
        );

        if (!invoiceToVoid) {
          this.logger.error(`Invoice ${invoiceId} not found for voiding`, {
            invoiceId,
            voidedByEmail,
          });
          throw new NotFoundException(
            `Invoice with ID ${invoiceId} not found.`,
          );
        }

        if (invoiceToVoid.isVoided) {
          this.logger.warn(
            `Attempt to void already voided invoice ${invoiceId}`,
            { invoiceId, voidedByEmail },
          );
          throw new BadRequestException(
            `Invoice with ID ${invoiceId} is already voided.`,
          );
        }

        // 1. Mark the invoice as voided
        invoiceToVoid.isVoided = true;
        invoiceToVoid.voidedAt = new Date();
        invoiceToVoid.voidedBy = voidedByEmail;
        invoiceToVoid.status = InvoiceStatus.Pending; // Reset status

        // 2. Reverse receipt allocations
        // When an invoice is voided, we need to reverse the receipt allocations
        // The receipt amounts that were allocated should become credits to the student
        const allocationsToDelete: ReceiptInvoiceAllocationEntity[] = [];
        const receiptAmountsToCredit = new Map<string, number>(); // studentNumber -> total amount to credit

        for (const allocation of invoiceToVoid.allocations) {
          const receipt = allocation.receipt;
          const amountApplied = Number(allocation.amountApplied);

          if (receipt && !receipt.isVoided) {
            // Only process if receipt is not already voided
            // If receipt is voided, the allocation should already be reversed
            allocationsToDelete.push(allocation);

            // Track the amount to credit back to the student
            const studentNumber = receipt.student?.studentNumber;
            if (studentNumber) {
              const currentCredit = receiptAmountsToCredit.get(studentNumber) || 0;
              receiptAmountsToCredit.set(studentNumber, currentCredit + amountApplied);
            }
          } else if (receipt && receipt.isVoided) {
            // Receipt is voided, so allocation should already be reversed
            // Just mark for deletion
            allocationsToDelete.push(allocation);
          }
        }

        // Create or update student credits for the receipt amounts
        for (const [studentNumber, creditAmount] of receiptAmountsToCredit.entries()) {
          await this.createOrUpdateStudentCredit(
            studentNumber,
            creditAmount,
            transactionalEntityManager,
            `Restored: Receipt allocation from voided Invoice ${invoiceToVoid.invoiceNumber}`,
          );
        }

        // Delete receipt allocations
        if (allocationsToDelete.length > 0) {
          await transactionalEntityManager.remove(allocationsToDelete);
        }

        // 3. Reverse credit allocations and restore student credit
        const creditAllocationsToReverse: CreditInvoiceAllocationEntity[] = [];
        const studentCreditsToUpdate = new Map<
          number,
          StudentCreditEntity
        >();

        for (const creditAllocation of invoiceToVoid.creditAllocations) {
          const studentCredit = creditAllocation.studentCredit;
          const amountApplied = Number(creditAllocation.amountApplied);

          if (studentCredit) {
            // Restore the credit to the student
            if (!studentCreditsToUpdate.has(studentCredit.id)) {
              studentCreditsToUpdate.set(studentCredit.id, studentCredit);
            }

            const creditToRestore = studentCreditsToUpdate.get(studentCredit.id);
            if (creditToRestore) {
              creditToRestore.amount =
                Number(creditToRestore.amount) + amountApplied;
              creditToRestore.lastCreditSource = `Restored: Credit from voided Invoice ${invoiceToVoid.invoiceNumber}`;
            }

            creditAllocationsToReverse.push(creditAllocation);
          }
        }

        // Save updated student credits
        if (studentCreditsToUpdate.size > 0) {
          await transactionalEntityManager.save(
            Array.from(studentCreditsToUpdate.values()),
          );
        }

        // Delete credit allocations
        if (creditAllocationsToReverse.length > 0) {
          await transactionalEntityManager.remove(creditAllocationsToReverse);
        }

        // 4. Reset invoice financial fields
        invoiceToVoid.amountPaidOnInvoice = 0;
        invoiceToVoid.balance = invoiceToVoid.totalBill; // Restore to original total

        // 5. Save the voided invoice
        await transactionalEntityManager.save(invoiceToVoid);

        // 6. Verify balance after voiding
        this.verifyInvoiceBalance(invoiceToVoid);

        // 7. Log void completion
        const totalReceiptAmountCredited = Array.from(receiptAmountsToCredit.values()).reduce(
          (sum, amount) => sum + amount,
          0,
        );
        this.logger.log(
          `Invoice ${invoiceToVoid.invoiceNumber} voided successfully: Reversed ${allocationsToDelete.length} receipt allocations (${totalReceiptAmountCredited} credited to student), ${creditAllocationsToReverse.length} credit allocations restored`,
          {
            invoiceId: invoiceId,
            invoiceNumber: invoiceToVoid.invoiceNumber,
            receiptAllocationsReversed: allocationsToDelete.length,
            receiptAmountCredited: totalReceiptAmountCredited,
            creditAllocationsReversed: creditAllocationsToReverse.length,
            voidedBy: voidedByEmail,
          },
        );

        return invoiceToVoid;
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
    // 1. Validate input amount
    this.validateAmount(
      createReceiptDto.amountPaid,
      'Receipt amount paid',
    );

    // 2. Authorization Check (already provided)
    const allowedRoles = [ROLES.reception, ROLES.auditor];
    if (!allowedRoles.includes(profile.role as ROLES)) {
      throw new UnauthorizedException(
        'You are not allowed to generate receipts',
      );
    }

    // 3. Fetch Student Entity
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

    this.logger.log(
      `Creating receipt for student ${studentNumber}, amount: ${createReceiptDto.amountPaid}, served by: ${profile.email}`,
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

        // 3. Apply payment amount to invoices sequentially (FIFO)
        // Continue allocating until remaining amount is exhausted or no more open invoices
        while (remainingPaymentAmount > 0.01) {
          // Fetch open invoices dynamically to account for updated balances
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

          // If no open invoices, break and create credit
          if (openInvoices.length === 0) {
            break;
          }

          // Apply payment to invoices (FIFO by due date)
          let allocatedThisIteration = false;
          const invoicesToSaveThisIteration: InvoiceEntity[] = [];
          const allocationsToSaveThisIteration: ReceiptInvoiceAllocationEntity[] = [];

          for (const invoice of openInvoices) {
            if (remainingPaymentAmount <= 0.01) {
              break;
            }

            const invoiceCurrentBalance = Number(invoice.balance);

            if (invoiceCurrentBalance <= 0.01) {
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
            allocationsToSaveThisIteration.push(allocation);
            allocationsToSave.push(allocation);

            invoice.amountPaidOnInvoice =
              Number(invoice.amountPaidOnInvoice) + amountToApplyToCurrentInvoice;

            invoice.balance =
              Number(invoice.balance) - amountToApplyToCurrentInvoice;
            invoice.status = this.getInvoiceStatus(invoice);
            invoicesToSaveThisIteration.push(invoice);
            updatedInvoices.push(invoice);

            remainingPaymentAmount =
              remainingPaymentAmount - amountToApplyToCurrentInvoice;
            allocatedThisIteration = true;
          }

          // Save invoices and allocations after each iteration so next query sees updated balances
          if (allocatedThisIteration) {
            await transactionalEntityManager.save(invoicesToSaveThisIteration);
            await transactionalEntityManager.save(allocationsToSaveThisIteration);
          }

          // If we couldn't allocate anything this iteration, break to avoid infinite loop
          if (!allocatedThisIteration) {
            break;
          }
        }

        // 5. Handle any remaining payment amount as a credit
        if (remainingPaymentAmount > 0) {
          // Use the new service method to create or update student credit
          const studentCredit = await this.createOrUpdateStudentCredit(
            student.studentNumber,
            remainingPaymentAmount,
            transactionalEntityManager,
            `Overpayment from Receipt ${savedReceipt.receiptNumber}`, // Add a clear source
          );

          // Create ReceiptCreditEntity to track the link between receipt and credit
          const receiptCredit = transactionalEntityManager.create(
            ReceiptCreditEntity,
            {
              receipt: savedReceipt,
              studentCredit: studentCredit,
              creditAmount: remainingPaymentAmount,
              createdAt: new Date(),
            },
          );
          await transactionalEntityManager.save(receiptCredit);
        }

        // 6. Save any remaining changes within the transaction
        // Note: Invoices and allocations are already saved during the allocation loop,
        // but we keep this for any edge cases and to ensure all changes are persisted
        if (updatedInvoices.length > 0) {
          await transactionalEntityManager.save(updatedInvoices);
        }
        if (allocationsToSave.length > 0) {
          await transactionalEntityManager.save(allocationsToSave);
        }

        // 7. Verify allocations sum correctly
        this.verifyReceiptAllocations(savedReceipt, allocationsToSave);

        // 8. Verify invoice balances after updates
        for (const invoice of updatedInvoices) {
          this.verifyInvoiceBalance(invoice);
        }

        // 9. Log receipt creation
        this.logger.log(
          `Receipt ${savedReceipt.receiptNumber} created: Amount ${savedReceipt.amountPaid}, Allocations: ${allocationsToSave.length}, Credit created: ${remainingPaymentAmount > 0 ? remainingPaymentAmount : 0}`,
          {
            receiptId: savedReceipt.id,
            receiptNumber: savedReceipt.receiptNumber,
            studentNumber,
            amountPaid: savedReceipt.amountPaid,
            allocationsCount: allocationsToSave.length,
            creditCreated: remainingPaymentAmount > 0 ? remainingPaymentAmount : 0,
          },
        );

        const finalReceipt = await transactionalEntityManager.findOne(
          ReceiptEntity,
          {
            where: { id: savedReceipt.id },
            relations: [
              'allocations',
              'allocations.invoice',
              'receiptCredits',
              'receiptCredits.studentCredit',
              'student',
              'enrol',
            ],
          },
        );

        if (!finalReceipt) {
          const error = 'Failed to retrieve full receipt details after save.';
          this.logger.error(error, { receiptId: savedReceipt.id });
          throw new Error(error);
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
    // Validate amount
    this.validateAmount(amount, 'Credit amount');

    let studentCredit = await transactionalEntityManager.findOne(
      StudentCreditEntity,
      {
        where: { studentNumber: studentNumber },
        relations: ['student'], // Load the student relation if needed
      },
    );

    if (studentCredit) {
      // Update existing credit
      const previousAmount = Number(studentCredit.amount);
      studentCredit.amount = previousAmount + amount;
      studentCredit.lastCreditSource = source;

      this.logger.log(
        `Updated student credit for ${studentNumber}: ${previousAmount} + ${amount} = ${studentCredit.amount}`,
        {
          studentNumber,
          previousAmount,
          amountAdded: amount,
          newAmount: studentCredit.amount,
          source,
        },
      );
    } else {
      // Create new credit entry
      const student = await transactionalEntityManager.findOne(StudentsEntity, {
        where: { studentNumber },
      });
      if (!student) {
        this.logger.error(
          `Student ${studentNumber} not found for credit creation`,
          { studentNumber, amount, source },
        );
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

      this.logger.log(
        `Created new student credit for ${studentNumber}: ${amount}`,
        {
          studentNumber,
          amount,
          source,
        },
      );
    }

    return await transactionalEntityManager.save(studentCredit);
  }

  async deductStudentCredit(
    studentNumber: string,
    amountToDeduct: number,
    transactionalEntityManager: EntityManager,
    reason = 'Applied to Invoice',
  ): Promise<StudentCreditEntity | null> {
    // Validate amount
    this.validateAmount(amountToDeduct, 'Credit deduction amount');

    const studentCredit = await transactionalEntityManager.findOne(
      StudentCreditEntity,
      {
        where: { studentNumber: studentNumber },
      },
    );

    if (studentCredit && Number(studentCredit.amount) >= amountToDeduct) {
      const previousAmount = Number(studentCredit.amount);
      studentCredit.amount = previousAmount - amountToDeduct;
      studentCredit.lastCreditSource = `Deducted: ${reason}`;

      if (studentCredit.amount <= 0) {
        // If credit becomes zero or negative, you might choose to delete the entry
        // or keep it with amount 0 for historical purposes. Keeping it at 0 is safer.
        studentCredit.amount = 0;
        await transactionalEntityManager.save(studentCredit); // Save updated zero credit

        this.logger.log(
          `Deducted student credit for ${studentNumber}: ${previousAmount} - ${amountToDeduct} = 0 (credit exhausted)`,
          {
            studentNumber,
            previousAmount,
            amountDeducted: amountToDeduct,
            reason,
          },
        );
        // await transactionalEntityManager.remove(studentCredit); // Or remove if desired
        return null; // Or return the updated entity
      } else {
        await transactionalEntityManager.save(studentCredit);

        this.logger.log(
          `Deducted student credit for ${studentNumber}: ${previousAmount} - ${amountToDeduct} = ${studentCredit.amount}`,
          {
            studentNumber,
            previousAmount,
            amountDeducted: amountToDeduct,
            remainingAmount: studentCredit.amount,
            reason,
          },
        );
        return studentCredit;
      }
    } else if (studentCredit && Number(studentCredit.amount) < amountToDeduct) {
      this.logger.error(
        `Insufficient credit balance for student ${studentNumber}`,
        {
          studentNumber,
          availableCredit: studentCredit.amount,
          requestedAmount: amountToDeduct,
          reason,
        },
      );
      throw new BadRequestException(
        `Insufficient credit balance for student ${studentNumber}. Available: ${studentCredit.amount}, Requested: ${amountToDeduct}`,
      );
    }

    this.logger.warn(
      `No credit found for student ${studentNumber} when attempting to deduct ${amountToDeduct}`,
      { studentNumber, amountToDeduct, reason },
    );
    return null; // No credit found for student
  }

  async getAllReceipts(): Promise<ReceiptEntity[]> {
    return await this.receiptRepository.find({
      relations: [
        'student',
        'enrol',
        'allocations',
        'allocations.invoice',
        'receiptCredits',
        'receiptCredits.studentCredit',
      ],
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
      relations: [
        'student',
        'enrol',
        'allocations',
        'allocations.invoice',
        'receiptCredits',
        'receiptCredits.studentCredit',
      ],
    });
    return receipts;
  }

  async getReceiptByReceiptNumber(
    receiptNumber: string,
  ): Promise<ReceiptEntity> {
    return await this.receiptRepository.findOne({
      where: { receiptNumber },
      relations: [
        'student',
        'enrol',
        'allocations',
        'allocations.invoice',
        'receiptCredits',
        'receiptCredits.studentCredit',
      ],
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
    this.logger.log(
      `Saving invoice for student ${invoice.student.studentNumber}, term ${invoice.enrol?.num}/${invoice.enrol?.year}`,
      {
        studentNumber: invoice.student.studentNumber,
        term: invoice.enrol ? `${invoice.enrol.num}/${invoice.enrol.year}` : 'N/A',
        invoiceNumber: invoice.invoiceNumber,
        billsCount: invoice.bills?.length || 0,
      },
    );

    // Wrap the entire logic in a database transaction
    return await this.dataSource.transaction(
      async (transactionalEntityManager: EntityManager) => {
        try {
          // Track credit allocations that need to be saved after invoice is saved
          const creditAllocationsToSave: CreditInvoiceAllocationEntity[] = [];

          // Fetch student with exemption to ensure it's loaded for calculation
          // Make sure getStudentByStudentNumberWithExemption uses the transactionalEntityManager
          const student =
            await this.studentsService.getStudentByStudentNumberWithExemption(
              invoice.student.studentNumber,
            );
          if (!student) {
            this.logger.error(
              `Student ${invoice.student.studentNumber} not found when saving invoice`,
              {
                studentNumber: invoice.student.studentNumber,
                invoiceNumber: invoice.invoiceNumber,
              },
            );
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

                // Create credit allocation record for audit trail
                const creditAllocation = transactionalEntityManager.create(
                  CreditInvoiceAllocationEntity,
                  {
                    studentCredit: studentCredit,
                    invoice: invoiceToSave,
                    amountApplied: amountToApplyFromCredit,
                    allocationDate: new Date(),
                  },
                );
                await transactionalEntityManager.save(creditAllocation);

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

            // Verify balance calculation before save
            this.verifyInvoiceBalance(invoiceToSave);

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

                // Create credit allocation record for audit trail
                // We'll save it after the invoice is saved to ensure the invoice has an ID
                const creditAllocation = transactionalEntityManager.create(
                  CreditInvoiceAllocationEntity,
                  {
                    studentCredit: studentCredit,
                    invoice: invoiceToSave, // Will be updated with saved invoice below
                    amountApplied: amountToApplyFromCredit,
                    allocationDate: new Date(),
                  },
                );
                creditAllocationsToSave.push(creditAllocation);

                // Update invoice's amountPaidOnInvoice (initial payment from credit)
                invoiceToSave.amountPaidOnInvoice =
                  Number(invoiceToSave.amountPaidOnInvoice) +
                  amountToApplyFromCredit;
              }
            }

            // Final balance calculation for new invoice
            invoiceToSave.balance =
              invoiceToSave.totalBill - invoiceToSave.amountPaidOnInvoice;

            // Verify balance calculation
            this.verifyInvoiceBalance(invoiceToSave);

            // Set exemption and initial status for new invoice
            invoiceToSave.exemption = studentExemption || null;
            invoiceToSave.status = this.getInvoiceStatus(invoiceToSave);
          }

          invoiceToSave.exemptedAmount =
            this._calculateExemptionAmount(invoiceToSave);

          // Use transactionalEntityManager for saving the invoice
          const saved = await transactionalEntityManager.save(invoiceToSave);

          // Verify balance after save
          this.verifyInvoiceBalance(saved);

          // Save any credit allocations that were created (for new invoices)
          // For existing invoices, allocations are already saved above
          if (creditAllocationsToSave.length > 0) {
            // Update the invoice reference in each allocation to use the saved invoice
            for (const allocation of creditAllocationsToSave) {
              allocation.invoice = saved;
            }
            await transactionalEntityManager.save(creditAllocationsToSave);

            // Verify credit allocations after save
            const savedCreditAllocations = await transactionalEntityManager.find(
              CreditInvoiceAllocationEntity,
              {
                where: { invoice: { id: saved.id } },
                relations: ['studentCredit'],
              },
            );
            if (savedCreditAllocations.length > 0) {
              const studentCredit = savedCreditAllocations[0].studentCredit;
              this.verifyCreditAllocations(studentCredit, savedCreditAllocations);
            }
          }

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

          // Log invoice save completion
          this.logger.log(
            `${foundInvoice ? 'Updated' : 'Created'} invoice ${saved.invoiceNumber} for student ${saved.student.studentNumber}: Total ${saved.totalBill}, Paid ${saved.amountPaidOnInvoice}, Balance ${saved.balance}`,
            {
              invoiceId: saved.id,
              invoiceNumber: saved.invoiceNumber,
              studentNumber: saved.student.studentNumber,
              totalBill: saved.totalBill,
              amountPaidOnInvoice: saved.amountPaidOnInvoice,
              balance: saved.balance,
              status: saved.status,
              creditAllocationsCount: creditAllocationsToSave.length,
              isNewInvoice: !foundInvoice,
            },
          );

          return saved;
        } catch (error) {
          // Log the actual error for better debugging
          this.logger.error(
            `Error saving invoice for student ${invoice.student.studentNumber}`,
            {
              studentNumber: invoice.student.studentNumber,
              invoiceNumber: invoice.invoiceNumber,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
          );
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
    newInv.enrol = enrol;
    newInv.bills = [];
    
    // Initialize all required fields explicitly
    // Note: The InvoiceEntity constructor will handle some of these, but we set them explicitly for clarity
    if (!newInv.invoiceNumber) {
      newInv.invoiceNumber = newInv.generateInvoiceNumber();
    }
    newInv.invoiceDate = new Date();
    if (!newInv.invoiceDueDate) {
      // Calculate due date (30 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      newInv.invoiceDueDate = dueDate;
    }
    newInv.totalBill = 0; // No bills yet, will be calculated when bills are added
    newInv.balance = 0; // No balance yet, will be calculated when bills are added
    newInv.amountPaidOnInvoice = 0; // No payments yet
    newInv.status = InvoiceStatus.Pending; // New invoice starts as pending
    newInv.exemptedAmount = 0; // Will be calculated when exemption is applied
    newInv.isVoided = false; // New invoice is not voided
    newInv.voidedAt = null;
    newInv.voidedBy = null;

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
        'allocations',
        'creditAllocations',
        'creditAllocations.studentCredit',
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
        'allocations',
        'creditAllocations',
        'creditAllocations.studentCredit',
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

  /**
   * Data Repair Service - Fixes historical data inconsistencies
   * This method audits and repairs invoices, receipts, and credit allocations
   * that were created before the new tracking system was implemented.
   */

  /**
   * Audits all invoices and identifies inconsistencies
   * @returns Report of all inconsistencies found
   */
  async auditDataIntegrity(): Promise<{
    invoicesWithBalanceIssues: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      expectedBalance: number;
      actualBalance: number;
      difference: number;
    }>;
    invoicesWithMissingCreditAllocations: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      amountPaidOnInvoice: number;
      totalReceiptAllocations: number;
      missingCreditAmount: number;
    }>;
    invoicesWithDeletedBalanceBfwd: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      balanceId: number | null;
      totalBill: number;
      calculatedTotalBill: number;
      possibleBalanceBfwdAmount: number;
      note: string;
    }>;
    voidedReceiptsWithIncompleteReversals: Array<{
      receiptId: number;
      receiptNumber: string;
      studentNumber: string;
      amountPaid: number;
      totalAllocations: number;
      shouldHaveReversed: number;
    }>;
    receiptsWithUnallocatedAmounts: Array<{
      receiptId: number;
      receiptNumber: string;
      studentNumber: string;
      amountPaid: number;
      totalAllocations: number;
      unallocatedAmount: number;
    }>;
    unrecordedCredits: Array<{
      studentCreditId: number;
      studentNumber: string;
      creditAmount: number;
      receiptCreditsCount: number;
      note: string;
    }>;
    anomalyAllocations: Array<{
      allocationId: number;
      allocationType: 'receipt' | 'credit';
      receiptId?: number;
      receiptNumber?: string;
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      amountApplied: number;
      issue: string;
      note: string;
    }>;
    summary: {
      totalInvoices: number;
      invoicesWithIssues: number;
      totalReceipts: number;
      voidedReceiptsWithIssues: number;
      invoicesWithDeletedBalanceBfwd: number;
      receiptsWithUnallocatedAmounts: number;
      unrecordedCredits: number;
      anomalyAllocations: number;
    };
  }> {
    this.logger.log('Starting data integrity audit...');

    const allInvoices = await this.invoiceRepository.find({
      relations: [
        'student',
        'allocations',
        'creditAllocations',
        'creditAllocations.studentCredit',
        'balanceBfwd', // Load balance brought forward for older invoices
        'bills',
        'bills.fees',
        'exemption',
      ],
    });

    const allReceipts = await this.receiptRepository.find({
      relations: ['allocations', 'allocations.invoice', 'student', 'receiptCredits'],
    });

    const allStudentCredits = await this.studentCreditRepository.find({
      relations: ['receiptCredits', 'creditAllocations', 'creditAllocations.invoice'],
    });

    // Query invoices with balanceId to detect deleted balanceBfwd
    // This helps identify cases where balanceBfwd was deleted but totalBill still includes it
    const invoicesWithBalanceId = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select(['invoice.id', 'invoice.balanceId'])
      .where('invoice.balanceId IS NOT NULL')
      .getMany();

    // Create a map for quick lookup
    const balanceIdMap = new Map<number, number | null>();
    for (const inv of invoicesWithBalanceId) {
      balanceIdMap.set(inv.id, (inv as any).balanceId);
    }

    const invoicesWithBalanceIssues: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      expectedBalance: number;
      actualBalance: number;
      difference: number;
    }> = [];

    const invoicesWithMissingCreditAllocations: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      amountPaidOnInvoice: number;
      totalReceiptAllocations: number;
      missingCreditAmount: number;
    }> = [];

    const invoicesWithDeletedBalanceBfwd: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      balanceId: number | null;
      totalBill: number;
      calculatedTotalBill: number;
      possibleBalanceBfwdAmount: number;
      note: string;
    }> = [];

    const voidedReceiptsWithIncompleteReversals: Array<{
      receiptId: number;
      receiptNumber: string;
      studentNumber: string;
      amountPaid: number;
      totalAllocations: number;
      shouldHaveReversed: number;
    }> = [];

    const receiptsWithUnallocatedAmounts: Array<{
      receiptId: number;
      receiptNumber: string;
      studentNumber: string;
      amountPaid: number;
      totalAllocations: number;
      unallocatedAmount: number;
    }> = [];

    const unrecordedCredits: Array<{
      studentCreditId: number;
      studentNumber: string;
      creditAmount: number;
      receiptCreditsCount: number;
      note: string;
    }> = [];

    const anomalyAllocations: Array<{
      allocationId: number;
      allocationType: 'receipt' | 'credit';
      receiptId?: number;
      receiptNumber?: string;
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      amountApplied: number;
      issue: string;
      note: string;
    }> = [];

    // Audit invoices
    for (const invoice of allInvoices) {
      // Check for deleted balanceBfwd: balanceId exists but balanceBfwd is null
      // Calculate what totalBill should be from bills and exemption
      const totalBillsAmount = invoice.bills?.reduce(
        (sum, bill) => sum + Number(bill.fees?.amount || 0),
        0,
      ) || 0;
      const exemptedAmount = Number(invoice.exemptedAmount || 0);
      const calculatedTotalBill = totalBillsAmount - exemptedAmount;
      const actualTotalBill = Number(invoice.totalBill);

      // Check if balanceId exists but balanceBfwd is null (deleted)
      const balanceId = balanceIdMap.get(invoice.id);
      const hasBalanceId = balanceId !== undefined && balanceId !== null;
      const balanceBfwdDeleted =
        hasBalanceId && !invoice.balanceBfwd && actualTotalBill > calculatedTotalBill;

      if (balanceBfwdDeleted) {
        const possibleBalanceBfwdAmount = actualTotalBill - calculatedTotalBill;
        invoicesWithDeletedBalanceBfwd.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          studentNumber: invoice.student?.studentNumber || 'Unknown',
          balanceId: balanceId || null,
          totalBill: actualTotalBill,
          calculatedTotalBill,
          possibleBalanceBfwdAmount,
          note: 'Balance brought forward was deleted but totalBill still includes it. Balance calculation should still be correct.',
        });
      }

      // Check balance consistency
      // Note: totalBill should already include balanceBfwd if it exists (from saveInvoice)
      // Expected balance = totalBill (which includes balanceBfwd) - amountPaidOnInvoice
      // This is correct even if balanceBfwd was deleted, as long as totalBill includes it
      const expectedBalance =
        Number(invoice.totalBill) - Number(invoice.amountPaidOnInvoice);
      const actualBalance = Number(invoice.balance);
      const tolerance = 0.01;

      if (Math.abs(expectedBalance - actualBalance) > tolerance) {
        invoicesWithBalanceIssues.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          studentNumber: invoice.student?.studentNumber || 'Unknown',
          expectedBalance,
          actualBalance,
          difference: Math.abs(expectedBalance - actualBalance),
        });
      }

      // Check for missing credit allocations
      const totalReceiptAllocations = invoice.allocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied),
        0,
      );
      const totalCreditAllocations = invoice.creditAllocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied),
        0,
      );
      const amountPaidOnInvoice = Number(invoice.amountPaidOnInvoice);

      // If amountPaidOnInvoice > totalReceiptAllocations, there's likely missing credit allocations
      const missingCreditAmount =
        amountPaidOnInvoice - totalReceiptAllocations - totalCreditAllocations;

      if (missingCreditAmount > 0.01) {
        invoicesWithMissingCreditAllocations.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          studentNumber: invoice.student?.studentNumber || 'Unknown',
          amountPaidOnInvoice,
          totalReceiptAllocations,
          missingCreditAmount,
        });
      }
    }

    // Audit receipts
    for (const receipt of allReceipts) {
      const totalAllocations = receipt.allocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied),
        0,
      );
      const amountPaid = Number(receipt.amountPaid);

      if (receipt.isVoided) {
        // If allocations still exist, the reversal wasn't complete
        if (totalAllocations > 0.01) {
          voidedReceiptsWithIncompleteReversals.push({
            receiptId: receipt.id,
            receiptNumber: receipt.receiptNumber,
            studentNumber: receipt.student?.studentNumber || 'Unknown',
            amountPaid,
            totalAllocations,
            shouldHaveReversed: totalAllocations,
          });
        }
      } else {
        // Check for unallocated amounts in non-voided receipts
        const unallocatedAmount = amountPaid - totalAllocations;
        const tolerance = 0.01;

        if (unallocatedAmount > tolerance) {
          receiptsWithUnallocatedAmounts.push({
            receiptId: receipt.id,
            receiptNumber: receipt.receiptNumber,
            studentNumber: receipt.student?.studentNumber || 'Unknown',
            amountPaid,
            totalAllocations,
            unallocatedAmount,
          });
        }
      }
    }

    // Audit student credits for unrecorded credits
    for (const studentCredit of allStudentCredits) {
      const creditAmount = Number(studentCredit.amount);
      const receiptCreditsCount = studentCredit.receiptCredits?.length || 0;

      // If credit exists but has no ReceiptCreditEntity links, it's unrecorded
      // This means the credit was created but not properly linked to a receipt
      if (creditAmount > 0.01 && receiptCreditsCount === 0) {
        unrecordedCredits.push({
          studentCreditId: studentCredit.id,
          studentNumber: studentCredit.studentNumber,
          creditAmount,
          receiptCreditsCount,
          note: 'Credit exists but has no ReceiptCreditEntity link. May have been created before full implementation.',
        });
      }

      // Check credit allocations for anomalies
      if (studentCredit.creditAllocations) {
        for (const creditAlloc of studentCredit.creditAllocations) {
          const invoice = creditAlloc.invoice;
          const amountApplied = Number(creditAlloc.amountApplied);

          // Skip if invoice is null (deleted invoice but allocation still exists)
          if (!invoice) {
            anomalyAllocations.push({
              allocationId: creditAlloc.id,
              allocationType: 'credit',
              invoiceId: 0,
              invoiceNumber: 'DELETED',
              studentNumber: studentCredit.studentNumber,
              amountApplied,
              issue: 'deleted_invoice',
              note: `Credit allocation to deleted invoice (allocation ID: ${creditAlloc.id})`,
            });
            continue;
          }

          const invoiceBalance = Number(invoice.balance);
          const invoiceTotalBill = Number(invoice.totalBill);
          const invoiceAmountPaid = Number(invoice.amountPaidOnInvoice);

          // Check if allocation exceeds invoice balance
          if (amountApplied > invoiceBalance + 0.01) {
            anomalyAllocations.push({
              allocationId: creditAlloc.id,
              allocationType: 'credit',
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              studentNumber: studentCredit.studentNumber,
              amountApplied,
              issue: 'over_allocation',
              note: `Credit allocation (${amountApplied}) exceeds invoice balance (${invoiceBalance}). Invoice total: ${invoiceTotalBill}, Amount paid: ${invoiceAmountPaid}`,
            });
          }

          // Check if allocation is to voided invoice
          if (invoice.isVoided) {
            anomalyAllocations.push({
              allocationId: creditAlloc.id,
              allocationType: 'credit',
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              studentNumber: studentCredit.studentNumber,
              amountApplied,
              issue: 'voided_invoice',
              note: `Credit allocation to voided invoice ${invoice.invoiceNumber}`,
            });
          }
        }
      }
    }

    // Audit receipt allocations for anomalies
    for (const receipt of allReceipts) {
      if (receipt.allocations) {
        for (const alloc of receipt.allocations) {
          const invoice = alloc.invoice;
          const amountApplied = Number(alloc.amountApplied);
          const receiptAmountPaid = Number(receipt.amountPaid);

          // Skip if invoice is null (deleted invoice but allocation still exists)
          if (!invoice) {
            anomalyAllocations.push({
              allocationId: alloc.id,
              allocationType: 'receipt',
              receiptId: receipt.id,
              receiptNumber: receipt.receiptNumber,
              invoiceId: 0,
              invoiceNumber: 'DELETED',
              studentNumber: receipt.student?.studentNumber || 'Unknown',
              amountApplied,
              issue: 'deleted_invoice',
              note: `Allocation to deleted invoice (allocation ID: ${alloc.id})`,
            });
            continue;
          }

          const invoiceBalance = Number(invoice.balance);
          const invoiceTotalBill = Number(invoice.totalBill);
          const invoiceAmountPaid = Number(invoice.amountPaidOnInvoice);

          // Check if allocation is from voided receipt
          if (receipt.isVoided) {
            anomalyAllocations.push({
              allocationId: alloc.id,
              allocationType: 'receipt',
              receiptId: receipt.id,
              receiptNumber: receipt.receiptNumber,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              studentNumber: receipt.student?.studentNumber || 'Unknown',
              amountApplied,
              issue: 'voided_receipt',
              note: `Allocation from voided receipt ${receipt.receiptNumber}`,
            });
          }

          // Check if allocation exceeds invoice balance
          if (amountApplied > invoiceBalance + 0.01) {
            anomalyAllocations.push({
              allocationId: alloc.id,
              allocationType: 'receipt',
              receiptId: receipt.id,
              receiptNumber: receipt.receiptNumber,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              studentNumber: receipt.student?.studentNumber || 'Unknown',
              amountApplied,
              issue: 'over_allocation',
              note: `Receipt allocation (${amountApplied}) exceeds invoice balance (${invoiceBalance}). Invoice total: ${invoiceTotalBill}, Amount paid: ${invoiceAmountPaid}`,
            });
          }

          // Check if allocation is to voided invoice
          if (invoice.isVoided) {
            anomalyAllocations.push({
              allocationId: alloc.id,
              allocationType: 'receipt',
              receiptId: receipt.id,
              receiptNumber: receipt.receiptNumber,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              studentNumber: receipt.student?.studentNumber || 'Unknown',
              amountApplied,
              issue: 'voided_invoice',
              note: `Receipt allocation to voided invoice ${invoice.invoiceNumber}`,
            });
          }

          // Check if allocation exceeds receipt amount
          if (amountApplied > receiptAmountPaid + 0.01) {
            anomalyAllocations.push({
              allocationId: alloc.id,
              allocationType: 'receipt',
              receiptId: receipt.id,
              receiptNumber: receipt.receiptNumber,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              studentNumber: receipt.student?.studentNumber || 'Unknown',
              amountApplied,
              issue: 'exceeds_receipt',
              note: `Allocation (${amountApplied}) exceeds receipt amount (${receiptAmountPaid})`,
            });
          }

          // Check if receipt and invoice belong to different students
          if (
            receipt.student?.studentNumber !== invoice.student?.studentNumber
          ) {
            anomalyAllocations.push({
              allocationId: alloc.id,
              allocationType: 'receipt',
              receiptId: receipt.id,
              receiptNumber: receipt.receiptNumber,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              studentNumber: receipt.student?.studentNumber || 'Unknown',
              amountApplied,
              issue: 'student_mismatch',
              note: `Receipt student (${receipt.student?.studentNumber}) does not match invoice student (${invoice.student?.studentNumber})`,
            });
          }
        }
      }
    }

    const summary = {
      totalInvoices: allInvoices.length,
      invoicesWithIssues:
        invoicesWithBalanceIssues.length +
        invoicesWithMissingCreditAllocations.length,
      totalReceipts: allReceipts.length,
      voidedReceiptsWithIssues: voidedReceiptsWithIncompleteReversals.length,
      invoicesWithDeletedBalanceBfwd: invoicesWithDeletedBalanceBfwd.length,
      receiptsWithUnallocatedAmounts: receiptsWithUnallocatedAmounts.length,
      unrecordedCredits: unrecordedCredits.length,
      anomalyAllocations: anomalyAllocations.length,
    };

    this.logger.log('Data integrity audit completed', summary);

    return {
      invoicesWithBalanceIssues,
      invoicesWithMissingCreditAllocations,
      invoicesWithDeletedBalanceBfwd,
      voidedReceiptsWithIncompleteReversals,
      receiptsWithUnallocatedAmounts,
      unrecordedCredits,
      anomalyAllocations,
      summary,
    };
  }

  /**
   * Verifies that amountPaidOnInvoice matches actual allocations (receipt + credit)
   * @returns Report of invoices with mismatched amountPaidOnInvoice
   */
  async verifyAmountPaidOnInvoice(): Promise<{
    invoicesWithMismatchedAmountPaid: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      amountPaidOnInvoice: number;
      totalReceiptAllocations: number;
      totalCreditAllocations: number;
      calculatedAmountPaid: number;
      difference: number;
      isAmountPaidTooHigh: boolean;
      isAmountPaidTooLow: boolean;
    }>;
    summary: {
      totalInvoices: number;
      invoicesWithMismatches: number;
      invoicesWithAmountPaidTooHigh: number;
      invoicesWithAmountPaidTooLow: number;
      totalDifference: number;
    };
  }> {
    this.logger.log('Starting amountPaidOnInvoice verification...');

    const allInvoices = await this.invoiceRepository.find({
      relations: [
        'student',
        'allocations',
        'creditAllocations',
        'creditAllocations.studentCredit',
        'balanceBfwd', // Load balance brought forward for older invoices
        'bills',
        'bills.fees',
        'exemption',
      ],
    });

    // Also query invoices with balanceId to detect deleted balanceBfwd
    const invoicesWithBalanceId = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .leftJoinAndSelect('invoice.bills', 'bills')
      .leftJoinAndSelect('bills.fees', 'fees')
      .leftJoinAndSelect('invoice.exemption', 'exemption')
      .where('invoice.balanceId IS NOT NULL')
      .getMany();

    const invoicesWithMismatchedAmountPaid: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      amountPaidOnInvoice: number;
      totalReceiptAllocations: number;
      totalCreditAllocations: number;
      calculatedAmountPaid: number;
      difference: number;
      isAmountPaidTooHigh: boolean;
      isAmountPaidTooLow: boolean;
    }> = [];

    let invoicesWithAmountPaidTooHigh = 0;
    let invoicesWithAmountPaidTooLow = 0;
    let totalDifference = 0;

    for (const invoice of allInvoices) {
      const totalReceiptAllocations = invoice.allocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied),
        0,
      );
      const totalCreditAllocations = invoice.creditAllocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied),
        0,
      );
      const calculatedAmountPaid =
        totalReceiptAllocations + totalCreditAllocations;
      const amountPaidOnInvoice = Number(invoice.amountPaidOnInvoice);
      const difference = Math.abs(calculatedAmountPaid - amountPaidOnInvoice);
      const tolerance = 0.01;

      if (difference > tolerance) {
        const isAmountPaidTooHigh = amountPaidOnInvoice > calculatedAmountPaid;
        const isAmountPaidTooLow = amountPaidOnInvoice < calculatedAmountPaid;

        if (isAmountPaidTooHigh) {
          invoicesWithAmountPaidTooHigh++;
        } else {
          invoicesWithAmountPaidTooLow++;
        }

        totalDifference += difference;

        invoicesWithMismatchedAmountPaid.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          studentNumber: invoice.student?.studentNumber || 'Unknown',
          amountPaidOnInvoice,
          totalReceiptAllocations,
          totalCreditAllocations,
          calculatedAmountPaid,
          difference,
          isAmountPaidTooHigh,
          isAmountPaidTooLow,
        });
      }
    }

    const summary = {
      totalInvoices: allInvoices.length,
      invoicesWithMismatches: invoicesWithMismatchedAmountPaid.length,
      invoicesWithAmountPaidTooHigh,
      invoicesWithAmountPaidTooLow,
      totalDifference,
    };

    this.logger.log('AmountPaidOnInvoice verification completed', summary);

    return {
      invoicesWithMismatchedAmountPaid,
      summary,
    };
  }

  /**
   * Generates a detailed repair report showing what will change
   * @returns Detailed report of all repairs that would be made
   */
  async generateRepairReport(): Promise<{
    balanceRepairs: {
      totalIssues: number;
      repairs: Array<{
        invoiceId: number;
        invoiceNumber: string;
        studentNumber: string;
        currentBalance: number;
        expectedBalance: number;
        difference: number;
        currentAmountPaid: number;
        totalBill: number;
        amountPaidVerified: boolean;
        verificationStatus: string;
      }>;
    };
    voidedReceiptRepairs: {
      totalIssues: number;
      repairs: Array<{
        receiptId: number;
        receiptNumber: string;
        studentNumber: string;
        amountPaid: number;
        totalAllocations: number;
        invoicesAffected: Array<{
          invoiceId: number;
          invoiceNumber: string;
          currentBalance: number;
          allocationAmount: number;
          newBalance: number;
        }>;
      }>;
    };
    missingCreditAllocationRepairs: {
      totalIssues: number;
      repairs: Array<{
        invoiceId: number;
        invoiceNumber: string;
        studentNumber: string;
        missingCreditAmount: number;
        currentAmountPaid: number;
        totalReceiptAllocations: number;
        willCreateCreditAllocation: boolean;
      }>;
    };
    deletedBalanceBfwdIssues: {
      totalIssues: number;
      invoices: Array<{
        invoiceId: number;
        invoiceNumber: string;
        studentNumber: string;
        balanceId: number | null;
        totalBill: number;
        calculatedTotalBill: number;
        possibleBalanceBfwdAmount: number;
        note: string;
      }>;
    };
    summary: {
      totalIssues: number;
      totalInvoicesAffected: number;
      totalReceiptsAffected: number;
      estimatedBalanceChanges: {
        totalBalanceIncrease: number;
        totalBalanceDecrease: number;
        netBalanceChange: number;
      };
    };
  }> {
    this.logger.log('Generating detailed repair report...');

    const audit = await this.auditDataIntegrity();
    const amountPaidVerification = await this.verifyAmountPaidOnInvoice();

    // Create a map of verification results for quick lookup
    const verificationMap = new Map<number, {
      isAmountPaidTooHigh: boolean;
      isAmountPaidTooLow: boolean;
      difference: number;
    }>();

    for (const mismatch of amountPaidVerification.invoicesWithMismatchedAmountPaid) {
      verificationMap.set(mismatch.invoiceId, {
        isAmountPaidTooHigh: mismatch.isAmountPaidTooHigh,
        isAmountPaidTooLow: mismatch.isAmountPaidTooLow,
        difference: mismatch.difference,
      });
    }

    // Balance repairs report
    const balanceRepairs: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      currentBalance: number;
      expectedBalance: number;
      difference: number;
      currentAmountPaid: number;
      totalBill: number;
      amountPaidVerified: boolean;
      verificationStatus: string;
    }> = [];

    let totalBalanceIncrease = 0;
    let totalBalanceDecrease = 0;

    for (const issue of audit.invoicesWithBalanceIssues) {
      const invoice = await this.invoiceRepository.findOne({
        where: { id: issue.invoiceId },
        relations: ['student', 'allocations', 'creditAllocations', 'balanceBfwd'],
      });

      if (!invoice) continue;

      const verification = verificationMap.get(invoice.id);
      const amountPaidVerified = !verification;
      let verificationStatus = 'Verified';
      if (verification) {
        if (verification.isAmountPaidTooHigh) {
          verificationStatus = `WARNING: amountPaidOnInvoice is ${verification.difference.toFixed(2)} too high`;
        } else {
          verificationStatus = `WARNING: amountPaidOnInvoice is ${verification.difference.toFixed(2)} too low`;
        }
      }

      const balanceChange = issue.expectedBalance - issue.actualBalance;
      if (balanceChange > 0) {
        totalBalanceIncrease += balanceChange;
      } else {
        totalBalanceDecrease += Math.abs(balanceChange);
      }

      balanceRepairs.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        studentNumber: invoice.student?.studentNumber || 'Unknown',
        currentBalance: issue.actualBalance,
        expectedBalance: issue.expectedBalance,
        difference: Math.abs(balanceChange),
        currentAmountPaid: Number(invoice.amountPaidOnInvoice),
        totalBill: Number(invoice.totalBill),
        amountPaidVerified,
        verificationStatus,
      });
    }

    // Voided receipt repairs report
    const voidedReceiptRepairs: Array<{
      receiptId: number;
      receiptNumber: string;
      studentNumber: string;
      amountPaid: number;
      totalAllocations: number;
      invoicesAffected: Array<{
        invoiceId: number;
        invoiceNumber: string;
        currentBalance: number;
        allocationAmount: number;
        newBalance: number;
      }>;
    }> = [];

    for (const issue of audit.voidedReceiptsWithIncompleteReversals) {
      const receipt = await this.receiptRepository.findOne({
        where: { id: issue.receiptId },
        relations: ['allocations', 'allocations.invoice', 'student'],
      });

      if (!receipt) continue;

      const invoicesAffected: Array<{
        invoiceId: number;
        invoiceNumber: string;
        currentBalance: number;
        allocationAmount: number;
        newBalance: number;
      }> = [];

      for (const allocation of receipt.allocations) {
        const invoice = allocation.invoice;
        if (invoice) {
          const allocationAmount = Number(allocation.amountApplied);
          const currentBalance = Number(invoice.balance);
          const newBalance = currentBalance + allocationAmount;

          invoicesAffected.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            currentBalance,
            allocationAmount,
            newBalance,
          });

          totalBalanceIncrease += allocationAmount;
        }
      }

      voidedReceiptRepairs.push({
        receiptId: receipt.id,
        receiptNumber: receipt.receiptNumber,
        studentNumber: receipt.student?.studentNumber || 'Unknown',
        amountPaid: Number(receipt.amountPaid),
        totalAllocations: issue.totalAllocations,
        invoicesAffected,
      });
    }

    // Missing credit allocation repairs report
    const missingCreditAllocationRepairs: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      missingCreditAmount: number;
      currentAmountPaid: number;
      totalReceiptAllocations: number;
      willCreateCreditAllocation: boolean;
    }> = [];

    for (const issue of audit.invoicesWithMissingCreditAllocations) {
      const invoice = await this.invoiceRepository.findOne({
        where: { id: issue.invoiceId },
        relations: ['student', 'balanceBfwd'],
      });

      if (!invoice) continue;

      missingCreditAllocationRepairs.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        studentNumber: invoice.student?.studentNumber || 'Unknown',
        missingCreditAmount: issue.missingCreditAmount,
        currentAmountPaid: issue.amountPaidOnInvoice,
        totalReceiptAllocations: issue.totalReceiptAllocations,
        willCreateCreditAllocation: true,
      });
    }

    // Get unique invoice IDs affected
    const affectedInvoiceIds = new Set<number>();
    balanceRepairs.forEach((r) => affectedInvoiceIds.add(r.invoiceId));
    voidedReceiptRepairs.forEach((r) =>
      r.invoicesAffected.forEach((inv) => affectedInvoiceIds.add(inv.invoiceId)),
    );
    missingCreditAllocationRepairs.forEach((r) =>
      affectedInvoiceIds.add(r.invoiceId),
    );
    audit.invoicesWithDeletedBalanceBfwd.forEach((r) =>
      affectedInvoiceIds.add(r.invoiceId),
    );

    const summary = {
      totalIssues:
        audit.invoicesWithBalanceIssues.length +
        audit.voidedReceiptsWithIncompleteReversals.length +
        audit.invoicesWithMissingCreditAllocations.length,
      totalInvoicesAffected: affectedInvoiceIds.size,
      totalReceiptsAffected: audit.voidedReceiptsWithIncompleteReversals.length,
      estimatedBalanceChanges: {
        totalBalanceIncrease,
        totalBalanceDecrease,
        netBalanceChange: totalBalanceIncrease - totalBalanceDecrease,
      },
    };

    this.logger.log('Repair report generated', summary);

    return {
      balanceRepairs: {
        totalIssues: audit.invoicesWithBalanceIssues.length,
        repairs: balanceRepairs,
      },
      voidedReceiptRepairs: {
        totalIssues: audit.voidedReceiptsWithIncompleteReversals.length,
        repairs: voidedReceiptRepairs,
      },
      missingCreditAllocationRepairs: {
        totalIssues: audit.invoicesWithMissingCreditAllocations.length,
        repairs: missingCreditAllocationRepairs,
      },
      deletedBalanceBfwdIssues: {
        totalIssues: audit.invoicesWithDeletedBalanceBfwd.length,
        invoices: audit.invoicesWithDeletedBalanceBfwd,
      },
      summary,
    };
  }

  /**
   * Repairs invoice balances based on allocations
   * @param dryRun - If true, only reports what would be fixed without making changes
   * @returns Report of repairs made
   */
  async repairInvoiceBalances(dryRun: boolean = true): Promise<{
    fixed: number;
    errors: number;
    details: Array<{
      invoiceId: number;
      invoiceNumber: string;
      oldBalance: number;
      newBalance: number;
    }>;
  }> {
    this.logger.log(
      `Starting invoice balance repair (dryRun: ${dryRun})...`,
    );

    const audit = await this.auditDataIntegrity();
    const details: Array<{
      invoiceId: number;
      invoiceNumber: string;
      oldBalance: number;
      newBalance: number;
    }> = [];

    let fixed = 0;
    let errors = 0;

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        for (const issue of audit.invoicesWithBalanceIssues) {
          try {
            const invoice = await transactionalEntityManager.findOne(
              InvoiceEntity,
              {
                where: { id: issue.invoiceId },
                relations: ['allocations', 'creditAllocations', 'balanceBfwd'],
              },
            );

            if (!invoice) {
              errors++;
              continue;
            }

            const oldBalance = Number(invoice.balance);
            const newBalance = issue.expectedBalance;

            // Note: expectedBalance is calculated as totalBill - amountPaidOnInvoice
            // totalBill should already include balanceBfwd if it exists (from saveInvoice)
            // This repair will set balance = totalBill - amountPaidOnInvoice
            // which correctly accounts for balanceBfwd since it's included in totalBill
            //
            // IMPORTANT: Even if balanceBfwd was deleted after being applied to the invoice,
            // totalBill should still include it (it was added when the invoice was saved).
            // We do NOT modify totalBill in this repair - we only fix the balance calculation.
            // This ensures that invoices with deleted balanceBfwd are handled correctly.

            if (!dryRun) {
              invoice.balance = newBalance;
              invoice.status = this.getInvoiceStatus(invoice);
              await transactionalEntityManager.save(invoice);
            }

            details.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              oldBalance,
              newBalance,
            });

            fixed++;
          } catch (error) {
            this.logger.error(
              `Error repairing invoice ${issue.invoiceId}`,
              { error, invoiceId: issue.invoiceId },
            );
            errors++;
          }
        }

        this.logger.log(
          `Invoice balance repair completed: Fixed ${fixed}, Errors ${errors} (dryRun: ${dryRun})`,
        );

        return { fixed, errors, details };
      },
    );
  }

  /**
   * Repairs voided receipts by properly reversing their allocations
   * @param dryRun - If true, only reports what would be fixed without making changes
   * @returns Report of repairs made
   */
  async repairVoidedReceipts(dryRun: boolean = true): Promise<{
    fixed: number;
    errors: number;
    details: Array<{
      receiptId: number;
      receiptNumber: string;
      invoicesUpdated: number;
    }>;
  }> {
    this.logger.log(
      `Starting voided receipt repair (dryRun: ${dryRun})...`,
    );

    const audit = await this.auditDataIntegrity();
    const details: Array<{
      receiptId: number;
      receiptNumber: string;
      invoicesUpdated: number;
    }> = [];

    let fixed = 0;
    let errors = 0;

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        for (const issue of audit.voidedReceiptsWithIncompleteReversals) {
          try {
            const receipt = await transactionalEntityManager.findOne(
              ReceiptEntity,
              {
                where: { id: issue.receiptId },
                relations: [
                  'allocations',
                  'allocations.invoice',
                  'student',
                  'receiptCredits',
                  'receiptCredits.studentCredit',
                ],
              },
            );

            if (!receipt || !receipt.isVoided) {
              errors++;
              continue;
            }

            const invoicesToUpdate: InvoiceEntity[] = [];

            // Reverse allocations manually since receipt is already voided
            for (const allocation of receipt.allocations) {
              const invoice = allocation.invoice;
              const amountApplied = Number(allocation.amountApplied);

              if (invoice) {
                // Decrease amountPaidOnInvoice and increase balance
                invoice.amountPaidOnInvoice = Math.max(
                  0,
                  Number(invoice.amountPaidOnInvoice) - amountApplied,
                );
                invoice.balance = Number(invoice.balance) + amountApplied;
                invoice.status = this.getInvoiceStatus(invoice);

                invoicesToUpdate.push(invoice);
              }

              // Delete the allocation
              if (!dryRun) {
                await transactionalEntityManager.remove(allocation);
              }
            }

            // Handle credit reversal if ReceiptCreditEntity exists
            if (receipt.receiptCredits && receipt.receiptCredits.length > 0) {
              for (const receiptCredit of receipt.receiptCredits) {
                const creditAmount = Number(receiptCredit.creditAmount);
                const studentCredit = receiptCredit.studentCredit;
                const currentCreditAmount = Number(studentCredit.amount);

                // Reverse the credit
                if (!dryRun) {
                  studentCredit.amount = Math.max(
                    0,
                    currentCreditAmount - creditAmount,
                  );
                  studentCredit.lastCreditSource = `Reversed: Overpayment from Receipt ${receipt.receiptNumber} (system-repair)`;
                  await transactionalEntityManager.save(studentCredit);

                  // Delete the ReceiptCreditEntity
                  await transactionalEntityManager.remove(receiptCredit);
                }
              }
            }

            // Save updated invoices
            if (!dryRun && invoicesToUpdate.length > 0) {
              await transactionalEntityManager.save(invoicesToUpdate);

              // Verify balances after update
              for (const invoice of invoicesToUpdate) {
                this.verifyInvoiceBalance(invoice);
              }
            }

            details.push({
              receiptId: issue.receiptId,
              receiptNumber: issue.receiptNumber,
              invoicesUpdated: invoicesToUpdate.length,
            });

            fixed++;
          } catch (error) {
            this.logger.error(
              `Error repairing voided receipt ${issue.receiptId}`,
              { error, receiptId: issue.receiptId },
            );
            errors++;
          }
        }

        this.logger.log(
          `Voided receipt repair completed: Fixed ${fixed}, Errors ${errors} (dryRun: ${dryRun})`,
        );

        return { fixed, errors, details };
      },
    );
  }

  /**
   * Repairs missing credit allocations by creating CreditInvoiceAllocationEntity records
   * @param dryRun - If true, only reports what would be fixed without making changes
   * @returns Report of repairs made
   */
  async repairMissingCreditAllocations(dryRun: boolean = true): Promise<{
    fixed: number;
    errors: number;
    details: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      missingCreditAmount: number;
      creditAllocationsCreated: number;
    }>;
  }> {
    this.logger.log(
      `Starting missing credit allocations repair (dryRun: ${dryRun})...`,
    );

    const audit = await this.auditDataIntegrity();
    const details: Array<{
      invoiceId: number;
      invoiceNumber: string;
      studentNumber: string;
      missingCreditAmount: number;
      creditAllocationsCreated: number;
    }> = [];

    let fixed = 0;
    let errors = 0;

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        for (const issue of audit.invoicesWithMissingCreditAllocations) {
          try {
            const invoice = await transactionalEntityManager.findOne(
              InvoiceEntity,
              {
                where: { id: issue.invoiceId },
                relations: [
                  'student',
                  'creditAllocations',
                  'creditAllocations.studentCredit',
                  'balanceBfwd', // Load balance brought forward for older invoices
                ],
              },
            );

            if (!invoice || !invoice.student) {
              errors++;
              continue;
            }

            const studentNumber = invoice.student.studentNumber;
            const missingCreditAmount = issue.missingCreditAmount;

            // Find or create student credit for this student
            let studentCredit = await transactionalEntityManager.findOne(
              StudentCreditEntity,
              {
                where: { studentNumber },
                relations: ['creditAllocations'],
              },
            );

            if (!studentCredit) {
              // Create a new student credit entry for historical purposes
              if (!dryRun) {
                studentCredit = transactionalEntityManager.create(
                  StudentCreditEntity,
                  {
                    studentNumber,
                    amount: 0, // We're just creating this to link allocations
                    lastCreditSource: `Historical credit allocation repair for Invoice ${invoice.invoiceNumber}`,
                  },
                );
                await transactionalEntityManager.save(studentCredit);
              } else {
                // In dry run, we can't create the credit, so skip
                this.logger.warn(
                  `Dry run: Would create student credit for ${studentNumber} to repair invoice ${invoice.invoiceNumber}`,
                );
                details.push({
                  invoiceId: invoice.id,
                  invoiceNumber: invoice.invoiceNumber,
                  studentNumber,
                  missingCreditAmount,
                  creditAllocationsCreated: 0,
                });
                continue;
              }
            }

            // Create the missing credit allocation record
            if (!dryRun) {
              const creditAllocation = transactionalEntityManager.create(
                CreditInvoiceAllocationEntity,
                {
                  studentCredit: studentCredit,
                  invoice: invoice,
                  amountApplied: missingCreditAmount,
                  allocationDate: invoice.invoiceDate || new Date(), // Use invoice date or current date
                },
              );
              await transactionalEntityManager.save(creditAllocation);

              this.logger.log(
                `Created missing credit allocation for invoice ${invoice.invoiceNumber}: ${missingCreditAmount}`,
                {
                  invoiceId: invoice.id,
                  invoiceNumber: invoice.invoiceNumber,
                  studentNumber,
                  missingCreditAmount,
                },
              );
            }

            details.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              studentNumber,
              missingCreditAmount,
              creditAllocationsCreated: 1,
            });

            fixed++;
          } catch (error) {
            this.logger.error(
              `Error repairing missing credit allocation for invoice ${issue.invoiceId}`,
              { error, invoiceId: issue.invoiceId },
            );
            errors++;
          }
        }

        this.logger.log(
          `Missing credit allocations repair completed: Fixed ${fixed}, Errors ${errors} (dryRun: ${dryRun})`,
        );

        return { fixed, errors, details };
      },
    );
  }

  /**
   * Comprehensive data repair - runs all repair operations
   * @param dryRun - If true, only reports what would be fixed without making changes
   * @returns Complete report of all repairs
   */
  /**
   * Repairs unallocated receipt amounts by allocating them to invoices
   * @param dryRun - If true, only reports what would be fixed without making changes
   * @returns Report of repairs made
   */
  async repairUnallocatedReceiptAmounts(dryRun: boolean = true): Promise<{
    fixed: number;
    errors: number;
    details: Array<{
      receiptId: number;
      receiptNumber: string;
      studentNumber: string;
      unallocatedAmount: number;
      allocationsCreated: number;
      invoicesUpdated: number;
    }>;
  }> {
    this.logger.log(
      `Starting unallocated receipt amounts repair (dryRun: ${dryRun})...`,
    );

    const audit = await this.auditDataIntegrity();
    const details: Array<{
      receiptId: number;
      receiptNumber: string;
      studentNumber: string;
      unallocatedAmount: number;
      allocationsCreated: number;
      invoicesUpdated: number;
    }> = [];

    let fixed = 0;
    let errors = 0;

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        for (const issue of audit.receiptsWithUnallocatedAmounts) {
          try {
            const receipt = await transactionalEntityManager.findOne(
              ReceiptEntity,
              {
                where: { id: issue.receiptId },
                relations: ['allocations', 'allocations.invoice', 'student'],
              },
            );

            if (!receipt || !receipt.student || receipt.isVoided) {
              errors++;
              continue;
            }

            const studentNumber = receipt.student.studentNumber;
            const unallocatedAmount = issue.unallocatedAmount;

            // Find open invoices for this student (FIFO by due date)
            // Exclude voided invoices
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
                  isVoided: false,
                },
                relations: ['allocations', 'student'],
                order: {
                  invoiceDueDate: 'ASC',
                },
              },
            );

            let remainingAmount = unallocatedAmount;
            const allocationsToCreate: ReceiptInvoiceAllocationEntity[] = [];
            const invoicesToUpdate: InvoiceEntity[] = [];

            // Allocate unallocated amount to open invoices (FIFO)
            for (const invoice of openInvoices) {
              if (remainingAmount <= 0) break;

              const invoiceBalance = Number(invoice.balance);
              if (invoiceBalance <= 0) continue;

              const amountToAllocate = Math.min(remainingAmount, invoiceBalance);

              // Create allocation (or track for dry run)
              if (!dryRun) {
                const allocation = transactionalEntityManager.create(
                  ReceiptInvoiceAllocationEntity,
                  {
                    receipt: receipt,
                    invoice: invoice,
                    amountApplied: amountToAllocate,
                    allocationDate: receipt.paymentDate || new Date(),
                  },
                );
                allocationsToCreate.push(allocation);

                // Update invoice
                invoice.amountPaidOnInvoice =
                  Number(invoice.amountPaidOnInvoice) + amountToAllocate;
                invoice.balance = invoiceBalance - amountToAllocate;
                invoice.status = this.getInvoiceStatus(invoice);
                invoicesToUpdate.push(invoice);
              } else {
                // In dry run, still track what would be allocated
                allocationsToCreate.push({
                  id: 0, // Placeholder for dry run
                  receipt: receipt,
                  invoice: invoice,
                  amountApplied: amountToAllocate,
                  allocationDate: receipt.paymentDate || new Date(),
                } as any);
                invoicesToUpdate.push(invoice);
              }

              remainingAmount -= amountToAllocate;
            }

            // If there's still remaining amount after allocating to all open invoices,
            // create student credit (overpayment)
            if (remainingAmount > 0.01 && !dryRun) {
              const studentCredit = await this.createOrUpdateStudentCredit(
                studentNumber,
                remainingAmount,
                transactionalEntityManager,
                `Overpayment from Receipt ${receipt.receiptNumber} (system-repair)`,
              );

              // Create ReceiptCreditEntity to track the link
              const receiptCredit = transactionalEntityManager.create(
                ReceiptCreditEntity,
                {
                  receipt: receipt,
                  studentCredit: studentCredit,
                  creditAmount: remainingAmount,
                  createdAt: receipt.paymentDate || new Date(),
                },
              );
              await transactionalEntityManager.save(receiptCredit);
            }

            // Save allocations and invoices
            if (!dryRun) {
              await transactionalEntityManager.save(allocationsToCreate);
              await transactionalEntityManager.save(invoicesToUpdate);

              // Verify balances
              for (const invoice of invoicesToUpdate) {
                this.verifyInvoiceBalance(invoice);
              }
            }

            details.push({
              receiptId: receipt.id,
              receiptNumber: receipt.receiptNumber,
              studentNumber,
              unallocatedAmount,
              allocationsCreated: allocationsToCreate.length,
              invoicesUpdated: invoicesToUpdate.length,
            });

            fixed++;
          } catch (error) {
            this.logger.error(
              `Error repairing unallocated receipt amount ${issue.receiptId}`,
              { error, receiptId: issue.receiptId },
            );
            errors++;
          }
        }

        this.logger.log(
          `Unallocated receipt amounts repair completed: Fixed ${fixed}, Errors ${errors} (dryRun: ${dryRun})`,
        );

        return { fixed, errors, details };
      },
    );
  }

  /**
   * Repairs unrecorded credits by attempting to link them to receipts
   * @param dryRun - If true, only reports what would be fixed without making changes
   * @returns Report of repairs made
   */
  async repairUnrecordedCredits(dryRun: boolean = true): Promise<{
    fixed: number;
    errors: number;
    details: Array<{
      studentCreditId: number;
      studentNumber: string;
      creditAmount: number;
      receiptCreditsCreated: number;
    }>;
  }> {
    this.logger.log(
      `Starting unrecorded credits repair (dryRun: ${dryRun})...`,
    );

    const audit = await this.auditDataIntegrity();
    const details: Array<{
      studentCreditId: number;
      studentNumber: string;
      creditAmount: number;
      receiptCreditsCreated: number;
    }> = [];

    let fixed = 0;
    let errors = 0;

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        for (const issue of audit.unrecordedCredits) {
          try {
            const studentCredit = await transactionalEntityManager.findOne(
              StudentCreditEntity,
              {
                where: { id: issue.studentCreditId },
                relations: ['receiptCredits'],
              },
            );

            if (!studentCredit) {
              errors++;
              continue;
            }

            const studentNumber = studentCredit.studentNumber;
            const creditAmount = Number(studentCredit.amount);

            // Find receipts for this student that have unallocated amounts
            // These might be the source of the credit
            const studentReceipts = await transactionalEntityManager.find(
              ReceiptEntity,
              {
                where: {
                  student: { studentNumber },
                  isVoided: false,
                },
                relations: ['allocations', 'receiptCredits'],
              },
            );

            let receiptCreditsCreated = 0;
            let remainingCredit = creditAmount;

            // Try to match credit with receipts that have unallocated amounts
            for (const receipt of studentReceipts) {
              if (remainingCredit <= 0.01) break;

              const totalAllocations = receipt.allocations.reduce(
                (sum, alloc) => sum + Number(alloc.amountApplied),
                0,
              );
              const unallocatedAmount =
                Number(receipt.amountPaid) - totalAllocations;

              // Check if this receipt already has a ReceiptCreditEntity
              const hasReceiptCredit =
                receipt.receiptCredits && receipt.receiptCredits.length > 0;

              // If receipt has unallocated amount and no ReceiptCreditEntity,
              // create a link (assuming this receipt created the credit)
              if (
                unallocatedAmount > 0.01 &&
                !hasReceiptCredit &&
                remainingCredit > 0.01 &&
                !dryRun
              ) {
                const creditToLink = Math.min(unallocatedAmount, remainingCredit);

                const receiptCredit = transactionalEntityManager.create(
                  ReceiptCreditEntity,
                  {
                    receipt: receipt,
                    studentCredit: studentCredit,
                    creditAmount: creditToLink,
                    createdAt: receipt.paymentDate || new Date(),
                  },
                );
                await transactionalEntityManager.save(receiptCredit);
                receiptCreditsCreated++;
                remainingCredit -= creditToLink;
              }
            }

            // If we couldn't link all credit, create a note
            if (remainingCredit > 0.01 && !dryRun) {
              this.logger.warn(
                `Could not fully link credit for student ${studentNumber}. Remaining: ${remainingCredit}`,
              );
            }

            details.push({
              studentCreditId: studentCredit.id,
              studentNumber,
              creditAmount,
              receiptCreditsCreated,
            });

            if (receiptCreditsCreated > 0) {
              fixed++;
            }
          } catch (error) {
            this.logger.error(
              `Error repairing unrecorded credit ${issue.studentCreditId}`,
              { error, studentCreditId: issue.studentCreditId },
            );
            errors++;
          }
        }

        this.logger.log(
          `Unrecorded credits repair completed: Fixed ${fixed}, Errors ${errors} (dryRun: ${dryRun})`,
        );

        return { fixed, errors, details };
      },
    );
  }

  async repairAllData(dryRun: boolean = true): Promise<{
    audit: {
      invoicesWithBalanceIssues: Array<{
        invoiceId: number;
        invoiceNumber: string;
        studentNumber: string;
        expectedBalance: number;
        actualBalance: number;
        difference: number;
      }>;
      invoicesWithMissingCreditAllocations: Array<{
        invoiceId: number;
        invoiceNumber: string;
        studentNumber: string;
        amountPaidOnInvoice: number;
        totalReceiptAllocations: number;
        missingCreditAmount: number;
      }>;
      invoicesWithDeletedBalanceBfwd: Array<{
        invoiceId: number;
        invoiceNumber: string;
        studentNumber: string;
        balanceId: number | null;
        totalBill: number;
        calculatedTotalBill: number;
        possibleBalanceBfwdAmount: number;
        note: string;
      }>;
      voidedReceiptsWithIncompleteReversals: Array<{
        receiptId: number;
        receiptNumber: string;
        studentNumber: string;
        amountPaid: number;
        totalAllocations: number;
        shouldHaveReversed: number;
      }>;
      receiptsWithUnallocatedAmounts: Array<{
        receiptId: number;
        receiptNumber: string;
        studentNumber: string;
        amountPaid: number;
        totalAllocations: number;
        unallocatedAmount: number;
      }>;
      unrecordedCredits: Array<{
        studentCreditId: number;
        studentNumber: string;
        creditAmount: number;
        receiptCreditsCount: number;
        note: string;
      }>;
      anomalyAllocations: Array<{
        allocationId: number;
        allocationType: 'receipt' | 'credit';
        receiptId?: number;
        receiptNumber?: string;
        invoiceId: number;
        invoiceNumber: string;
        studentNumber: string;
        amountApplied: number;
        issue: string;
        note: string;
      }>;
      summary: {
        totalInvoices: number;
        invoicesWithIssues: number;
        totalReceipts: number;
        voidedReceiptsWithIssues: number;
        invoicesWithDeletedBalanceBfwd: number;
        receiptsWithUnallocatedAmounts: number;
        unrecordedCredits: number;
        anomalyAllocations: number;
      };
    };
    balanceRepairs: {
      fixed: number;
      errors: number;
      details: Array<{
        invoiceId: number;
        invoiceNumber: string;
        oldBalance: number;
        newBalance: number;
      }>;
    };
    voidedReceiptRepairs: {
      fixed: number;
      errors: number;
      details: Array<{
        receiptId: number;
        receiptNumber: string;
        invoicesUpdated: number;
      }>;
    };
    missingCreditAllocationRepairs: {
      fixed: number;
      errors: number;
      details: Array<{
        invoiceId: number;
        invoiceNumber: string;
        studentNumber: string;
        missingCreditAmount: number;
        creditAllocationsCreated: number;
      }>;
    };
    unallocatedReceiptAmountsRepairs: {
      fixed: number;
      errors: number;
      details: Array<{
        receiptId: number;
        receiptNumber: string;
        studentNumber: string;
        unallocatedAmount: number;
        allocationsCreated: number;
        invoicesUpdated: number;
      }>;
    };
    unrecordedCreditsRepairs: {
      fixed: number;
      errors: number;
      details: Array<{
        studentCreditId: number;
        studentNumber: string;
        creditAmount: number;
        receiptCreditsCreated: number;
      }>;
    };
    timestamp: Date;
  }> {
    this.logger.log(
      `Starting comprehensive data repair (dryRun: ${dryRun})...`,
    );

    const audit = await this.auditDataIntegrity();
    const balanceRepairs = await this.repairInvoiceBalances(dryRun);
    const voidedReceiptRepairs = await this.repairVoidedReceipts(dryRun);
    const missingCreditAllocationRepairs = await this.repairMissingCreditAllocations(dryRun);
    const unallocatedReceiptAmountsRepairs = await this.repairUnallocatedReceiptAmounts(dryRun);
    const unrecordedCreditsRepairs = await this.repairUnrecordedCredits(dryRun);

    const result = {
      audit,
      balanceRepairs,
      voidedReceiptRepairs,
      missingCreditAllocationRepairs,
      unallocatedReceiptAmountsRepairs,
      unrecordedCreditsRepairs,
      timestamp: new Date(),
    };

    this.logger.log(
      `Comprehensive data repair completed (dryRun: ${dryRun})`,
      {
        balanceRepairsFixed: balanceRepairs.fixed,
        voidedReceiptRepairsFixed: voidedReceiptRepairs.fixed,
        missingCreditAllocationRepairsFixed: missingCreditAllocationRepairs.fixed,
        unallocatedReceiptAmountsRepairsFixed: unallocatedReceiptAmountsRepairs.fixed,
        unrecordedCreditsRepairsFixed: unrecordedCreditsRepairs.fixed,
      },
    );

    return result;
  }

  /**
   * Comprehensive student-by-student data repair
   * Replays all transactions chronologically for a single student
   * @param studentNumber - The student number to repair
   * @param dryRun - If true, only reports what would be fixed without making changes
   * @returns Report of repairs made for this student
   */
  async repairStudentData(
    studentNumber: string,
    dryRun: boolean = true,
  ): Promise<{
    studentNumber: string;
    success: boolean;
    invoicesProcessed: number;
    receiptsProcessed: number;
    allocationsCreated: number;
    creditAllocationsCreated: number;
    creditsCreated: number;
    creditsUpdated: number;
    errors: string[];
    details: {
      invoiceUpdates: Array<{
        invoiceId: number;
        invoiceNumber: string;
        oldBalance: number;
        newBalance: number;
        oldAmountPaid: number;
        newAmountPaid: number;
        oldStatus: InvoiceStatus;
        newStatus: InvoiceStatus;
      }>;
      receiptAllocations: Array<{
        receiptId: number;
        receiptNumber: string;
        invoiceId: number;
        invoiceNumber: string;
        amountApplied: number;
      }>;
      creditAllocations: Array<{
        invoiceId: number;
        invoiceNumber: string;
        amountApplied: number;
      }>;
      creditsCreated: Array<{
        creditId: number;
        amount: number;
        source: string;
      }>;
    };
  }> {
    this.logger.log(
      `Starting student-by-student repair for ${studentNumber} (dryRun: ${dryRun})...`,
    );

    const errors: string[] = [];
    const details = {
      invoiceUpdates: [] as Array<{
        invoiceId: number;
        invoiceNumber: string;
        oldBalance: number;
        newBalance: number;
        oldAmountPaid: number;
        newAmountPaid: number;
        oldStatus: InvoiceStatus;
        newStatus: InvoiceStatus;
      }>,
      receiptAllocations: [] as Array<{
        receiptId: number;
        receiptNumber: string;
        invoiceId: number;
        invoiceNumber: string;
        amountApplied: number;
      }>,
      creditAllocations: [] as Array<{
        invoiceId: number;
        invoiceNumber: string;
        amountApplied: number;
      }>,
      creditsCreated: [] as Array<{
        creditId: number;
        amount: number;
        source: string;
      }>,
    };

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        try {
          // 1. Load all invoices for this student (sorted by invoiceDate)
          const allInvoices = await transactionalEntityManager.find(
            InvoiceEntity,
            {
              where: {
                student: { studentNumber },
                isVoided: false, // Exclude voided invoices
              },
              relations: [
                'student',
                'enrol',
                'balanceBfwd',
                'bills',
                'bills.fees',
                'exemption',
                'allocations',
                'creditAllocations',
              ],
              order: {
                invoiceDate: 'ASC',
              },
            },
          );

          // 2. Load all receipts for this student (sorted by paymentDate)
          const allReceipts = await transactionalEntityManager.find(
            ReceiptEntity,
            {
              where: {
                student: { studentNumber },
                isVoided: false, // Exclude voided receipts
              },
              relations: [
                'allocations',
                'allocations.invoice',
                'receiptCredits',
                'receiptCredits.studentCredit',
              ],
              order: {
                paymentDate: 'ASC',
              },
            },
          );

          if (allInvoices.length === 0 && allReceipts.length === 0) {
            this.logger.warn(
              `No invoices or receipts found for student ${studentNumber}`,
            );
            return {
              studentNumber,
              success: true,
              invoicesProcessed: 0,
              receiptsProcessed: 0,
              allocationsCreated: 0,
              creditAllocationsCreated: 0,
              creditsCreated: 0,
              creditsUpdated: 0,
              errors: [`No invoices or receipts found for student ${studentNumber}`],
              details,
            };
          }

          // 3. Store old values for comparison
          const invoiceOldValues = new Map<
            number,
            {
              balance: number;
              amountPaid: number;
              status: InvoiceStatus;
            }
          >();
          for (const invoice of allInvoices) {
            invoiceOldValues.set(invoice.id, {
              balance: Number(invoice.balance),
              amountPaid: Number(invoice.amountPaidOnInvoice),
              status: invoice.status,
            });
          }

          // 4. Reset invoice balances
          for (const invoice of allInvoices) {
            invoice.balance = Number(invoice.totalBill);
            invoice.amountPaidOnInvoice = 0;
            invoice.status = InvoiceStatus.Pending;
            if (invoice.balance <= 0) {
              invoice.status = InvoiceStatus.Paid;
            } else if (new Date() > invoice.invoiceDueDate) {
              invoice.status = InvoiceStatus.Overdue;
            }
          }

          // 5. Delete existing allocations (if not dry run)
          if (!dryRun) {
            // Delete receipt allocations - query directly to ensure we get all allocations
            const receiptIds = allReceipts.map((r) => r.id);
            if (receiptIds.length > 0) {
              const existingReceiptAllocations =
                await transactionalEntityManager.find(
                  ReceiptInvoiceAllocationEntity,
                  {
                    where: {
                      receipt: { id: In(receiptIds) },
                    },
                  },
                );
              if (existingReceiptAllocations.length > 0) {
                await transactionalEntityManager.remove(
                  existingReceiptAllocations,
                );
              }
            }

            // Delete credit allocations - query directly to ensure we get all allocations
            const invoiceIds = allInvoices.map((inv) => inv.id);
            if (invoiceIds.length > 0) {
              const existingCreditAllocations =
                await transactionalEntityManager.find(
                  CreditInvoiceAllocationEntity,
                  {
                    where: {
                      invoice: { id: In(invoiceIds) },
                    },
                  },
                );
              if (existingCreditAllocations.length > 0) {
                await transactionalEntityManager.remove(
                  existingCreditAllocations,
                );
              }
            }

            // Delete receipt credits - query directly
            if (receiptIds.length > 0) {
              const existingReceiptCredits =
                await transactionalEntityManager.find(ReceiptCreditEntity, {
                  where: {
                    receipt: { id: In(receiptIds) },
                  },
                });
              if (existingReceiptCredits.length > 0) {
                await transactionalEntityManager.remove(existingReceiptCredits);
              }
            }

            // Delete or reset student credit
            const existingCredit = await transactionalEntityManager.findOne(
              StudentCreditEntity,
              {
                where: { studentNumber },
              },
            );
            if (existingCredit) {
              existingCredit.amount = 0;
              existingCredit.lastCreditSource =
                'Reset for student-by-student repair';
              await transactionalEntityManager.save(existingCredit);
            }
          }

          // 6. Track student credit balance (simulated during dry run)
          let studentCreditBalance = 0;
          let studentCreditEntity: StudentCreditEntity | null = null;

          if (!dryRun) {
            studentCreditEntity = await transactionalEntityManager.findOne(
              StudentCreditEntity,
              {
                where: { studentNumber },
              },
            );
            if (studentCreditEntity) {
              studentCreditBalance = Number(studentCreditEntity.amount);
            }
          }

          // 7. Process receipts chronologically
          let allocationsCreated = 0;
          let creditsCreated = 0;
          let creditsUpdated = 0;

          for (const receipt of allReceipts) {
            let remainingAmount = Number(receipt.amountPaid);

            // Continue allocating until remaining amount is exhausted or no more open invoices
            while (remainingAmount > 0.01) {
              // Get open invoices (not fully paid, sorted by due date)
              // Recalculate each iteration to account for updated balances
              const openInvoices = allInvoices
                .filter(
                  (inv) =>
                    Number(inv.balance) > 0.01 &&
                    !inv.isVoided &&
                    new Date(receipt.paymentDate) >= new Date(inv.invoiceDate), // Receipt must be after invoice
                )
                .sort((a, b) => {
                  // Sort by due date (FIFO)
                  return (
                    new Date(a.invoiceDueDate).getTime() -
                    new Date(b.invoiceDueDate).getTime()
                  );
                });

              // If no open invoices, break and create credit
              if (openInvoices.length === 0) {
                break;
              }

              // Apply receipt to invoices (FIFO by due date)
              let allocatedThisIteration = false;
              for (const invoice of openInvoices) {
                if (remainingAmount <= 0.01) {
                  break;
                }

                const invoiceBalance = Number(invoice.balance);
                if (invoiceBalance <= 0.01) {
                  continue;
                }

                const amountToAllocate = Math.min(remainingAmount, invoiceBalance);

                if (!dryRun) {
                  // Create allocation
                  const allocation = transactionalEntityManager.create(
                    ReceiptInvoiceAllocationEntity,
                    {
                      receipt: receipt,
                      invoice: invoice,
                      amountApplied: amountToAllocate,
                      allocationDate: receipt.paymentDate || new Date(),
                    },
                  );
                  await transactionalEntityManager.save(allocation);

                  // Update invoice
                  invoice.amountPaidOnInvoice =
                    Number(invoice.amountPaidOnInvoice) + amountToAllocate;
                  invoice.balance = Number(invoice.balance) - amountToAllocate;
                  invoice.status = this.getInvoiceStatus(invoice);
                  await transactionalEntityManager.save(invoice);

                  details.receiptAllocations.push({
                    receiptId: receipt.id,
                    receiptNumber: receipt.receiptNumber,
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    amountApplied: amountToAllocate,
                  });
                } else {
                  // Dry run: just track
                  details.receiptAllocations.push({
                    receiptId: receipt.id,
                    receiptNumber: receipt.receiptNumber,
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    amountApplied: amountToAllocate,
                  });
                }

                allocationsCreated++;
                remainingAmount -= amountToAllocate;
                allocatedThisIteration = true;
              }

              // If we couldn't allocate anything this iteration, break to avoid infinite loop
              if (!allocatedThisIteration) {
                break;
              }
            }

            // Handle overpayment (create credit) - only if there's remaining amount AND no open invoices
            if (remainingAmount > 0.01) {
              if (!dryRun) {
                // Create or update student credit
                const credit = await this.createOrUpdateStudentCredit(
                  studentNumber,
                  remainingAmount,
                  transactionalEntityManager,
                  `Overpayment from Receipt ${receipt.receiptNumber} (system-repair)`,
                );

                // Create ReceiptCreditEntity link
                const receiptCredit = transactionalEntityManager.create(
                  ReceiptCreditEntity,
                  {
                    receipt: receipt,
                    studentCredit: credit,
                    creditAmount: remainingAmount,
                    createdAt: receipt.paymentDate || new Date(),
                  },
                );
                await transactionalEntityManager.save(receiptCredit);

                if (studentCreditEntity && studentCreditEntity.id === credit.id) {
                  creditsUpdated++;
                } else {
                  creditsCreated++;
                }

                studentCreditEntity = credit;
                studentCreditBalance = Number(credit.amount);

                details.creditsCreated.push({
                  creditId: credit.id,
                  amount: remainingAmount,
                  source: `Overpayment from Receipt ${receipt.receiptNumber}`,
                });
              } else {
                // Dry run: just track
                studentCreditBalance += remainingAmount;
                details.creditsCreated.push({
                  creditId: 0,
                  amount: remainingAmount,
                  source: `Overpayment from Receipt ${receipt.receiptNumber}`,
                });
                creditsCreated++;
              }
            }
          }

          // 8. Apply student credit to remaining open invoices
          let creditAllocationsCreated = 0;
          if (studentCreditBalance > 0.01) {
            let remainingCredit = studentCreditBalance;

            // Continue allocating credit until exhausted or no more open invoices
            while (remainingCredit > 0.01) {
              // Recalculate open invoices each iteration to account for updated balances
              const openInvoicesForCredit = allInvoices
                .filter((inv) => Number(inv.balance) > 0.01 && !inv.isVoided)
                .sort((a, b) => {
                  // Sort by due date (FIFO)
                  return (
                    new Date(a.invoiceDueDate).getTime() -
                    new Date(b.invoiceDueDate).getTime()
                  );
                });

              // If no open invoices, break (credit remains as student credit)
              if (openInvoicesForCredit.length === 0) {
                break;
              }

              // Apply credit to invoices (FIFO by due date)
              let allocatedThisIteration = false;
              for (const invoice of openInvoicesForCredit) {
                if (remainingCredit <= 0.01) {
                  break;
                }

                const invoiceBalance = Number(invoice.balance);
                if (invoiceBalance <= 0.01) {
                  continue;
                }

                const amountToApply = Math.min(remainingCredit, invoiceBalance);

                if (!dryRun && studentCreditEntity) {
                  // Create credit allocation
                  const creditAllocation = transactionalEntityManager.create(
                    CreditInvoiceAllocationEntity,
                    {
                      studentCredit: studentCreditEntity,
                      invoice: invoice,
                      amountApplied: amountToApply,
                      allocationDate: invoice.invoiceDate || new Date(),
                    },
                  );
                  await transactionalEntityManager.save(creditAllocation);

                  // Update invoice
                  invoice.amountPaidOnInvoice =
                    Number(invoice.amountPaidOnInvoice) + amountToApply;
                  invoice.balance = Number(invoice.balance) - amountToApply;
                  invoice.status = this.getInvoiceStatus(invoice);
                  await transactionalEntityManager.save(invoice);

                  // Deduct from credit
                  await this.deductStudentCredit(
                    studentNumber,
                    amountToApply,
                    transactionalEntityManager,
                    `Applied to Invoice ${invoice.invoiceNumber} (system-repair)`,
                  );

                  // Update tracked balance
                  studentCreditBalance -= amountToApply;

                  details.creditAllocations.push({
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    amountApplied: amountToApply,
                  });
                } else {
                  // Dry run: just track
                  details.creditAllocations.push({
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    amountApplied: amountToApply,
                  });
                }

                creditAllocationsCreated++;
                remainingCredit -= amountToApply;
                allocatedThisIteration = true;
              }

              // If we couldn't allocate anything this iteration, break to avoid infinite loop
              if (!allocatedThisIteration) {
                break;
              }
            }
          }

          // 9. Update invoice details for comparison
          for (const invoice of allInvoices) {
            const oldValues = invoiceOldValues.get(invoice.id);
            if (oldValues) {
              const newBalance = Number(invoice.balance);
              const newAmountPaid = Number(invoice.amountPaidOnInvoice);
              const newStatus = invoice.status;

              // Only add to details if something changed
              if (
                Math.abs(oldValues.balance - newBalance) > 0.01 ||
                Math.abs(oldValues.amountPaid - newAmountPaid) > 0.01 ||
                oldValues.status !== newStatus
              ) {
                details.invoiceUpdates.push({
                  invoiceId: invoice.id,
                  invoiceNumber: invoice.invoiceNumber,
                  oldBalance: oldValues.balance,
                  newBalance: newBalance,
                  oldAmountPaid: oldValues.amountPaid,
                  newAmountPaid: newAmountPaid,
                  oldStatus: oldValues.status,
                  newStatus: newStatus,
                });
              }
            }

            // Verify balance
            if (!dryRun) {
              this.verifyInvoiceBalance(invoice);
            }
          }

          // 10. Save all updated invoices (if not dry run)
          if (!dryRun) {
            await transactionalEntityManager.save(allInvoices);
          }

          this.logger.log(
            `Student repair completed for ${studentNumber}: ${allInvoices.length} invoices, ${allReceipts.length} receipts, ${allocationsCreated} allocations, ${creditAllocationsCreated} credit allocations (dryRun: ${dryRun})`,
          );

          return {
            studentNumber,
            success: true,
            invoicesProcessed: allInvoices.length,
            receiptsProcessed: allReceipts.length,
            allocationsCreated,
            creditAllocationsCreated,
            creditsCreated,
            creditsUpdated,
            errors,
            details,
          };
        } catch (error) {
          const errorMessage = `Error repairing student ${studentNumber}: ${error.message}`;
          this.logger.error(errorMessage, { error, studentNumber });
          errors.push(errorMessage);
          throw error; // Re-throw to trigger transaction rollback
        }
      },
    );
  }

  /**
   * Repairs data for multiple selected students
   * @param studentNumbers - Array of student numbers to repair
   * @param dryRun - If true, only reports what would be fixed without making changes
   * @returns Report of repairs made for all students
   */
  async repairSelectedStudentsData(
    studentNumbers: string[],
    dryRun: boolean = true,
  ): Promise<{
    studentsProcessed: number;
    studentsFixed: number;
    studentsWithErrors: number;
    totalInvoicesProcessed: number;
    totalReceiptsProcessed: number;
    totalAllocationsCreated: number;
    totalCreditAllocationsCreated: number;
    totalCreditsCreated: number;
    totalCreditsUpdated: number;
    studentResults: Array<{
      studentNumber: string;
      success: boolean;
      invoicesProcessed: number;
      receiptsProcessed: number;
      allocationsCreated: number;
      creditAllocationsCreated: number;
      creditsCreated: number;
      creditsUpdated: number;
      errors: string[];
    }>;
  }> {
    this.logger.log(
      `Starting repair for ${studentNumbers.length} selected students (dryRun: ${dryRun})...`,
    );

    const studentResults: Array<{
      studentNumber: string;
      success: boolean;
      invoicesProcessed: number;
      receiptsProcessed: number;
      allocationsCreated: number;
      creditAllocationsCreated: number;
      creditsCreated: number;
      creditsUpdated: number;
      errors: string[];
    }> = [];

    let studentsFixed = 0;
    let studentsWithErrors = 0;
    let totalInvoicesProcessed = 0;
    let totalReceiptsProcessed = 0;
    let totalAllocationsCreated = 0;
    let totalCreditAllocationsCreated = 0;
    let totalCreditsCreated = 0;
    let totalCreditsUpdated = 0;

    // Process each student individually (each in its own transaction)
    for (const studentNumber of studentNumbers) {
      try {
        const result = await this.repairStudentData(studentNumber, dryRun);

        studentResults.push({
          studentNumber: result.studentNumber,
          success: result.success,
          invoicesProcessed: result.invoicesProcessed,
          receiptsProcessed: result.receiptsProcessed,
          allocationsCreated: result.allocationsCreated,
          creditAllocationsCreated: result.creditAllocationsCreated,
          creditsCreated: result.creditsCreated,
          creditsUpdated: result.creditsUpdated,
          errors: result.errors,
        });

        if (result.success && result.errors.length === 0) {
          studentsFixed++;
        } else {
          studentsWithErrors++;
        }

        totalInvoicesProcessed += result.invoicesProcessed;
        totalReceiptsProcessed += result.receiptsProcessed;
        totalAllocationsCreated += result.allocationsCreated;
        totalCreditAllocationsCreated += result.creditAllocationsCreated;
        totalCreditsCreated += result.creditsCreated;
        totalCreditsUpdated += result.creditsUpdated;
      } catch (error) {
        this.logger.error(
          `Error repairing student ${studentNumber}`,
          { error, studentNumber },
        );
        studentResults.push({
          studentNumber,
          success: false,
          invoicesProcessed: 0,
          receiptsProcessed: 0,
          allocationsCreated: 0,
          creditAllocationsCreated: 0,
          creditsCreated: 0,
          creditsUpdated: 0,
          errors: [error.message || 'Unknown error'],
        });
        studentsWithErrors++;
      }
    }

    this.logger.log(
      `Repair completed for ${studentNumbers.length} students: ${studentsFixed} fixed, ${studentsWithErrors} with errors (dryRun: ${dryRun})`,
    );

    return {
      studentsProcessed: studentNumbers.length,
      studentsFixed,
      studentsWithErrors,
      totalInvoicesProcessed,
      totalReceiptsProcessed,
      totalAllocationsCreated,
      totalCreditAllocationsCreated,
      totalCreditsCreated,
      totalCreditsUpdated,
      studentResults,
    };
  }
}

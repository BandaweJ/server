/* eslint-disable prettier/prettier */
import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  And,
  Between,
  DataSource,
  EntityManager,
  LessThanOrEqual,
  Like,
  MoreThan,
  MoreThanOrEqual,
  Repository,
  In,
} from 'typeorm';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';

import { ReceiptEntity } from '../entities/payment.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { ReceiptInvoiceAllocationEntity } from '../entities/receipt-invoice-allocation.entity';
import { ReceiptCreditEntity } from '../entities/receipt-credit.entity';
import { CreditInvoiceAllocationEntity } from '../entities/credit-invoice-allocation.entity';
import {
  CreditTransactionEntity,
  CreditTransactionType,
} from '../entities/credit-transaction.entity';
import { ResourceByIdService } from 'src/resource-by-id/resource-by-id.service';
import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { FinancialValidationService } from './financial-validation.service';
import { CreditService } from './credit.service';
import { InvoiceService } from './invoice.service';
import { CreateReceiptDto } from '../dtos/createPayment.dto';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { PaymentMethods } from 'src/finance/models/payment-methods.model';
import { ROLES } from 'src/auth/models/roles.enum';
import {
  DuplicateReceiptException,
  StudentNotFoundException,
  StudentNotEnrolledException,
  ReceiptNotFoundException,
  ReceiptAlreadyVoidedException,
  InvalidAmountException,
} from '../exceptions/payment.exceptions';
import { InvoiceStatus } from 'src/finance/models/invoice-status.enum';
import { logStructured } from '../utils/logger.util';
import { AuditService } from './audit.service';
import { sanitizeAmount } from '../utils/sanitization.util';
import { NotificationService } from '../../notifications/services/notification.service';

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(
    @InjectRepository(ReceiptEntity)
    private readonly receiptRepository: Repository<ReceiptEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepository: Repository<InvoiceEntity>,
    private readonly resourceById: ResourceByIdService,
    private readonly enrolmentService: EnrolmentService,
    private readonly financialValidationService: FinancialValidationService,
    private readonly notificationService: NotificationService,
    private readonly creditService: CreditService,
    private readonly invoiceService: InvoiceService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Validates that an amount is positive and greater than zero
   * @param amount - The amount to validate
   * @param fieldName - The name of the field for error messages
   * @throws InvalidAmountException if amount is invalid
   */
  private validateAmount(amount: number, fieldName: string = 'Amount'): void {
    if (amount === null || amount === undefined || isNaN(amount)) {
      throw new InvalidAmountException(fieldName, amount, 'Must be a valid number');
    }
    if (amount <= 0) {
      throw new InvalidAmountException(
        fieldName,
        amount,
        'Must be greater than zero',
      );
    }
    if (amount > 999999999.99) {
      throw new InvalidAmountException(
        fieldName,
        amount,
        'Exceeds maximum allowed value (999,999,999.99)',
      );
    }
  }

  async voidReceipt(
    receiptId: number,
    voidedByEmail: string,
    ipAddress?: string,
  ): Promise<ReceiptEntity> {
    logStructured(
      this.logger,
      'log',
      'receipt.void.start',
      'Voiding receipt',
      { receiptId, voidedByEmail },
    );

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        const receiptToVoid = await transactionalEntityManager.findOne(
          ReceiptEntity,
          {
            where: { id: receiptId },
            relations: ['allocations', 'allocations.invoice', 'student'],
          },
        );

        if (!receiptToVoid) {
          logStructured(
            this.logger,
            'error',
            'receipt.void.notFound',
            'Receipt not found for voiding',
            {
              receiptId,
              voidedByEmail,
            },
          );
          throw new ReceiptNotFoundException(receiptId);
        }
        if (receiptToVoid.isVoided) {
          logStructured(
            this.logger,
            'warn',
            'receipt.void.alreadyVoided',
            'Attempt to void already voided receipt',
            { receiptId, voidedByEmail },
          );
          throw new ReceiptAlreadyVoidedException(
            receiptId,
            receiptToVoid.receiptNumber,
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
            invoice.amountPaidOnInvoice = Math.max(
              0,
              Number(invoice.amountPaidOnInvoice) - amountApplied,
            );
            invoice.balance = Number(invoice.balance) + amountApplied;
            invoice.status = this.getInvoiceStatus(invoice);

            updatedInvoices.push(invoice);
          }
        }

        await transactionalEntityManager.save(updatedInvoices);

        // 3. Reverse any credit that was created from this receipt's overpayment
        const receiptCredit = await transactionalEntityManager.findOne(
          ReceiptCreditEntity,
          {
            where: { receipt: { id: receiptId } },
            relations: ['studentCredit', 'receipt'],
          },
        );

        if (receiptCredit) {
          const creditAmount = Number(receiptCredit.creditAmount);
          const studentCredit = receiptCredit.studentCredit;
          const currentCreditAmount = Number(studentCredit.amount);
          const creditAlreadyApplied = creditAmount - currentCreditAmount;

          if (creditAlreadyApplied > 0) {
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

            for (const creditAllocation of creditAllocations) {
              if (remainingToReverse <= 0) {
                break;
              }

              const allocationAmount = Number(creditAllocation.amountApplied);
              const amountToReverse = Math.min(remainingToReverse, allocationAmount);

              if (amountToReverse > 0 && creditAllocation.invoice) {
                const invoice = creditAllocation.invoice;

                invoice.amountPaidOnInvoice = Math.max(
                  0,
                  Number(invoice.amountPaidOnInvoice) - amountToReverse,
                );
                invoice.balance = Number(invoice.balance) + amountToReverse;
                invoice.status = this.getInvoiceStatus(invoice);

                invoicesToUpdate.push(invoice);

                if (amountToReverse >= allocationAmount) {
                  await transactionalEntityManager.remove(creditAllocation);
                } else {
                  creditAllocation.amountApplied = allocationAmount - amountToReverse;
                  await transactionalEntityManager.save(creditAllocation);
                }

                remainingToReverse -= amountToReverse;
              }
            }

            if (invoicesToUpdate.length > 0) {
              await transactionalEntityManager.save(invoicesToUpdate);
            }

            studentCredit.amount =
              currentCreditAmount + (creditAlreadyApplied - remainingToReverse);
          }

          const creditToReverse = Math.min(creditAmount, Number(studentCredit.amount));

          if (creditToReverse > 0) {
            studentCredit.amount = Number(studentCredit.amount) - creditToReverse;
            studentCredit.lastCreditSource = `Reversed: Overpayment from Receipt ${receiptToVoid.receiptNumber} (voided)`;

            if (studentCredit.amount <= 0) {
              studentCredit.amount = 0;
            }

            await transactionalEntityManager.save(studentCredit);

            const reversalTransaction = transactionalEntityManager.create(
              CreditTransactionEntity,
              {
                studentCredit: studentCredit,
                amount: creditToReverse,
                transactionType: CreditTransactionType.REVERSAL,
                source: `Reversed: Overpayment from Receipt ${receiptToVoid.receiptNumber} (voided)`,
                relatedReceiptId: receiptToVoid.id,
                performedBy: voidedByEmail,
                transactionDate: new Date(),
              },
            );
            await transactionalEntityManager.save(reversalTransaction);
          }

          await transactionalEntityManager.remove(receiptCredit);

          logStructured(
            this.logger,
            'log',
            'receipt.void.creditReversal',
            'Voided receipt credit reversal summary',
            {
              receiptId,
              receiptNumber: receiptToVoid.receiptNumber,
              creditAmount,
              creditAlreadyApplied,
            },
          );
        } else {
          const totalAllocatedAmount = receiptToVoid.allocations.reduce(
            (sum, allocation) => sum + Number(allocation.amountApplied),
            0,
          );
          const overpaymentAmount =
            Number(receiptToVoid.amountPaid) - totalAllocatedAmount;

          if (overpaymentAmount > 0) {
            const studentNumber = receiptToVoid.student?.studentNumber;
            if (studentNumber) {
              const studentCredit = await this.creditService.getStudentCredit(
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

        logStructured(
          this.logger,
          'log',
          'receipt.void.success',
          'Receipt voided successfully',
          {
            receiptId,
            receiptNumber: receiptToVoid.receiptNumber,
            invoicesUpdated: updatedInvoices.length,
            voidedBy: voidedByEmail,
          },
        );

        // Audit logging
        try {
          await this.auditService.logReceiptVoided(
            receiptToVoid.id,
            voidedByEmail,
            {
              receiptNumber: receiptToVoid.receiptNumber,
              invoicesUpdated: updatedInvoices.length,
            },
            ipAddress,
            transactionalEntityManager,
          );
        } catch (auditError) {
          // Don't fail the main operation if audit logging fails
          logStructured(
            this.logger,
            'warn',
            'receipt.void.auditFailed',
            'Failed to log audit entry for receipt void',
            {
              receiptId: receiptToVoid.id,
              error:
                auditError instanceof Error
                  ? auditError.message
                  : String(auditError),
            },
          );
        }

        return receiptToVoid;
      },
    );
  }

  async createReceipt(
    createReceiptDto: CreateReceiptDto,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
    ipAddress?: string,
  ): Promise<ReceiptEntity> {
    // Sanitize amount to prevent precision issues
    const sanitizedAmount = sanitizeAmount(createReceiptDto.amountPaid);
    createReceiptDto.amountPaid = sanitizedAmount;

    this.validateAmount(
      createReceiptDto.amountPaid,
      'Receipt amount paid',
    );

    const allowedRoles = [ROLES.reception, ROLES.auditor];
    if (!allowedRoles.includes(profile.role as ROLES)) {
      throw new UnauthorizedException('You are not allowed to generate receipts');
    }

    const studentNumber = createReceiptDto.studentNumber;
    const student = await this.resourceById.getStudentByStudentNumber(studentNumber);
    if (!student) {
      throw new StudentNotFoundException(
        studentNumber,
        'Cannot create receipt for a non-existent student.',
      );
    }

    const enrol = await this.enrolmentService.getCurrentEnrollment(studentNumber);
    if (!enrol) {
      throw new StudentNotEnrolledException(studentNumber);
    }

    if (createReceiptDto.paymentMethod === PaymentMethods.cash) {
      const largeCashThreshold = 10000;
      if (createReceiptDto.amountPaid > largeCashThreshold) {
        logStructured(
          this.logger,
          'warn',
          'receipt.create.largeCash',
          'Large cash payment detected',
          {
            studentNumber,
            amountPaid: createReceiptDto.amountPaid,
            paymentMethod: createReceiptDto.paymentMethod,
            servedBy: profile.email,
            threshold: largeCashThreshold,
          },
        );
      }
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentReceipt = await this.receiptRepository.findOne({
      where: {
        student: { studentNumber },
        amountPaid: createReceiptDto.amountPaid,
        paymentDate: MoreThan(fiveMinutesAgo),
        isVoided: false,
      },
    });

    if (recentReceipt) {
      throw new DuplicateReceiptException(
        recentReceipt.receiptNumber,
        Number(createReceiptDto.amountPaid),
        '5 minutes',
      );
    }

    logStructured(
      this.logger,
      'log',
      'receipt.create.start',
      'Creating receipt',
      {
        studentNumber,
        amountPaid: createReceiptDto.amountPaid,
        paymentMethod: createReceiptDto.paymentMethod,
        servedBy: profile.email,
      },
    );

    const newReceipt = this.receiptRepository.create({
      amountPaid: createReceiptDto.amountPaid,
      description: createReceiptDto.description || `Payment of ${createReceiptDto.amountPaid} via ${createReceiptDto.paymentMethod}`,
      paymentMethod: createReceiptDto.paymentMethod,
      paymentDate: new Date(), // Set payment date explicitly for validation
      student: student,
      receiptNumber: await this.generateReceiptNumber(),
      servedBy: profile.email,
      enrol: enrol,
      isVoided: false,
      voidedAt: null,
      voidedBy: null,
    });

    const finalReceipt = await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        this.financialValidationService.validateReceiptBeforeSave(newReceipt);

        // Reconcile finances BEFORE saving receipt (apply credit to invoices if needed)
        // Skip full reallocation (expensive) - only needed for manual reconciliation
        try {
          await this.invoiceService.reconcileStudentFinances(
            studentNumber,
            transactionalEntityManager,
            undefined,
            { skipFullReallocation: true }, // Skip expensive reallocation during receipt saves
          );
        } catch (reconciliationError) {
          logStructured(
            this.logger,
            'warn',
            'receipt.create.preReconciliationFailed',
            'Pre-save reconciliation failed',
            {
              studentNumber,
              error: (reconciliationError as Error).message,
            },
          );
          // Continue anyway - reconciliation errors shouldn't block receipt creation
        }

        const savedReceipt = await transactionalEntityManager.save(newReceipt);

        const allocationResult = await this.allocateReceiptToInvoices(
          savedReceipt,
          studentNumber,
          transactionalEntityManager,
        );

        logStructured(
          this.logger,
          'log',
          'receipt.create.success',
          'Receipt created successfully',
          {
            receiptId: savedReceipt.id,
            receiptNumber: savedReceipt.receiptNumber,
            studentNumber,
            amountPaid: savedReceipt.amountPaid,
            allocationsCount: allocationResult.allocations.length,
            creditCreated:
              allocationResult.creditCreated > 0
                ? allocationResult.creditCreated
                : 0,
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
          logStructured(
            this.logger,
            'error',
            'receipt.create.lookupFailure',
            error,
            { receiptId: savedReceipt.id },
          );
          throw new Error(error);
        }

        // Reconcile finances AFTER saving receipt and allocations
        // This ensures all balances are correct and any new credit is applied
        // Skip full reallocation (expensive) - only needed for manual reconciliation
        try {
          await this.invoiceService.reconcileStudentFinances(
            studentNumber,
            transactionalEntityManager,
            undefined,
            { skipFullReallocation: true }, // Skip expensive reallocation during receipt saves
          );
        } catch (reconciliationError) {
          // Don't fail the main operation if reconciliation fails, but log it
          logStructured(
            this.logger,
            'warn',
            'receipt.create.postReconciliationFailed',
            'Post-save reconciliation failed',
            {
              studentNumber,
              error: (reconciliationError as Error).message,
            },
          );
        }

        // Audit logging
        try {
          await this.auditService.logReceiptCreated(
            finalReceipt.id,
            profile.email,
            {
              receiptNumber: finalReceipt.receiptNumber,
              amountPaid: finalReceipt.amountPaid,
              paymentMethod: finalReceipt.paymentMethod,
              allocationsCount: allocationResult.allocations.length,
              creditCreated: allocationResult.creditCreated,
            },
            ipAddress,
            transactionalEntityManager,
          );
        } catch (auditError) {
          // Don't fail the main operation if audit logging fails
          logStructured(
            this.logger,
            'warn',
            'receipt.create.auditFailed',
            'Failed to log audit entry for receipt creation',
            {
              receiptId: finalReceipt.id,
              error:
                auditError instanceof Error
                  ? auditError.message
                  : String(auditError),
            },
          );
        }

        return finalReceipt;
      },
    );

    // Send email notification after receipt is created (after transaction completes)
    this.sendPaymentNotification(finalReceipt).catch((error) => {
      this.logger.error('Failed to send payment notification:', error);
      // Don't throw - notifications are non-critical
    });

    return finalReceipt;
  }

  /**
   * Send email notification for payment receipt
   */
  private async sendPaymentNotification(
    receipt: ReceiptEntity,
  ): Promise<void> {
    try {
      const student = receipt.student;
      if (!student) return;

      // Get parent email - fetch student with parent relation if not loaded
      let parentEmail: string | undefined;
      if (student.parent && student.parent.email) {
        parentEmail = student.parent.email;
      } else {
        // Parent relation not loaded, fetch it
        try {
          const studentRepo = this.receiptRepository.manager.getRepository(StudentsEntity);
          const studentWithParent = await studentRepo.findOne({
            where: { studentNumber: student.studentNumber },
            relations: ['parent'],
          });
          if (studentWithParent?.parent?.email) {
            parentEmail = studentWithParent.parent.email;
          }
        } catch {
          // Could not fetch parent
        }
      }

      await this.notificationService.sendPaymentNotification({
        studentName: `${student.surname} ${student.name}`,
        studentNumber: student.studentNumber,
        receiptNumber: receipt.receiptNumber,
        paymentDate: receipt.paymentDate || new Date(),
        amount: Number(receipt.amountPaid || 0),
        paymentMethod: receipt.paymentMethod || 'Unknown',
        parentEmail,
        studentEmail: student.email,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send payment notification for ${receipt.receiptNumber}:`,
        error,
      );
    }
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

  private async allocateReceiptToInvoices(
    receipt: ReceiptEntity,
    studentNumber: string,
    transactionalEntityManager: EntityManager,
  ): Promise<{
    allocations: ReceiptInvoiceAllocationEntity[];
    updatedInvoices: InvoiceEntity[];
    creditCreated: number;
    receiptCredit: ReceiptCreditEntity | null;
  }> {
    let remainingPaymentAmount = Number(receipt.amountPaid);
    if (isNaN(remainingPaymentAmount) || remainingPaymentAmount < 0) {
      const errorMessage = `Invalid receipt amount: ${receipt.amountPaid} for receipt ${receipt.receiptNumber}`;
      logStructured(
        this.logger,
        'error',
        'receipt.allocate.invalidAmount',
        errorMessage,
        { receiptId: receipt.id, receiptNumber: receipt.receiptNumber },
      );
      throw new Error(errorMessage);
    }
    const allocationsToSave: ReceiptInvoiceAllocationEntity[] = [];
    const updatedInvoices: InvoiceEntity[] = [];

    const openInvoices = await transactionalEntityManager.find(
      InvoiceEntity,
      {
        where: {
          student: { studentNumber },
          isVoided: false,
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

    const invoicesWithBalance = openInvoices.filter(
      (inv) => Number(inv.balance) > 0.01,
    );

    for (const invoice of invoicesWithBalance) {
      if (remainingPaymentAmount <= 0.01) {
        break;
      }

      const invoiceCurrentBalance = Number(invoice.balance);
      if (invoiceCurrentBalance <= 0.01) {
        continue;
      }

      const amountToApplyToCurrentInvoice = Math.min(
        Number(remainingPaymentAmount),
        Number(invoiceCurrentBalance),
      );

      const amountAppliedNumber = Number(amountToApplyToCurrentInvoice);
      if (isNaN(amountAppliedNumber) || amountAppliedNumber <= 0) {
        logStructured(
          this.logger,
          'warn',
          'receipt.allocate.invalidAllocationAmount',
          'Invalid amount to apply, skipping allocation',
          {
            amountToApply: amountToApplyToCurrentInvoice,
            receiptId: receipt.id,
            invoiceId: invoice.id,
          },
        );
        continue;
      }

      if (amountAppliedNumber > 99999999.99) {
        logStructured(
          this.logger,
          'error',
          'receipt.allocate.amountTooLarge',
          'Allocation amount exceeds maximum allowed value',
          {
            amountAppliedNumber,
            receiptId: receipt.id,
            invoiceId: invoice.id,
          },
        );
        continue;
      }

      try {
        // Ensure both receipt and invoice have IDs before creating allocation
        if (!receipt.id) {
          throw new Error(`Receipt ${receipt.receiptNumber} has no ID`);
        }
        if (!invoice.id) {
          throw new Error(`Invoice ${invoice.invoiceNumber} has no ID`);
        }

        const allocation = transactionalEntityManager.create(
          ReceiptInvoiceAllocationEntity,
          {
            receipt: { id: receipt.id } as ReceiptEntity, // Use minimal receipt reference with ID
            invoice: { id: invoice.id } as InvoiceEntity, // Use minimal invoice reference with ID
            amountApplied: amountAppliedNumber,
            allocationDate: receipt.paymentDate || new Date(),
          },
        );
        allocationsToSave.push(allocation);
      } catch (error) {
        logStructured(
          this.logger,
          'error',
          'receipt.allocate.createAllocationFailure',
          'Error creating allocation',
          {
            receiptId: receipt.id,
            receiptNumber: receipt.receiptNumber,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: amountAppliedNumber,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        throw error;
      }

      invoice.amountPaidOnInvoice =
        Number(invoice.amountPaidOnInvoice) + Number(amountAppliedNumber);
      invoice.balance = invoiceCurrentBalance - Number(amountAppliedNumber);
      invoice.status = this.getInvoiceStatus(invoice);
      updatedInvoices.push(invoice);

      remainingPaymentAmount =
        Number(remainingPaymentAmount) - Number(amountAppliedNumber);
    }

    if (updatedInvoices.length > 0) {
      try {
        await transactionalEntityManager.save(updatedInvoices);
      } catch (error) {
        logStructured(
          this.logger,
          'error',
          'receipt.allocate.saveInvoicesFailure',
          'Error saving invoices during allocation',
          {
            invoiceIds: updatedInvoices.map((inv) => inv.id),
            error: error instanceof Error ? error.message : String(error),
          },
        );
        throw error;
      }
    }

    if (allocationsToSave.length > 0) {
      try {
        await transactionalEntityManager.save(allocationsToSave);
      } catch (error) {
        logStructured(
          this.logger,
          'error',
          'receipt.allocate.saveAllocationsFailure',
          'Error saving receipt allocations',
          {
            allocations: allocationsToSave.map((a) => ({
              receiptId: a.receipt?.id,
              invoiceId: a.invoice?.id,
              amount: a.amountApplied,
            })),
            error: error instanceof Error ? error.message : String(error),
          },
        );
        throw error;
      }
    }

    let receiptCredit: ReceiptCreditEntity | null = null;
    if (remainingPaymentAmount > 0.01) {
      if (remainingPaymentAmount > 99999999.99) {
        logStructured(
          this.logger,
          'error',
          'receipt.allocate.creditTooLarge',
          'Remaining credit exceeds maximum allowed value',
          {
            remainingPaymentAmount,
            receiptId: receipt.id,
          },
        );
        throw new Error(
          `Credit amount ${remainingPaymentAmount} exceeds maximum allowed value (99,999,999.99)`,
        );
      }

      const studentCredit = await this.creditService.createOrUpdateStudentCredit(
        studentNumber,
        remainingPaymentAmount,
        transactionalEntityManager,
        `Overpayment from Receipt ${receipt.receiptNumber}`,
        receipt.id,
        receipt.servedBy,
      );

      receiptCredit = transactionalEntityManager.create(ReceiptCreditEntity, {
        receipt: receipt,
        studentCredit: studentCredit,
        creditAmount: remainingPaymentAmount,
        createdAt: receipt.paymentDate || new Date(),
      });
      await transactionalEntityManager.save(receiptCredit);
    }

    this.verifyReceiptAllocations(receipt, allocationsToSave);

    return {
      allocations: allocationsToSave,
      updatedInvoices,
      creditCreated: remainingPaymentAmount,
      receiptCredit,
    };
  }

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

    if (totalAllocated > receiptAmount + tolerance) {
      const error = `Receipt ${receipt.receiptNumber} allocations exceed receipt amount: Allocated ${totalAllocated}, Receipt ${receiptAmount}`;
      logStructured(
        this.logger,
        'error',
        'receipt.allocate.validationFailure',
        error,
        {
          receiptId: receipt.id,
          receiptNumber: receipt.receiptNumber,
          receiptAmount,
          totalAllocated,
          allocationsCount: allocations.length,
        },
      );
      throw new Error(error);
    }
  }

  async getAllReceipts(): Promise<ReceiptEntity[]> {
    // Use query builder to ensure invoice relation is loaded even if voided
    // This handles cases where allocations reference voided invoices
    const receipts = await this.receiptRepository
      .createQueryBuilder('receipt')
      .where('receipt.isVoided = :isVoided', { isVoided: false })
      .leftJoinAndSelect('receipt.student', 'student')
      .leftJoinAndSelect('receipt.enrol', 'enrol')
      .leftJoinAndSelect('receipt.allocations', 'allocations')
      .leftJoinAndSelect('allocations.invoice', 'invoice') // Load invoice even if voided
      .leftJoinAndSelect('invoice.student', 'invoiceStudent')
      .leftJoinAndSelect('receipt.receiptCredits', 'receiptCredits')
      .leftJoinAndSelect('receiptCredits.studentCredit', 'studentCredit')
      .addSelect('allocations.invoiceId', 'allocations_invoiceId') // Explicitly select foreign key
      .addSelect('allocations.receiptId', 'allocations_receiptId') // Explicitly select foreign key
      .getMany();

    // Manually set invoiceId and receiptId on allocations to ensure they're in JSON
    // This ensures the foreign keys are available even if the relation isn't fully loaded
    if (receipts.length > 0) {
      const allocationIds = receipts
        .flatMap(r => r.allocations || [])
        .map(a => a.id)
        .filter(id => id != null);
      
      if (allocationIds.length > 0) {
        // Query database directly for invoiceId and receiptId foreign keys
        // This ensures we get the FK even if the relation isn't loaded
        const allocationData = await this.receiptRepository.manager.query(
          `SELECT id, "invoiceId", "receiptId" FROM receipt_invoice_allocations WHERE id = ANY($1::int[])`,
          [allocationIds]
        );
        
        // Create a map for quick lookup
        interface AllocationDbData {
          id: number;
          invoiceId: number | null;
          receiptId: number | null;
        }
        const allocationMap = new Map<number, { invoiceId: number | null; receiptId: number | null }>(
          (allocationData as AllocationDbData[]).map((row) => [row.id, { invoiceId: row.invoiceId, receiptId: row.receiptId }])
        );
        
        // Set the IDs on allocations and load invoice if invoiceId exists but invoice relation is null
        receipts.forEach((receipt) => {
          if (receipt.allocations) {
            receipt.allocations.forEach((allocation) => {
              const alloc = allocation as any; // Type cast to access foreign key properties
              const dbData = allocationMap.get(allocation.id);
              
              if (dbData) {
                // Always set from database if available
                // Use Object.defineProperty to ensure the property is enumerable and will be serialized
                if (dbData.invoiceId != null) {
                  Object.defineProperty(allocation, 'invoiceId', {
                    value: dbData.invoiceId,
                    enumerable: true,
                    writable: true,
                    configurable: true,
                  });
                  
                  // If invoice relation is null but invoiceId exists, try to load the invoice
                  if (!allocation.invoice && dbData.invoiceId) {
                    // The invoice should have been loaded by leftJoinAndSelect, but if it's null,
                    // it might be because the invoice is voided or doesn't exist
                    // We'll leave it null but ensure invoiceId is set for frontend lookup
                  }
                }
                if (dbData.receiptId != null) {
                  Object.defineProperty(allocation, 'receiptId', {
                    value: dbData.receiptId,
                    enumerable: true,
                    writable: true,
                    configurable: true,
                  });
                }
              } else {
                // Fallback: use relation if available
                if (allocation.invoice && !(allocation as any).invoiceId) {
                  Object.defineProperty(allocation, 'invoiceId', {
                    value: allocation.invoice.id,
                    enumerable: true,
                    writable: true,
                    configurable: true,
                  });
                }
                if (!(allocation as any).receiptId && receipt.id) {
                  Object.defineProperty(allocation, 'receiptId', {
                    value: receipt.id,
                    enumerable: true,
                    writable: true,
                    configurable: true,
                  });
                }
              }
            });
          }
        });
      }
    }

    return receipts;
  }

  async getAllReceiptsForAudit(): Promise<ReceiptEntity[]> {
    // Use query builder to ensure invoice relation is loaded even if voided
    return await this.receiptRepository
      .createQueryBuilder('receipt')
      .leftJoinAndSelect('receipt.student', 'student')
      .leftJoinAndSelect('receipt.enrol', 'enrol')
      .leftJoinAndSelect('receipt.allocations', 'allocations')
      .leftJoinAndSelect('allocations.invoice', 'invoice') // Load invoice even if voided
      .leftJoinAndSelect('invoice.student', 'invoiceStudent')
      .leftJoinAndSelect('receipt.receiptCredits', 'receiptCredits')
      .leftJoinAndSelect('receiptCredits.studentCredit', 'studentCredit')
      .orderBy('receipt.paymentDate', 'DESC')
      .getMany();
  }

  async getNotApprovedPayments(): Promise<ReceiptEntity[]> {
    return await this.receiptRepository.find({
      where: {
        approved: false,
        isVoided: false,
      },
    });
  }

  async getPaymentsByStudent(studentNumber: string): Promise<ReceiptEntity[]> {
    // Use query builder to explicitly select foreign key columns
    const receipts = await this.receiptRepository
      .createQueryBuilder('receipt')
      .leftJoinAndSelect('receipt.student', 'student')
      .leftJoinAndSelect('receipt.enrol', 'enrol')
      .leftJoinAndSelect('receipt.allocations', 'allocations')
      .leftJoinAndSelect('allocations.invoice', 'invoice')
      .leftJoinAndSelect('invoice.student', 'invoiceStudent')
      .leftJoinAndSelect('receipt.receiptCredits', 'receiptCredits')
      .leftJoinAndSelect('receiptCredits.studentCredit', 'studentCredit')
      .addSelect('allocations.invoiceId', 'allocations_invoiceId')
      .addSelect('allocations.receiptId', 'allocations_receiptId')
      .where('student.studentNumber = :studentNumber', { studentNumber })
      .andWhere('receipt.isVoided = :isVoided', { isVoided: false })
      .getMany();

    // Manually set invoiceId and receiptId on allocations to ensure they're in JSON
    // These are foreign keys that exist in DB but aren't TypeScript properties
    // Query the database directly to get invoiceId even if relation isn't loaded
    if (receipts.length > 0) {
      const allocationIds = receipts
        .flatMap(r => r.allocations || [])
        .map(a => a.id)
        .filter(id => id != null);
      
      if (allocationIds.length > 0) {
        // Query database directly for invoiceId and receiptId foreign keys
        const allocationData = await this.receiptRepository.manager.query(
          `SELECT id, "invoiceId", "receiptId" FROM receipt_invoice_allocations WHERE id = ANY($1::int[])`,
          [allocationIds]
        );
        
        // Create a map for quick lookup
        interface AllocationDbData {
          id: number;
          invoiceId: number | null;
          receiptId: number | null;
        }
        const allocationMap = new Map<number, { invoiceId: number | null; receiptId: number | null }>(
          (allocationData as AllocationDbData[]).map((row) => [row.id, { invoiceId: row.invoiceId, receiptId: row.receiptId }])
        );
        
        // Set the IDs on allocations
        receipts.forEach((receipt) => {
          if (receipt.allocations) {
            receipt.allocations.forEach((allocation) => {
              const alloc = allocation as any; // Type cast to access foreign key properties
              const dbData = allocationMap.get(allocation.id);
              
              if (dbData) {
                // Always set from database if available
                if (dbData.invoiceId != null) {
                  alloc.invoiceId = dbData.invoiceId;
                }
                if (dbData.receiptId != null) {
                  alloc.receiptId = dbData.receiptId;
                }
              } else {
                // Fallback: use relation if available
                if (allocation.invoice && !alloc.invoiceId) {
                  alloc.invoiceId = allocation.invoice.id;
                }
                if (!alloc.receiptId && receipt.id) {
                  alloc.receiptId = receipt.id;
                }
              }
            });
          }
        });
      } else {
        // No allocations, just set receiptId from parent
        receipts.forEach((receipt) => {
          if (receipt.allocations) {
            receipt.allocations.forEach((allocation) => {
              const alloc = allocation as any;
              if (!alloc.receiptId && receipt.id) {
                alloc.receiptId = receipt.id;
              }
            });
          }
        });
      }
    }

    return receipts;
  }

  async getPaymentsByStudentForAudit(
    studentNumber: string,
  ): Promise<ReceiptEntity[]> {
    // Use query builder to ensure invoice relation is loaded even if voided
    return await this.receiptRepository
      .createQueryBuilder('receipt')
      .leftJoinAndSelect('receipt.student', 'student')
      .leftJoinAndSelect('receipt.enrol', 'enrol')
      .leftJoinAndSelect('receipt.allocations', 'allocations')
      .leftJoinAndSelect('allocations.invoice', 'invoice') // Load invoice even if voided
      .leftJoinAndSelect('invoice.student', 'invoiceStudent')
      .leftJoinAndSelect('receipt.receiptCredits', 'receiptCredits')
      .leftJoinAndSelect('receiptCredits.studentCredit', 'studentCredit')
      .where('student.studentNumber = :studentNumber', { studentNumber })
      .orderBy('receipt.paymentDate', 'DESC')
      .getMany();
  }

  async getReceiptByReceiptNumber(
    receiptNumber: string,
    includeVoided: boolean = false,
  ): Promise<ReceiptEntity | null> {
    const where: any = { receiptNumber };
    if (!includeVoided) {
      where.isVoided = false;
    }

    return await this.receiptRepository.findOne({
      where,
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
      return [];
    }

    return await this.receiptRepository.find({
      where: {
        paymentDate: And(
          MoreThanOrEqual(term.startDate),
          LessThanOrEqual(term.endDate),
        ),
        isVoided: false,
      },
    });
  }

  async getPaymentsByYear(year: number): Promise<ReceiptEntity[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    return await this.receiptRepository.find({
      where: {
        paymentDate: Between(startDate, endDate),
        isVoided: false,
      },
    });
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
      { receiptNumber: receiptNumber },
      { approved: approved },
    );
  }

  async generateReceiptPdf(receipt: ReceiptEntity): Promise<Buffer> {
    const pageHeight = 841.89;
    const pageWidth = 595.28;

    const pageMargin = this.mmToPt(15);
    const contentWidth = pageWidth - 2 * pageMargin;

    const defaultFont = 'Helvetica';
    const defaultFontBold = 'Helvetica-Bold';
    const sectionHeadingFontSize = 13;
    const footerFontSize = 9;

    const logoPath = path.join(process.cwd(), 'public', 'jhs_logo.jpg');

    return new Promise(async (resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        layout: 'portrait',
        bufferPages: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      let currentY = this.mmToPt(15);

      const headerBarHeight = this.mmToPt(55);
      const headerBarY = currentY;

      const titleText = 'RECEIPT';
      doc.font(defaultFontBold).fontSize(30);
      const titleWidth = doc.widthOfString(titleText);
      const titleX = pageWidth / 2 - titleWidth / 2;
      const titleY = headerBarY + this.mmToPt(8);

      const logoWidthPt = this.pxToPt(100);
      const logoHeightPt = this.pxToPt(100);
      const logoPadding = this.mmToPt(2);
      const logoContainerWidth = logoWidthPt + logoPadding * 2;
      const logoContainerHeight = logoHeightPt + logoPadding * 2;
      const logoX = pageMargin;
      const logoContainerY = titleY;

      doc.save();
      doc.fillColor('#f5f7fa');
      doc.roundedRect(logoX, logoContainerY, logoContainerWidth, logoContainerHeight, 3)
        .fill();
      doc.strokeColor('#e0e0e0');
      doc.lineWidth(0.5);
      doc.roundedRect(logoX, logoContainerY, logoContainerWidth, logoContainerHeight, 3)
        .stroke();
      doc.restore();

      const logoImageX = logoX + logoPadding;
      const logoImageY = logoContainerY + logoPadding;

      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, logoImageX, logoImageY, {
            width: logoWidthPt,
            height: logoHeightPt,
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
      doc.fillColor('#000');

      doc.fillColor('#2196f3');
      doc.text(titleText, titleX, titleY);
      doc.fillColor('#000');

      const statusText = receipt.approved ? 'APPROVED' : 'PENDING';
      const statusColor = receipt.approved ? '#4caf50' : '#ff9800';
      const statusBgColor = receipt.approved ? '#e8f5e9' : '#fff3e0';
      doc.font(defaultFontBold).fontSize(9);
      const statusBadgeWidth = doc.widthOfString(statusText) + this.mmToPt(4);
      const statusBadgeHeight = doc.currentLineHeight() + this.mmToPt(2);
      const statusX = pageWidth / 2 - statusBadgeWidth / 2;
      const statusY = titleY + doc.currentLineHeight() + this.mmToPt(8);

      doc.save();
      doc.fillColor(statusBgColor);
      doc.roundedRect(statusX - this.mmToPt(2), statusY, statusBadgeWidth, statusBadgeHeight, 3).fill();
      doc.restore();

      doc.save();
      doc.strokeColor(statusColor);
      doc.lineWidth(1);
      doc.roundedRect(statusX - this.mmToPt(2), statusY, statusBadgeWidth, statusBadgeHeight, 3).stroke();
      doc.restore();

      doc.fillColor(statusColor);
      doc.text(statusText, statusX, statusY + this.mmToPt(1));
      doc.fillColor('#000');

      const logoBottom = logoContainerY + logoContainerHeight;
      currentY = Math.max(statusY + statusBadgeHeight, logoBottom) + this.mmToPt(8);

      const detailsPadding = this.mmToPt(5);
      const detailsBoxY = currentY;
      const detailsBoxHeight = this.mmToPt(30);

      doc.roundedRect(pageMargin, detailsBoxY, contentWidth, detailsBoxHeight, 6)
        .fillAndStroke('#f5f5f5', '#e0e0e0');

      currentY += detailsPadding;

      doc.font(defaultFont).fontSize(8);
      const detailItemWidth = contentWidth / 3;

      let detailX = pageMargin + this.mmToPt(6);
      let detailY = currentY;
      doc.fillColor('#7f8c8d').text('RECEIPT #', detailX, detailY);
      doc.font(defaultFontBold).fontSize(11).fillColor('#000');
      doc.text(receipt.receiptNumber || 'N/A', detailX, detailY + this.mmToPt(5));

      detailX = pageMargin + detailItemWidth + this.mmToPt(6);
      doc.font(defaultFont).fontSize(8).fillColor('#7f8c8d');
      doc.text('PAYMENT DATE', detailX, detailY);
      doc.font(defaultFontBold).fontSize(11).fillColor('#000');
      doc.text(this.formatDate(receipt.paymentDate), detailX, detailY + this.mmToPt(5));

      detailX = pageMargin + 2 * detailItemWidth + this.mmToPt(6);
      doc.font(defaultFont).fontSize(8).fillColor('#7f8c8d');
      doc.text('PAYMENT METHOD', detailX, detailY);
      doc.font(defaultFontBold).fontSize(11).fillColor('#000');
      doc.text(receipt.paymentMethod || 'N/A', detailX, detailY + this.mmToPt(5));

      currentY = detailsBoxY + detailsBoxHeight + this.mmToPt(8);

      doc.font(defaultFontBold).fontSize(sectionHeadingFontSize).fillColor('#000');
      const sectionHeaderY = currentY;
      doc.text('PARTIES', pageMargin, sectionHeaderY);

      doc.strokeColor('#2196f3').lineWidth(2);
      doc.moveTo(pageMargin, sectionHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .lineTo(pageMargin + doc.widthOfString('PARTIES'), sectionHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .stroke();

      currentY += doc.currentLineHeight() + this.mmToPt(5);

      const partyBlockWidth = contentWidth / 2 - this.mmToPt(6);
      const partyBlockPadding = this.mmToPt(4);
      const lineSpacing = this.mmToPt(3);

      const fromBlockX = pageMargin;
      const fromBlockY = currentY;
      const fromBlockHeight = this.mmToPt(45);

      doc.roundedRect(fromBlockX, fromBlockY, partyBlockWidth, fromBlockHeight, 5)
        .fillAndStroke('#f5f7fa', '#2196f3');
      doc.rect(fromBlockX, fromBlockY, 4, fromBlockHeight).fill('#2196f3');

      doc.font(defaultFontBold).fontSize(11).fillColor('#000');
      doc.text('FROM', fromBlockX + partyBlockPadding, fromBlockY + partyBlockPadding);

      let fromContentY = fromBlockY + partyBlockPadding + doc.currentLineHeight() + this.mmToPt(2);
      doc.font(defaultFont).fontSize(10).fillColor('#000');

      if (receipt.student) {
        doc.font(defaultFontBold).fontSize(10);
        doc.text(
          `${receipt.student.name} ${receipt.student.surname} (${receipt.student.studentNumber})`,
          fromBlockX + partyBlockPadding,
          fromContentY,
          { width: partyBlockWidth - partyBlockPadding * 2 },
        );
        fromContentY += doc.currentLineHeight() + lineSpacing;
        doc.font(defaultFont).fontSize(9);

        if (receipt.enrol) {
          doc.text(
            `Enrolled in ${receipt.enrol.name} Term ${receipt.enrol.num}, ${receipt.enrol.year}`,
            fromBlockX + partyBlockPadding,
            fromContentY,
            { width: partyBlockWidth - partyBlockPadding * 2 },
          );
          fromContentY += doc.currentLineHeight() + lineSpacing;
        }

        if (receipt.student.address) {
          doc.text(
            receipt.student.address,
            fromBlockX + partyBlockPadding,
            fromContentY,
            { width: partyBlockWidth - partyBlockPadding * 2 },
          );
          fromContentY += doc.currentLineHeight() + lineSpacing;
        }

        if (receipt.student.cell) {
          doc.text(
            receipt.student.cell,
            fromBlockX + partyBlockPadding,
            fromContentY,
            { width: partyBlockWidth - partyBlockPadding * 2 },
          );
          fromContentY += doc.currentLineHeight() + lineSpacing;
        }

        if (receipt.student.email) {
          doc.text(
            receipt.student.email,
            fromBlockX + partyBlockPadding,
            fromContentY,
            { width: partyBlockWidth - partyBlockPadding * 2 },
          );
        }
      }

      const toBlockX = pageMargin + partyBlockWidth + this.mmToPt(6);
      const toBlockY = currentY;
      const toBlockHeight = this.mmToPt(45);

      doc.roundedRect(toBlockX, toBlockY, partyBlockWidth, toBlockHeight, 5)
        .fillAndStroke('#f5f7fa', '#4caf50');
      doc.rect(toBlockX, toBlockY, 4, toBlockHeight).fill('#4caf50');

      doc.font(defaultFontBold).fontSize(11).fillColor('#000');
      doc.text('TO', toBlockX + partyBlockPadding, toBlockY + partyBlockPadding);

      let toContentY = toBlockY + partyBlockPadding + doc.currentLineHeight() + this.mmToPt(2);
      doc.font(defaultFont).fontSize(9).fillColor('#000');

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

      currentY = Math.max(fromBlockY + fromBlockHeight, toBlockY + toBlockHeight) + this.mmToPt(8);

      doc.font(defaultFontBold).fontSize(sectionHeadingFontSize).fillColor('#000');
      const summaryHeaderY = currentY;
      doc.text('PAYMENT SUMMARY', pageMargin, summaryHeaderY);

      doc.strokeColor('#2196f3').lineWidth(2);
      doc.moveTo(pageMargin, summaryHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .lineTo(pageMargin + doc.widthOfString('PAYMENT SUMMARY'), summaryHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .stroke();

      currentY += doc.currentLineHeight() + this.mmToPt(6);

      const summaryBoxY = currentY;
      const summaryBoxHeight = this.mmToPt(42);

      doc.roundedRect(pageMargin, summaryBoxY, contentWidth, summaryBoxHeight, 6)
        .fillAndStroke('#f5f5f5', '#e0e0e0');

      let summaryY = summaryBoxY + this.mmToPt(4);
      const padding = this.mmToPt(4);
      const valueStartX = pageWidth - pageMargin - padding;

      doc.font(defaultFont).fontSize(9).fillColor('#7f8c8d');
      doc.text('INVOICE PAID', pageMargin + padding, summaryY);

      const invoiceNumbersString = receipt.allocations && receipt.allocations.length > 0
        ? receipt.allocations
            .map((all) => all.invoice?.invoiceNumber || 'N/A')
            .join(', ')
        : 'None';

      doc.font(defaultFontBold).fontSize(10).fillColor('#000');
      const invoiceWidth = doc.widthOfString(invoiceNumbersString);
      doc.text(invoiceNumbersString, valueStartX - invoiceWidth, summaryY);

      summaryY += doc.currentLineHeight() + this.mmToPt(1.5);
      doc.strokeColor('#ddd').lineWidth(0.5);
      doc.moveTo(pageMargin + padding, summaryY)
        .lineTo(pageWidth - pageMargin - padding, summaryY)
        .stroke();

      summaryY += this.mmToPt(3);

      doc.font(defaultFont).fontSize(9).fillColor('#7f8c8d');
      doc.text('AMOUNT PAID', pageMargin + padding, summaryY);

      doc.font(defaultFontBold).fontSize(11).fillColor('#4caf50');
      const amountPaidText = this.formatCurrency(receipt.amountPaid);
      const amountPaidWidth = doc.widthOfString(amountPaidText);
      doc.text(amountPaidText, valueStartX - amountPaidWidth, summaryY);

      summaryY += doc.currentLineHeight() + this.mmToPt(1.5);
      doc.strokeColor('#4caf50').lineWidth(1.5);
      doc.moveTo(pageMargin + padding, summaryY)
        .lineTo(pageWidth - pageMargin - padding, summaryY)
        .stroke();

      summaryY += this.mmToPt(3);

      doc.font(defaultFont).fontSize(9).fillColor('#7f8c8d');
      doc.text('AMOUNT OUTSTANDING', pageMargin + padding, summaryY);

      const amountOutstanding = receipt.student
        ? await this.getStudentBalance(receipt.student.studentNumber)
        : { amountDue: 0 };

      doc.font(defaultFontBold).fontSize(11).fillColor('#f44336');
      const amountOutstandingText = this.formatCurrency(amountOutstanding.amountDue);
      const amountOutstandingWidth = doc.widthOfString(amountOutstandingText);
      doc.text(amountOutstandingText, valueStartX - amountOutstandingWidth, summaryY);

      doc.fillColor('#000');

      currentY = summaryBoxY + summaryBoxHeight + this.mmToPt(8);

      currentY += this.mmToPt(6);
      doc
        .font(defaultFontBold)
        .fontSize(sectionHeadingFontSize)
        .fillColor('#000');
      const remarksHeaderY = currentY;
      doc.text('REMARKS:', pageMargin, remarksHeaderY);

      doc.strokeColor('#2196f3').lineWidth(2);
      doc.moveTo(pageMargin, remarksHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .lineTo(pageMargin + doc.widthOfString('REMARKS:'), remarksHeaderY + doc.currentLineHeight() + this.mmToPt(2))
        .stroke();

      currentY += doc.currentLineHeight() + this.mmToPt(5);

      doc.font(defaultFont).fontSize(10).fillColor('#000');
      const remarksText =
        receipt.description ||
        'Thank You For Your Prompt Payment, We Appreciate Your Business';
      doc.text(remarksText, pageMargin, currentY, {
        width: contentWidth,
        align: 'left',
      });

      const footerContentHeight = this.mmToPt(18);
      const footerBorderTopOffset = this.mmToPt(8);
      const footerPaddingTop = this.mmToPt(4);

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

      if (receipt.isVoided) {
        doc.save();
        doc.fillOpacity(0.25);
        doc.rect(0, 0, pageWidth, pageHeight).fill('#000');
        doc.restore();

        doc.save();
        doc.translate(pageWidth / 2, pageHeight / 2);
        doc.rotate(45);
        doc.font(defaultFontBold).fontSize(72).fillColor('#f44336');
        const voidText = 'VOIDED';
        const voidWidth = doc.widthOfString(voidText);
        doc.text(voidText, -voidWidth / 2, 0, {
          align: 'center',
          width: voidWidth,
        });
        doc.restore();

        doc.font(defaultFontBold).fontSize(16).fillColor('#f44336');
        doc.text('VOIDED', pageWidth / 2, pageHeight - this.mmToPt(40), {
          align: 'center',
          width: contentWidth,
        });

        if (receipt.voidedBy) {
          doc.font(defaultFont).fontSize(10).fillColor('#666');
          doc.text(`By: ${receipt.voidedBy}`, pageWidth / 2, pageHeight - this.mmToPt(35), {
            align: 'center',
            width: contentWidth,
          });
        }

        if (receipt.voidedAt) {
          doc.font(defaultFont).fontSize(10).fillColor('#666');
          doc.text(`On: ${this.formatDate(receipt.voidedAt)}`, pageWidth / 2, pageHeight - this.mmToPt(30), {
            align: 'center',
            width: contentWidth,
          });
        }
      }

      doc.end();
    });
  }

  async generateReceiptNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REC-${year}-`;

    const lastReceipt = await this.receiptRepository.findOne({
      where: { receiptNumber: Like(`${prefix}%`) },
      order: { id: 'DESC' },
    });

    let sequence = 1;
    if (lastReceipt) {
      const parts = lastReceipt.receiptNumber.split('-');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          sequence = lastSeq + 1;
        }
      }
    }

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }

  private mmToPt(mm: number): number {
    return mm * 2.83465;
  }

  private pxToPt(px: number): number {
    return px * 0.75;
  }

  private formatCurrency(amount: number | string): string {
    const numericAmount =
      typeof amount === 'string' ? parseFloat(amount) : Number(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount || 0);
  }

  private formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  }

  private getInvoiceStatus(invoice: InvoiceEntity): InvoiceStatus {
    if (invoice.isVoided) {
      return InvoiceStatus.Voided;
    }

    const balance = Number(invoice.balance);
    const tolerance = 0.01;

    if (balance <= tolerance) {
      return InvoiceStatus.Paid;
    }

    const amountPaid = Number(invoice.amountPaidOnInvoice);
    if (amountPaid > tolerance) {
      const dueDate = new Date(invoice.invoiceDueDate);
      const now = new Date();

      if (now > dueDate) {
        return InvoiceStatus.Overdue;
      }

      return InvoiceStatus.PartiallyPaid;
    }

    const dueDate = new Date(invoice.invoiceDueDate);
    const now = new Date();

    if (now > dueDate) {
      return InvoiceStatus.Overdue;
    }

    return InvoiceStatus.Pending;
  }
}


/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { StudentCreditEntity } from '../entities/student-credit.entity';
import { CreditTransactionEntity, CreditTransactionType } from '../entities/credit-transaction.entity';
import { ReceiptCreditEntity } from '../entities/receipt-credit.entity';
import { CreditInvoiceAllocationEntity } from '../entities/credit-invoice-allocation.entity';
import { ReceiptInvoiceAllocationEntity } from '../entities/receipt-invoice-allocation.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { FinancialValidationService } from './financial-validation.service';
import {
  InsufficientCreditException,
  CreditBalanceMismatchException,
  StudentNotFoundException,
  InvalidAmountException,
} from '../exceptions/payment.exceptions';
import { CreditTransactionQueryDto } from '../dtos/credit-transaction-query.dto';
import { logStructured } from '../utils/logger.util';
import { AuditService } from './audit.service';
import { sanitizeAmount } from '../utils/sanitization.util';

/**
 * Service for managing student credits
 * Handles credit creation, deduction, verification, and transaction history
 */
@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(
    @InjectRepository(StudentCreditEntity)
    private readonly studentCreditRepository: Repository<StudentCreditEntity>,
    @InjectRepository(CreditTransactionEntity)
    private readonly creditTransactionRepository: Repository<CreditTransactionEntity>,
    @InjectRepository(ReceiptCreditEntity)
    private readonly receiptCreditRepository: Repository<ReceiptCreditEntity>,
    @InjectRepository(CreditInvoiceAllocationEntity)
    private readonly creditAllocationRepository: Repository<CreditInvoiceAllocationEntity>,
    private readonly financialValidationService: FinancialValidationService,
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

  /**
   * Verifies that student credit balance matches the sum of receipt credits minus credit allocations.
   * This ensures data integrity by reconciling the credit balance with all credit transactions.
   * 
   * @param studentNumber - The student number to verify credit balance for
   * @param transactionalEntityManager - The entity manager to use for queries
   * @throws CreditBalanceMismatchException if balance reconciliation fails
   */
  async verifyStudentCreditBalance(
    studentNumber: string,
    transactionalEntityManager: EntityManager,
  ): Promise<void> {
    const studentCredit = await transactionalEntityManager.findOne(
      StudentCreditEntity,
      { where: { studentNumber } },
    );

    // If no credit exists, nothing to verify
    if (!studentCredit) {
      return;
    }

    // Sum all receipt credits (credits created from receipt overpayments)
    const receiptCredits = await transactionalEntityManager.find(
      ReceiptCreditEntity,
      {
        where: { studentCredit: { id: studentCredit.id } },
      },
    );
    const totalReceiptCredits = receiptCredits.reduce(
      (sum, rc) => sum + Number(rc.creditAmount || 0),
      0,
    );

    // Sum invoice overpayment credits (credits created from invoice overpayments)
    // These are credits created when amountPaidOnInvoice > totalBill
    // We calculate this by checking invoices where allocations exceed totalBill
    const { InvoiceEntity } = await import('../entities/invoice.entity');
    const studentInvoices = await transactionalEntityManager.find(
      InvoiceEntity,
      {
        where: { student: { studentNumber }, isVoided: false },
        relations: ['allocations', 'creditAllocations'],
      },
    );

    let totalInvoiceOverpaymentCredits = 0;
    for (const invoice of studentInvoices) {
      const totalBill = Number(invoice.totalBill || 0);
      const exemptedAmount = Number(invoice.exemptedAmount || 0);
      const netBill = totalBill - exemptedAmount;

      const receiptAllocations = invoice.allocations || [];
      const creditAllocations = invoice.creditAllocations || [];
      const totalReceiptAllocated = receiptAllocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied || 0),
        0,
      );
      const totalCreditAllocated = creditAllocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied || 0),
        0,
      );
      const totalPaid = totalReceiptAllocated + totalCreditAllocated;

      // If total paid exceeds net bill, the excess is credit from invoice overpayment
      if (totalPaid > netBill + 0.01) {
        const overpayment = totalPaid - netBill;
        totalInvoiceOverpaymentCredits += overpayment;
      }
    }

    // Total credits created = receipt credits + invoice overpayment credits
    const totalCreditsCreated = totalReceiptCredits + totalInvoiceOverpaymentCredits;

    // Sum all credit allocations (credits applied to invoices)
    // These are the only things that reduce credit balance
    const creditAllocations = await transactionalEntityManager.find(
      CreditInvoiceAllocationEntity,
      {
        where: { studentCredit: { id: studentCredit.id } },
      },
    );
    const totalCreditsApplied = creditAllocations.reduce(
      (sum, ca) => sum + Number(ca.amountApplied || 0),
      0,
    );

    // Expected balance = credits created - credit allocations
    // Note: Receipt allocations don't affect credit balance because:
    // - If a receipt was allocated to an invoice, it never created credit (only overpayments create credit)
    // - Receipt allocations are direct payments, not credit usage
    // - Credit is only reduced when it's applied to invoices via credit allocations
    let expectedBalance = totalCreditsCreated - totalCreditsApplied;
    
    // Credit balance cannot be negative (enforced by database constraint)
    // If calculation results in negative, it means there's a data integrity issue
    // Set to 0 and log a warning
    if (expectedBalance < 0) {
      logStructured(
        this.logger,
        'warn',
        'credit.balance.negative',
        'Calculated credit balance is negative - setting to 0',
        {
          studentNumber,
          calculatedBalance: expectedBalance,
          totalCreditsCreated,
          totalCreditsApplied,
          studentCreditId: studentCredit.id,
        },
      );
      expectedBalance = 0;
    }
    const actualBalance = Number(studentCredit.amount);
    const tolerance = 0.01;

    if (Math.abs(expectedBalance - actualBalance) > tolerance) {
      logStructured(
        this.logger,
        'warn',
        'credit.balance.mismatch',
        'Credit balance mismatch detected - auto-fixing',
        {
          studentNumber,
          expectedBalance,
          actualBalance,
          totalReceiptCredits,
          totalInvoiceOverpaymentCredits,
          totalCreditsCreated,
          totalCreditsApplied,
          studentCreditId: studentCredit.id,
        },
      );
      
      // Auto-fix: Update the stored balance to match the calculated balance
      // Ensure it's not negative (should already be handled above, but double-check)
      studentCredit.amount = Math.max(0, expectedBalance);
      await transactionalEntityManager.save(StudentCreditEntity, studentCredit);
      
      logStructured(
        this.logger,
        'log',
        'credit.balance.autoFixed',
        'Credit balance auto-corrected',
        {
          studentNumber,
          oldBalance: actualBalance,
          newBalance: expectedBalance,
        },
      );
    }

    this.logger.debug(
      `Credit balance verified for ${studentNumber}: ${actualBalance} (Receipt Credits: ${totalReceiptCredits}, Invoice Overpayment Credits: ${totalInvoiceOverpaymentCredits}, Total Created: ${totalCreditsCreated}, Credit Allocations: ${totalCreditsApplied})`,
      {
        studentNumber,
        actualBalance,
        totalReceiptCredits,
        totalInvoiceOverpaymentCredits,
        totalCreditsCreated,
        totalCreditsApplied,
      },
    );
  }

  /**
   * Determines which receipt's credit should be used when applying credit (FIFO - First In First Out).
   * Returns the receipt ID if credit came from a receipt, null otherwise.
   * 
   * @param studentCredit - The student credit entity
   * @param amountToApply - The amount of credit being applied
   * @param transactionalEntityManager - The entity manager for the transaction
   * @returns The receipt ID that the credit came from, or null if not from a receipt
   */
  async determineReceiptSourceForCredit(
    studentCredit: StudentCreditEntity,
    amountToApply: number,
    transactionalEntityManager: EntityManager,
  ): Promise<number | null> {
    // Get all receipt credits for this student, ordered by creation date (FIFO)
    const receiptCredits = await transactionalEntityManager.find(
      ReceiptCreditEntity,
      {
        where: { studentCredit: { id: studentCredit.id } },
        relations: ['receipt'],
        order: { createdAt: 'ASC' }, // FIFO - oldest first
      },
    );

    if (receiptCredits.length === 0) {
      // Credit didn't come from a receipt (e.g., manual credit, restored credit)
      return null;
    }

    // Find which receipt credit(s) are being used
    // We use FIFO: oldest receipt credits are used first
    let remainingAmount = amountToApply;
    for (const receiptCredit of receiptCredits) {
      if (remainingAmount <= 0) {
        break;
      }
      const creditAmount = Number(receiptCredit.creditAmount);
      
      // If this receipt credit covers the amount, return its receipt ID
      if (creditAmount >= remainingAmount) {
        return receiptCredit.receipt.id;
      }
      
      remainingAmount -= creditAmount;
    }

    // If we used multiple receipt credits, return the first one (FIFO)
    // This is an approximation - in reality, we might want to split allocations
    // For simplicity, we'll use the first receipt that contributed
    return receiptCredits[0]?.receipt?.id || null;
  }

  /**
   * Creates or updates a student's credit balance
   * @param studentNumber - The student number
   * @param amount - The amount to add to the credit balance
   * @param transactionalEntityManager - The entity manager for the transaction
   * @param source - The source of the credit (e.g., 'Overpayment')
   * @param relatedReceiptId - Optional receipt ID that created this credit
   * @param performedBy - Optional user who performed this action
   * @returns The saved student credit entity
   */
  async createOrUpdateStudentCredit(
    studentNumber: string,
    amount: number,
    transactionalEntityManager: EntityManager,
    source = 'Overpayment',
    relatedReceiptId?: number,
    performedBy?: string,
    ipAddress?: string,
  ): Promise<StudentCreditEntity> {
    // Sanitize amount to prevent precision issues
    const sanitizedAmount = sanitizeAmount(amount);
    
    // Validate amount
    this.validateAmount(sanitizedAmount, 'Credit amount');

    let studentCredit = await transactionalEntityManager.findOne(
      StudentCreditEntity,
      {
        where: { studentNumber: studentNumber },
        relations: ['student'], // Load the student relation if needed
      },
    );

    const currentCreditBalance = studentCredit
      ? Number(studentCredit.amount)
      : 0;

    // Business rule: Validate maximum credit balance per student
    this.financialValidationService.validateCreditBalanceLimit(
      currentCreditBalance,
      sanitizedAmount,
    );

    if (studentCredit) {
      // Update existing credit
      const previousAmount = Number(studentCredit.amount);
      studentCredit.amount = sanitizeAmount(previousAmount + sanitizedAmount);
      studentCredit.lastCreditSource = source;

      logStructured(
        this.logger,
        'log',
        'credit.createOrUpdate.update',
        'Updated student credit',
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
        logStructured(
          this.logger,
          'error',
          'credit.createOrUpdate.studentNotFound',
          'Student not found for credit creation',
          { studentNumber, amount, source },
        );
        throw new StudentNotFoundException(
          studentNumber,
          'Cannot create credit for a non-existent student.',
        );
      }
      studentCredit = transactionalEntityManager.create(StudentCreditEntity, {
        student: student,
        studentNumber: studentNumber,
        amount: sanitizedAmount,
        lastCreditSource: source,
      });

      logStructured(
        this.logger,
        'log',
        'credit.createOrUpdate.create',
        'Created new student credit',
        {
          studentNumber,
          amount,
          source,
        },
      );
    }

    const savedCredit = await transactionalEntityManager.save(studentCredit);

    // Create transaction history record
    const transaction = transactionalEntityManager.create(
      CreditTransactionEntity,
      {
        studentCredit: savedCredit,
        amount: sanitizedAmount, // Positive for credit creation
        transactionType: CreditTransactionType.CREDIT,
        source: source,
        relatedReceiptId: relatedReceiptId,
        performedBy: performedBy || 'system',
        transactionDate: new Date(),
      },
    );
    await transactionalEntityManager.save(transaction);

    // Verify credit balance matches sum of allocations
    await this.verifyStudentCreditBalance(
      studentNumber,
      transactionalEntityManager,
    );

    // Audit logging
    if (performedBy) {
      try {
        await this.auditService.logCreditCreated(
          savedCredit.id,
          performedBy,
          {
            studentNumber,
            amount: sanitizedAmount,
            source,
            relatedReceiptId,
            newBalance: savedCredit.amount,
          },
          ipAddress,
          transactionalEntityManager,
        );
      } catch (auditError) {
        // Don't fail the main operation if audit logging fails
        logStructured(
          this.logger,
          'warn',
          'credit.createOrUpdate.auditFailed',
          'Failed to log audit entry for credit creation',
          {
            creditId: savedCredit.id,
            studentNumber,
            error:
              auditError instanceof Error
                ? auditError.message
                : String(auditError),
          },
        );
      }
    }

    return savedCredit;
  }

  /**
   * Deducts credit from a student's balance
   * @param studentNumber - The student number
   * @param amountToDeduct - The amount to deduct
   * @param transactionalEntityManager - The entity manager for the transaction
   * @param reason - The reason for the deduction (e.g., 'Applied to Invoice')
   * @param relatedInvoiceId - Optional invoice ID that this credit is applied to
   * @param performedBy - Optional user who performed this action
   * @returns The updated student credit entity, or null if no credit exists
   */
  async deductStudentCredit(
    studentNumber: string,
    amountToDeduct: number,
    transactionalEntityManager: EntityManager,
    reason = 'Applied to Invoice',
    relatedInvoiceId?: number,
    performedBy?: string,
    ipAddress?: string,
  ): Promise<StudentCreditEntity | null> {
    // Sanitize amount to prevent precision issues
    const sanitizedAmountToDeduct = sanitizeAmount(amountToDeduct);
    
    // Validate amount
    this.validateAmount(sanitizedAmountToDeduct, 'Credit deduction amount');

    const studentCredit = await transactionalEntityManager.findOne(
      StudentCreditEntity,
      {
        where: { studentNumber: studentNumber },
      },
    );

    if (studentCredit && Number(studentCredit.amount) >= sanitizedAmountToDeduct) {
      const previousAmount = Number(studentCredit.amount);
      studentCredit.amount = sanitizeAmount(previousAmount - sanitizedAmountToDeduct);
      studentCredit.lastCreditSource = `Deducted: ${reason}`;

      if (studentCredit.amount <= 0) {
        // If credit becomes zero or negative, keep it at 0 for historical purposes
        studentCredit.amount = 0;
        await transactionalEntityManager.save(studentCredit);

        logStructured(
          this.logger,
          'log',
          'credit.deduct.exhausted',
          'Deducted student credit (exhausted)',
          {
            studentNumber,
            previousAmount,
            amountDeducted: sanitizedAmountToDeduct,
            reason,
          },
        );

        // Create transaction history record
        const transaction = transactionalEntityManager.create(
          CreditTransactionEntity,
          {
            studentCredit: studentCredit,
            amount: -sanitizedAmountToDeduct, // Negative for deduction/application
            transactionType: CreditTransactionType.APPLICATION,
            source: reason,
            relatedInvoiceId: relatedInvoiceId,
            performedBy: performedBy || 'system',
            transactionDate: new Date(),
          },
        );
        await transactionalEntityManager.save(transaction);

        // Verify credit balance matches sum of allocations
        await this.verifyStudentCreditBalance(
          studentNumber,
          transactionalEntityManager,
        );

        // Audit logging
        if (performedBy && studentCredit) {
          try {
            await this.auditService.logCreditApplied(
              studentCredit.id,
              performedBy,
              {
                studentNumber,
                amountApplied: sanitizedAmountToDeduct,
                reason,
                relatedInvoiceId,
                remainingBalance: studentCredit.amount,
              },
              ipAddress,
              transactionalEntityManager,
            );
          } catch (auditError) {
            // Don't fail the main operation if audit logging fails
            logStructured(
              this.logger,
              'warn',
              'credit.deduct.auditFailed',
              'Failed to log audit entry for credit application',
              {
                creditId: studentCredit.id,
                studentNumber,
                error:
                  auditError instanceof Error
                    ? auditError.message
                    : String(auditError),
              },
            );
          }
        }

        return studentCredit;
      } else {
        await transactionalEntityManager.save(studentCredit);

        logStructured(
          this.logger,
          'log',
          'credit.deduct.partial',
          'Deducted student credit',
          {
            studentNumber,
            previousAmount,
            amountDeducted: sanitizedAmountToDeduct,
            remainingAmount: studentCredit.amount,
            reason,
          },
        );

        // Create transaction history record
        const transaction = transactionalEntityManager.create(
          CreditTransactionEntity,
          {
            studentCredit: studentCredit,
            amount: -sanitizedAmountToDeduct, // Negative for deduction/application
            transactionType: CreditTransactionType.APPLICATION,
            source: reason,
            relatedInvoiceId: relatedInvoiceId,
            performedBy: performedBy || 'system',
            transactionDate: new Date(),
          },
        );
        await transactionalEntityManager.save(transaction);

        // Verify credit balance matches sum of allocations
        await this.verifyStudentCreditBalance(
          studentNumber,
          transactionalEntityManager,
        );

        // Audit logging
        if (performedBy && studentCredit) {
          try {
            await this.auditService.logCreditApplied(
              studentCredit.id,
              performedBy,
              {
                studentNumber,
                amountApplied: sanitizedAmountToDeduct,
                reason,
                relatedInvoiceId,
                remainingBalance: studentCredit.amount,
              },
              ipAddress,
              transactionalEntityManager,
            );
          } catch (auditError) {
            // Don't fail the main operation if audit logging fails
            logStructured(
              this.logger,
              'warn',
              'credit.deduct.auditFailed',
              'Failed to log audit entry for credit application',
              {
                creditId: studentCredit.id,
                studentNumber,
                error:
                  auditError instanceof Error
                    ? auditError.message
                    : String(auditError),
              },
            );
          }
        }

        return studentCredit;
      }
    } else if (studentCredit && Number(studentCredit.amount) < amountToDeduct) {
      logStructured(
        this.logger,
        'error',
        'credit.deduct.insufficient',
        'Insufficient credit balance for deduction',
        {
          studentNumber,
          availableCredit: studentCredit.amount,
          requestedAmount: amountToDeduct,
          reason,
        },
      );
      throw new InsufficientCreditException(
        studentNumber,
        amountToDeduct,
        Number(studentCredit.amount),
      );
    }

    logStructured(
      this.logger,
      'warn',
      'credit.deduct.notFound',
      'No credit found when attempting to deduct',
      { studentNumber, amountToDeduct, reason },
    );
    return null; // No credit found for student
  }

  /**
   * Gets a student's credit balance
   * @param studentNumber - The student number
   * @param transactionalEntityManager - The entity manager for the transaction
   * @returns The student credit entity, or null if no credit exists
   */
  async getStudentCredit(
    studentNumber: string,
    transactionalEntityManager: EntityManager,
  ): Promise<StudentCreditEntity | null> {
    return await transactionalEntityManager.findOne(StudentCreditEntity, {
      where: { studentNumber },
    });
  }

  /**
   * Gets credit transaction history for a student
   * @param studentNumber - The student number
   * @param query - Optional query parameters for filtering
   * @returns Array of credit transactions
   */
  async getCreditTransactions(
    studentNumber: string,
    query?: CreditTransactionQueryDto,
  ): Promise<CreditTransactionEntity[]> {
    // First, get the student credit entity
    const studentCredit = await this.studentCreditRepository.findOne({
      where: { studentNumber },
    });

    if (!studentCredit) {
      // Return empty array if student has no credit record
      return [];
    }

    // Build query
    const queryBuilder = this.creditTransactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.studentCreditId = :studentCreditId', {
        studentCreditId: studentCredit.id,
      })
      .leftJoinAndSelect('transaction.studentCredit', 'studentCredit')
      .orderBy('transaction.transactionDate', 'DESC');

    // Apply filters
    if (query?.startDate) {
      queryBuilder.andWhere('transaction.transactionDate >= :startDate', {
        startDate: new Date(query.startDate),
      });
    }

    if (query?.endDate) {
      queryBuilder.andWhere('transaction.transactionDate <= :endDate', {
        endDate: new Date(query.endDate),
      });
    }

    if (query?.transactionType) {
      queryBuilder.andWhere('transaction.transactionType = :transactionType', {
        transactionType: query.transactionType,
      });
    }

    if (query?.performedBy) {
      queryBuilder.andWhere('transaction.performedBy = :performedBy', {
        performedBy: query.performedBy,
      });
    }

    return await queryBuilder.getMany();
  }

  /**
   * Get credit transaction summary/report for a student
   * @param studentNumber - The student number
   * @param startDate - Optional start date
   * @param endDate - Optional end date
   * @returns Summary statistics
   */
  async getCreditTransactionSummary(
    studentNumber: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalCreditsCreated: number;
    totalCreditsApplied: number;
    totalCreditsReversed: number;
    netCreditChange: number;
    transactionCount: number;
    currentBalance: number;
  }> {
    const studentCredit = await this.studentCreditRepository.findOne({
      where: { studentNumber },
    });

    if (!studentCredit) {
      return {
        totalCreditsCreated: 0,
        totalCreditsApplied: 0,
        totalCreditsReversed: 0,
        netCreditChange: 0,
        transactionCount: 0,
        currentBalance: 0,
      };
    }

    const queryBuilder = this.creditTransactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.studentCreditId = :studentCreditId', {
        studentCreditId: studentCredit.id,
      });

    if (startDate) {
      queryBuilder.andWhere('transaction.transactionDate >= :startDate', {
        startDate,
      });
    }

    if (endDate) {
      queryBuilder.andWhere('transaction.transactionDate <= :endDate', {
        endDate,
      });
    }

    const transactions = await queryBuilder.getMany();

    const totalCreditsCreated = transactions
      .filter((t) => t.transactionType === CreditTransactionType.CREDIT)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalCreditsApplied = transactions
      .filter((t) => t.transactionType === CreditTransactionType.APPLICATION)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    const totalCreditsReversed = transactions
      .filter((t) => t.transactionType === CreditTransactionType.REVERSAL)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const netCreditChange = totalCreditsCreated + totalCreditsReversed - totalCreditsApplied;

    return {
      totalCreditsCreated,
      totalCreditsApplied,
      totalCreditsReversed,
      netCreditChange,
      transactionCount: transactions.length,
      currentBalance: Number(studentCredit.amount),
    };
  }

  /**
   * Get credit activity report for all students or filtered by date range
   * @param startDate - Optional start date
   * @param endDate - Optional end date
   * @returns Credit activity statistics
   */
  async getCreditActivityReport(
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalCreditsCreated: number;
    totalCreditsApplied: number;
    totalCreditsReversed: number;
    uniqueStudents: number;
    transactionCount: number;
    averageCreditAmount: number;
    topStudents: Array<{
      studentNumber: string;
      totalCredits: number;
      totalApplied: number;
      currentBalance: number;
    }>;
  }> {
    const queryBuilder = this.creditTransactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.studentCredit', 'studentCredit');

    if (startDate) {
      queryBuilder.andWhere('transaction.transactionDate >= :startDate', {
        startDate,
      });
    }

    if (endDate) {
      queryBuilder.andWhere('transaction.transactionDate <= :endDate', {
        endDate,
      });
    }

    const transactions = await queryBuilder.getMany();

    const totalCreditsCreated = transactions
      .filter((t) => t.transactionType === CreditTransactionType.CREDIT)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalCreditsApplied = transactions
      .filter((t) => t.transactionType === CreditTransactionType.APPLICATION)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    const totalCreditsReversed = transactions
      .filter((t) => t.transactionType === CreditTransactionType.REVERSAL)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Get unique students
    const uniqueStudentNumbers = new Set(
      transactions
        .map((t) => t.studentCredit?.studentNumber)
        .filter((num) => num !== undefined),
    );

    // Calculate top students by credit balance
    const studentCredits = await this.studentCreditRepository.find({
      where: Array.from(uniqueStudentNumbers).map((studentNumber) => ({
        studentNumber,
      })),
    });

    const topStudents = studentCredits
      .map((sc) => {
        const studentTransactions = transactions.filter(
          (t) => t.studentCredit?.studentNumber === sc.studentNumber,
        );
        const totalCredits = studentTransactions
          .filter((t) => t.transactionType === CreditTransactionType.CREDIT)
          .reduce((sum, t) => sum + Number(t.amount), 0);
        const totalApplied = studentTransactions
          .filter((t) => t.transactionType === CreditTransactionType.APPLICATION)
          .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

        return {
          studentNumber: sc.studentNumber,
          totalCredits,
          totalApplied,
          currentBalance: Number(sc.amount),
        };
      })
      .sort((a, b) => b.currentBalance - a.currentBalance)
      .slice(0, 10); // Top 10 students

    const averageCreditAmount =
      transactions.length > 0
        ? totalCreditsCreated / transactions.filter(
            (t) => t.transactionType === CreditTransactionType.CREDIT,
          ).length
        : 0;

    return {
      totalCreditsCreated,
      totalCreditsApplied,
      totalCreditsReversed,
      uniqueStudents: uniqueStudentNumbers.size,
      transactionCount: transactions.length,
      averageCreditAmount,
      topStudents,
    };
  }
}


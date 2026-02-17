/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Like, Not, Or, Repository } from 'typeorm';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { Stream } from 'stream';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceStatus } from 'src/finance/models/invoice-status.enum';
import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { FinanceService } from 'src/finance/finance.service';
import { ResourceByIdService } from 'src/resource-by-id/resource-by-id.service';
import {
  StudentNotFoundException,
  EnrolmentNotFoundException,
  MissingRequiredFieldException,
  InvoiceNotFoundException,
  InvoiceAlreadyVoidedException,
  InvoiceBalanceMismatchException,
} from '../exceptions/payment.exceptions';
import { BillsEntity } from 'src/finance/entities/bills.entity';
import { BalancesEntity } from 'src/finance/entities/balances.entity';
import { InvoiceStatsModel } from 'src/finance/models/invoice-stats.model';
import { FeesNames } from 'src/finance/models/fees-names.enum';
import { ExemptionEntity } from 'src/exemptions/entities/exemptions.entity';
import { ExemptionType } from 'src/exemptions/enums/exemptions-type.enum';
import { ReceiptEntity } from '../entities/payment.entity';
import { CreditInvoiceAllocationEntity } from '../entities/credit-invoice-allocation.entity';
import { ReceiptInvoiceAllocationEntity } from '../entities/receipt-invoice-allocation.entity';
import { ReceiptCreditEntity } from '../entities/receipt-credit.entity';
import { StudentCreditEntity } from '../entities/student-credit.entity';
import {
  CreditTransactionEntity,
  CreditTransactionType,
} from '../entities/credit-transaction.entity';
import { CreditService } from './credit.service';
import { FinancialValidationService } from './financial-validation.service';
import { CreateInvoiceDto } from '../dtos/create-invoice.dto';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { StudentsService } from 'src/profiles/students/students.service';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { FeesEntity } from 'src/finance/entities/fees.entity';
import { logStructured } from '../utils/logger.util';
import { AuditService } from './audit.service';
import { sanitizeAmount, sanitizeOptionalAmount } from '../utils/sanitization.util';
import { InvoiceResponseDto } from '../dtos/invoice-response.dto';
import { NotificationService } from '../../notifications/services/notification.service';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepository: Repository<InvoiceEntity>,
    @InjectRepository(ReceiptEntity)
    private readonly receiptRepository: Repository<ReceiptEntity>,
    private readonly dataSource: DataSource,
    private readonly studentsService: StudentsService,
    private readonly enrolmentService: EnrolmentService,
    private readonly financeService: FinanceService,
    private readonly resourceById: ResourceByIdService,
    private readonly financialValidationService: FinancialValidationService,
    private readonly creditService: CreditService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async generateStatementOfAccount(
    studentNumber: string,
    _profile?: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<InvoiceEntity> {
    const student =
      await this.studentsService.getStudentByStudentNumberWithExemption(
        studentNumber,
      );
    if (!student) {
      throw new StudentNotFoundException(
        studentNumber,
        'Cannot get credit balance for a non-existent student.',
      );
    }

    const studentExemption = student.exemption;
    const payments = await this.receiptRepository.find({
      where: {
        student: { studentNumber },
        isVoided: false,
      },
      relations: [
        'student',
        'enrol',
        'allocations',
        'allocations.invoice',
        'allocations.invoice.student',
        'receiptCredits',
        'receiptCredits.studentCredit',
      ],
    });
    const bills = await this.financeService.getStudentBills(studentNumber);
    const enrol = await this.enrolmentService.getCurrentEnrollment(
      studentNumber,
    );

    // LEGACY NOTE:
    // Originally, invoices also pulled in a BalancesEntity (balanceBfwd) here.
    // That behaviour was only needed to migrate historical balances that
    // existed before the system was in use. New invoices should be computed
    // purely from bills / receipts / credits, so we intentionally do NOT
    // attach balanceBfwd for newly generated invoices.

    const invoice = new InvoiceEntity();
    invoice.student = student;
    invoice.enrol = enrol;
    invoice.bills = bills;
    invoice.exemption = studentExemption || null;
    invoice.exemptedAmount = this._calculateExemptionAmount(invoice);
    invoice.amountPaidOnInvoice = payments.reduce(
      (sum, payment) => sum + Number(payment.amountPaid),
      0,
    );

    this.updateInvoiceBalance(invoice, true);
    invoice.status = this.getInvoiceStatus(invoice);
    invoice.invoiceDate = new Date();
    invoice.invoiceDueDate = new Date();
    invoice.isVoided = false;

    this.verifyInvoiceBalance(invoice);

    return invoice;
  }

  async generateEmptyInvoice(
    studentNumber: string,
    num: number,
    year: number,
  ): Promise<InvoiceEntity> {
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
    newInv.invoiceNumber = await this.generateInvoiceNumber();
    newInv.invoiceDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    newInv.invoiceDueDate = dueDate;
    newInv.totalBill = 0;
    newInv.balance = 0;
    newInv.amountPaidOnInvoice = 0;
    newInv.status = InvoiceStatus.Pending;
    newInv.exemptedAmount = 0;
    newInv.isVoided = false;

    // For legacy reasons, invoices used to carry a balanceBfwd link here.
    // Going forward, new invoices should ignore BalancesEntity completely.
    // Any historical opening balances are already captured on legacy invoices.

    return newInv;
  }

  async saveInvoice(
    invoice: CreateInvoiceDto,
    performedBy?: string,
    ipAddress?: string,
  ): Promise<InvoiceEntity> {
    // Sanitize amount fields to prevent precision issues
    if (invoice.totalBill !== undefined) {
      invoice.totalBill = sanitizeOptionalAmount(invoice.totalBill);
    }
    if (invoice.balance !== undefined) {
      invoice.balance = sanitizeOptionalAmount(invoice.balance);
    }

    const studentNumber = invoice.studentNumber || invoice.student?.studentNumber;
    const termNum = invoice.termNum || invoice.enrol?.num;
    const year = invoice.year || invoice.enrol?.year;

    if (!studentNumber) {
      throw new MissingRequiredFieldException('studentNumber', [
        'student entity',
      ]);
    }

    if (termNum === undefined || year === undefined) {
      throw new MissingRequiredFieldException('termNum and year', [
        'enrol entity',
      ]);
    }

    logStructured(
      this.logger,
      'log',
      'invoice.save.start',
      'Saving invoice',
      {
        studentNumber,
        termNumber: termNum,
        year,
        invoiceNumber: invoice.invoiceNumber,
        billsCount: invoice.bills?.length || 0,
      },
    );

    let isNewInvoice = false;
    const finalInvoice: InvoiceEntity = await this.dataSource.transaction(
      async (transactionalEntityManager: EntityManager) => {
        try {
          interface CreditAllocationData {
            studentCredit: StudentCreditEntity;
            amountApplied: number;
            relatedReceiptId?: number;
          }
          const creditAllocationsData: CreditAllocationData[] = [];

          const student =
            await this.studentsService.getStudentByStudentNumberWithExemption(
              studentNumber,
            );
          if (!student) {
            logStructured(
              this.logger,
              'error',
              'invoice.save.studentNotFound',
              'Student not found when saving invoice',
              {
                studentNumber,
                invoiceNumber: invoice.invoiceNumber,
              },
            );
            throw new StudentNotFoundException(
              studentNumber,
              'Cannot save invoice for a non-existent student.',
            );
          }

          let enrol = invoice.enrol;
          if (!enrol && termNum !== undefined && year !== undefined) {
            const enrolments =
              await this.enrolmentService.getEnrolmentsByStudent(
                studentNumber,
                student,
              );
            enrol = enrolments.find(
              (e) => e.num === termNum && e.year === year,
            );
            if (!enrol) {
              throw new EnrolmentNotFoundException(
                studentNumber,
                termNum,
                year,
              );
            }
          }

          if (!enrol) {
            throw new MissingRequiredFieldException('enrolment', [
              'termNum and year',
            ]);
          }

          // Reconcile student finances BEFORE saving invoice
          // This fixes any existing data integrity issues (overpayments, balance mismatches, etc.)
          // so that the new invoice can be saved correctly
          // Skip full reallocation (expensive) - only needed for manual reconciliation
          logStructured(
            this.logger,
            'log',
            'invoice.save.preReconciliation',
            'Reconciling student finances before saving invoice',
            { studentNumber },
          );
          await this.reconcileStudentFinances(
            student.studentNumber,
            transactionalEntityManager,
            undefined,
            { skipFullReallocation: true }, // Skip expensive reallocation during invoice saves
          );

          const studentExemption = student.exemption;
          let bills: BillsEntity[] = [];

          bills =
            invoice.bills && invoice.bills.length > 0
              ? (invoice.bills as BillsEntity[])
              : [];

          // Debug: Log the structure of bills received
          logStructured(
            this.logger,
            'log',
            'invoice.save.billsReceived',
            'Bills received from frontend',
            {
              billsCount: bills.length,
              bills: bills.map((b) => ({
                id: b.id,
                hasFees: !!b.fees,
                feeId: b.fees?.id,
                feeAmount: b.fees?.amount,
                billKeys: Object.keys(b || {}),
              })),
            },
          );

          // Validate that all bills have fees with amounts before calculating
          for (const bill of bills) {
            if (!bill.fees) {
              logStructured(
                this.logger,
                'error',
                'invoice.save.billMissingFees',
                'Bill is missing fees object',
                {
                  billId: bill.id,
                  invoiceNumber: invoice.invoiceNumber,
                  billKeys: Object.keys(bill || {}),
                  billStringified: JSON.stringify(bill),
                },
              );
              throw new MissingRequiredFieldException('bill.fees', [
                `Bill ${bill.id || 'unknown'} is missing fees object`,
              ]);
            }
            if (bill.fees.amount === undefined || bill.fees.amount === null) {
              logStructured(
                this.logger,
                'error',
                'invoice.save.billMissingFeeAmount',
                'Bill fees object is missing amount',
                {
                  billId: bill.id,
                  feeId: bill.fees.id,
                  invoiceNumber: invoice.invoiceNumber,
                },
              );
              throw new MissingRequiredFieldException('bill.fees.amount', [
                `Bill ${bill.id || 'unknown'} fees object is missing amount property`,
              ]);
            }
          }

          // NOTE: When grooming fees ARE included in an invoice, they apply to ALL students
          // regardless of exemption type. Grooming fees are never exempted and are always
          // charged in full. However, grooming fees are not automatically added - they should
          // only be included when explicitly added to the invoice by the user.

          const calculatedNetTotalBill = this.calculateNetBillAmount(
            bills,
            studentExemption,
          );

          // Check if this is an update (invoice already exists) or a new invoice
          // We need to know this BEFORE calculating existing invoices total to exclude the invoice being updated
          let foundInvoice: InvoiceEntity | null = null;
          if (invoice.id) {
            // If invoice has an ID, try to find it by ID
            foundInvoice = await transactionalEntityManager.findOne(
              InvoiceEntity,
              {
                where: { id: invoice.id },
                relations: ['student', 'enrol'],
              },
            );
          }
          
          // If not found by ID, try to find by invoiceNumber
          if (!foundInvoice && invoice.invoiceNumber) {
            foundInvoice = await transactionalEntityManager.findOne(
              InvoiceEntity,
              {
                where: { invoiceNumber: invoice.invoiceNumber },
                relations: ['student', 'enrol'],
              },
            );
          }

          // Find existing invoices for THIS SPECIFIC STUDENT and enrolment
          // Only count invoices for the same student, not all students in the term
          // IMPORTANT: Exclude the invoice being updated to avoid double-counting
          const existingInvoices = await transactionalEntityManager.find(
            InvoiceEntity,
            {
              where: {
                student: { studentNumber },
                enrol: { num: termNum, year: year },
                isVoided: false,
              },
            },
          );
          
          // Filter out the invoice being updated (if it exists) to avoid double-counting
          const invoicesToCount = foundInvoice
            ? existingInvoices.filter((inv) => inv.id !== foundInvoice!.id)
            : existingInvoices;
          
          // Ensure proper numeric conversion - handle both string and number types
          // TypeORM may return decimal values as strings, so we need explicit conversion
          const existingInvoicesTotal = invoicesToCount.reduce(
            (sum, inv) => {
              const totalBill = inv.totalBill;
              // Convert to number, handling both string and number types
              // Use parseFloat for strings to handle decimal values properly, and ensure it's a number
              let numericValue: number;
              if (typeof totalBill === 'string') {
                // Remove any non-numeric characters except decimal point and minus sign
                const cleaned = String(totalBill).replace(/[^0-9.-]/g, '');
                numericValue = parseFloat(cleaned) || 0;
              } else {
                numericValue = Number(totalBill) || 0;
              }
              
              // Debug logging to catch string concatenation issues
              if (isNaN(numericValue) || !isFinite(numericValue)) {
                this.logger.error(`Invalid totalBill value for invoice ${inv.invoiceNumber}: ${totalBill} (type: ${typeof totalBill}, raw: ${JSON.stringify(totalBill)})`);
                return sum; // Skip invalid values
              }
              
              // Ensure we're doing numeric addition, not string concatenation
              const newSum = Number(sum) + numericValue;
              if (isNaN(newSum) || !isFinite(newSum)) {
                this.logger.error(`Invalid sum calculation: sum=${sum}, numericValue=${numericValue}, result=${newSum}`);
                return sum; // Return previous sum if calculation fails
              }
              
              return newSum;
            },
            0,
          );

          // Debug logging to verify calculation
          this.logger.debug(`Invoice validation - Term: ${termNum}/${year}, Is update: ${!!foundInvoice}, Existing invoices count: ${invoicesToCount.length}, Existing total: ${existingInvoicesTotal}, New/Updated invoice: ${calculatedNetTotalBill}, Combined: ${existingInvoicesTotal + calculatedNetTotalBill}`);

          this.financialValidationService.validateMaximumInvoiceAmountPerTerm(
            calculatedNetTotalBill,
            termNum,
            year,
            existingInvoicesTotal,
          );

          let invoiceToSave: InvoiceEntity;
          
          // If we didn't find the invoice earlier, try the more comprehensive query
          // (This handles cases where invoice.id wasn't provided but invoiceNumber was)
          if (!foundInvoice) {
            foundInvoice = await transactionalEntityManager
              .createQueryBuilder(InvoiceEntity, 'invoice')
              .leftJoinAndSelect('invoice.student', 'student')
              .leftJoinAndSelect('invoice.enrol', 'enrol')
              .leftJoinAndSelect('invoice.balanceBfwd', 'balanceBfwd')
              .leftJoinAndSelect('invoice.bills', 'bills')
              .leftJoinAndSelect('bills.fees', 'fees')
              .leftJoinAndSelect('invoice.exemption', 'exemption')
              .where('student.studentNumber = :studentNumber', {
                studentNumber: student.studentNumber,
              })
              .andWhere('enrol.num = :num', { num: termNum })
              .andWhere('enrol.year = :year', { year: year })
              .andWhere('(invoice.isVoided = false OR invoice.isVoided IS NULL)')
              .getOne();
          } else {
            // If we found it earlier, we need to load the full relations
            foundInvoice = await transactionalEntityManager
              .createQueryBuilder(InvoiceEntity, 'invoice')
              .leftJoinAndSelect('invoice.student', 'student')
              .leftJoinAndSelect('invoice.enrol', 'enrol')
              .leftJoinAndSelect('invoice.balanceBfwd', 'balanceBfwd')
              .leftJoinAndSelect('invoice.bills', 'bills')
              .leftJoinAndSelect('bills.fees', 'fees')
              .leftJoinAndSelect('invoice.exemption', 'exemption')
              .where('invoice.id = :id', { id: foundInvoice.id })
              .getOne();
          }
          
          isNewInvoice = !foundInvoice;

          if (foundInvoice) {
            invoiceToSave = foundInvoice;

            invoiceToSave.totalBill = calculatedNetTotalBill;
            invoiceToSave.bills = bills;
            invoiceToSave.invoiceDate = invoice.invoiceDate
              ? new Date(invoice.invoiceDate)
              : new Date();
            invoiceToSave.invoiceDueDate = invoice.invoiceDueDate
              ? new Date(invoice.invoiceDueDate)
              : new Date();

            const balanceBfwdAmount = invoiceToSave.balanceBfwd
              ? Number(invoiceToSave.balanceBfwd.amount)
              : 0;

            if (balanceBfwdAmount > 0) {
              invoiceToSave.totalBill += balanceBfwdAmount;
            }

            // When updating an existing invoice, recalculate amountPaidOnInvoice from allocations
            // This prevents double-counting credits that might already be in the stored value
            // Credit should only be applied explicitly by the user or during reconciliation
            
            // Load receipt allocations
            const existingReceiptAllocations = await transactionalEntityManager.find(
              ReceiptInvoiceAllocationEntity,
              {
                where: { invoice: { id: invoiceToSave.id } },
              },
            );

            // Load credit allocations
            const existingCreditAllocations = await transactionalEntityManager.find(
              CreditInvoiceAllocationEntity,
              {
                where: { invoice: { id: invoiceToSave.id } },
                relations: ['studentCredit'],
              },
            );

            // Sum receipt allocations
            const receiptAllocationsTotal = existingReceiptAllocations.reduce(
              (sum, alloc) => sum + Number(alloc.amountApplied || 0),
              0,
            );

            // Sum credit allocations
            const creditAllocationsTotal = existingCreditAllocations.reduce(
              (sum, alloc) => sum + Number(alloc.amountApplied || 0),
              0,
            );

            // Recalculate amountPaidOnInvoice from allocations (not from stored value)
            // This ensures we don't double-count credits
            invoiceToSave.amountPaidOnInvoice = receiptAllocationsTotal + creditAllocationsTotal;
            this.updateInvoiceBalance(invoiceToSave, false);
            this.verifyInvoiceBalance(invoiceToSave);
            invoiceToSave.exemption = studentExemption || null;
            invoiceToSave.status = this.getInvoiceStatus(invoiceToSave);
          } else {
            invoiceToSave = new InvoiceEntity();
            invoiceToSave.student = student;
            invoiceToSave.enrol = enrol;
            invoiceToSave.bills = bills;
          // NEW INVOICE: always generate a fresh invoice number on the server
          // to avoid duplicate key violations on the unique invoiceNumber constraint.
          // We deliberately ignore any invoiceNumber coming from the client for new invoices.
          invoiceToSave.invoiceNumber = await this.generateInvoiceNumber();
            invoiceToSave.invoiceDate = invoice.invoiceDate
              ? new Date(invoice.invoiceDate)
              : new Date();
            invoiceToSave.invoiceDueDate = invoice.invoiceDueDate
              ? new Date(invoice.invoiceDueDate)
              : new Date();
            invoiceToSave.totalBill = calculatedNetTotalBill;
            invoiceToSave.amountPaidOnInvoice = 0;
            invoiceToSave.isVoided = false; // Explicitly set to false for new invoices

            await this.applyStudentCreditToInvoice(
              invoiceToSave,
              student.studentNumber,
              transactionalEntityManager,
              [],
              creditAllocationsData,
            );

            this.updateInvoiceBalance(invoiceToSave);
            this.verifyInvoiceBalance(invoiceToSave);
            invoiceToSave.exemption = studentExemption || null;
            invoiceToSave.status = this.getInvoiceStatus(invoiceToSave);
          }

          invoiceToSave.exemptedAmount = this._calculateExemptionAmount(
            invoiceToSave,
          );
          this.financialValidationService.validateInvoiceBeforeSave(
            invoiceToSave,
          );

          const saved = await transactionalEntityManager.save(invoiceToSave);
          
          // Reconcile finances AFTER saving invoice
          // This ensures all balances are correct, but does NOT auto-apply credit during invoice updates
          // Credit should only be applied explicitly by the user or during manual reconciliation
          logStructured(
            this.logger,
            'log',
            'invoice.save.postReconciliation',
            'Reconciling student finances after saving invoice',
            { studentNumber, invoiceId: saved.id, invoiceNumber: saved.invoiceNumber },
          );
          await this.reconcileStudentFinances(
            student.studentNumber,
            transactionalEntityManager,
            undefined,
            {
              skipAutoCreditApplication: true, // Don't auto-apply credit during invoice updates
              skipFullReallocation: true, // Skip expensive reallocation during invoice saves
            },
          );
          
          // Reload the invoice after reconciliation to get fresh data
          // Do NOT load creditAllocations yet - we insert them via raw SQL later; loading them here would let TypeORM UPDATE them (with null invoiceId) when we save the invoice
          const reloadedInvoice = await transactionalEntityManager.findOne(
            InvoiceEntity,
            {
              where: { id: saved.id },
              relations: [
                'student',
                'enrol',
                'balanceBfwd',
                'bills',
                'bills.fees',
                'exemption',
                'allocations',
              ],
            },
          );

          if (!reloadedInvoice) {
            logStructured(
              this.logger,
              'error',
              'invoice.save.reloadFailed',
              'Failed to reload invoice after reconciliation',
              { invoiceId: saved.id, invoiceNumber: saved.invoiceNumber },
            );
            throw new Error(
              `Failed to reload invoice ${saved.invoiceNumber} after reconciliation`,
            );
          }

          // Recalculate and update the balance using the same logic as reconciliation
          // This ensures consistency with how reconciliation handles overpayments
          await this.verifyAndRecalculateInvoiceBalance(
            reloadedInvoice,
            transactionalEntityManager,
          );
          
          // Reload one more time to ensure we have the saved balance (still no creditAllocations - avoid TypeORM touching them on save)
          const finalInvoice = await transactionalEntityManager.findOne(
            InvoiceEntity,
            {
              where: { id: reloadedInvoice.id },
              relations: [
                'student',
                'enrol',
                'balanceBfwd',
                'bills',
                'bills.fees',
                'exemption',
                'allocations',
              ],
            },
          );

          if (!finalInvoice) {
            logStructured(
              this.logger,
              'error',
              'invoice.save.finalReloadFailed',
              'Failed to reload invoice after balance update',
              { invoiceId: reloadedInvoice.id, invoiceNumber: reloadedInvoice.invoiceNumber },
            );
            throw new Error(
              `Failed to reload invoice ${reloadedInvoice.invoiceNumber} after balance update`,
            );
          }

          // Verify the balance on the final invoice
          // Note: verifyAndRecalculateInvoiceBalance already verified and corrected the balance,
          // but we verify again to ensure everything is consistent
          const calculated = this.calculateInvoiceBalance(finalInvoice);
          const actualBalance = Number(finalInvoice.balance || 0);
          const tolerance = 0.01;
          
          // Allow for overpayments: if calculated balance is negative but stored is 0,
          // that's acceptable (overpayment was corrected by reconciliation)
          const calculatedBalanceForComparison = Math.max(0, calculated.balance);
          
          if (Math.abs(calculatedBalanceForComparison - actualBalance) > tolerance) {
            logStructured(
              this.logger,
              'error',
              'invoice.balance.mismatch.afterReconciliation',
              'Invoice balance mismatch detected after reconciliation',
              {
                invoiceId: finalInvoice.id,
                invoiceNumber: finalInvoice.invoiceNumber,
                calculatedTotalBill: calculated.totalBill,
                calculatedAmountPaid: calculated.amountPaid,
                calculatedBalance: calculated.balance,
                calculatedBalanceForComparison,
                actualBalance,
                storedTotalBill: finalInvoice.totalBill,
                storedAmountPaidOnInvoice: finalInvoice.amountPaidOnInvoice,
              },
            );
            throw new InvoiceBalanceMismatchException(
              finalInvoice.invoiceNumber,
              calculatedBalanceForComparison,
              actualBalance,
            );
          }

          // Note: creditAllocationsData contains allocations created BEFORE invoice was saved
          // After reconciliation, credit may have already been applied, so we need to check
          // if these allocations are still needed or if they've been handled by reconciliation
          if (creditAllocationsData.length > 0) {
            // Use the final invoice ID (after reconciliation) to ensure we have the correct ID
            const invoiceIdToUse = finalInvoice.id;
            
            if (!invoiceIdToUse) {
              logStructured(
                this.logger,
                'error',
                'invoice.save.creditAllocation.noInvoiceId',
                'Cannot create credit allocations: invoice has no ID',
                {
                  invoiceNumber: finalInvoice.invoiceNumber,
                  studentNumber,
                },
              );
              throw new Error(
                `Cannot create credit allocations: invoice ${finalInvoice.invoiceNumber} has no ID`,
              );
            }

            // Check if credit allocations already exist for this invoice (from reconciliation)
            const existingAllocations = await transactionalEntityManager.find(
              CreditInvoiceAllocationEntity,
              {
                where: { invoice: { id: invoiceIdToUse } },
              },
            );

            const existingTotal = existingAllocations.reduce(
              (sum, alloc) => sum + Number(alloc.amountApplied || 0),
              0,
            );

            const newAllocationsTotal = creditAllocationsData.reduce(
              (sum, data) => sum + Number(data.amountApplied || 0),
              0,
            );

            // Only create allocations if they don't already exist or if amounts differ
            // Reconciliation may have already created these allocations
            if (existingTotal < newAllocationsTotal) {
              logStructured(
                this.logger,
                'log',
                'invoice.save.creditAllocation.creating',
                'Creating credit allocations from pre-save data',
                {
                  invoiceId: invoiceIdToUse,
                  invoiceNumber: finalInvoice.invoiceNumber,
                  existingTotal,
                  newAllocationsTotal,
                  allocationsCount: creditAllocationsData.length,
                },
              );

              // Load invoice so TypeORM persists invoiceId when saving allocations (avoids null FK)
              const invoiceRef = await transactionalEntityManager.findOne(
                InvoiceEntity,
                { where: { id: invoiceIdToUse } },
              );
              if (!invoiceRef) {
                throw new Error(
                  `Invoice ${invoiceIdToUse} not found when creating credit allocations`,
                );
              }

              // Resolve studentCreditId from DB so insert never has null (d.studentCredit.id can be undefined in some paths)
              const studentCreditRef = await transactionalEntityManager.findOne(
                StudentCreditEntity,
                { where: { studentNumber } },
              );
              const studentCreditIdToUse = studentCreditRef?.id != null ? Number(studentCreditRef.id) : null;

              if (studentCreditIdToUse == null) {
                // Student has no credit record (or it wasn't found) - skip allocation insert but still succeed
                // Invoice is already saved; we just don't persist the credit allocation rows
                logStructured(
                  this.logger,
                  'warn',
                  'invoice.save.creditAllocation.skippedNoStudentCredit',
                  'Skipping credit allocation insert (no student credit found) - invoice saved successfully',
                  { studentNumber, invoiceId: invoiceIdToUse, invoiceNumber: finalInvoice.invoiceNumber },
                );
              } else {
                // Raw INSERT: TypeORM InsertQueryBuilder can ignore relation join columns (studentCreditId, invoiceId), so use parameterized SQL
                const allocationDate = new Date();
                const invoiceIdVal = Number(invoiceRef.id);
                const cols = '"studentCreditId", "invoiceId", "amountApplied", "relatedReceiptId", "allocationDate"';
                const placeholders = creditAllocationsData.map(
                  (_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`,
                ).join(', ');
                const params = creditAllocationsData.flatMap((d) => [
                  studentCreditIdToUse,
                  invoiceIdVal,
                  d.amountApplied,
                  d.relatedReceiptId ?? null,
                  allocationDate,
                ]);
                await transactionalEntityManager.query(
                  `INSERT INTO credit_invoice_allocations (${cols}) VALUES ${placeholders}`,
                  params,
                );
              }
            } else {
              logStructured(
                this.logger,
                'log',
                'invoice.save.creditAllocation.skipped',
                'Skipping credit allocation creation - already handled by reconciliation',
                {
                  invoiceId: invoiceIdToUse,
                  invoiceNumber: finalInvoice.invoiceNumber,
                  existingTotal,
                  newAllocationsTotal,
                },
              );
            }
          }

          // Use the final invoice (after balance update) for logging and return
          // This ensures we have the most up-to-date data including any corrections made by reconciliation
          logStructured(
            this.logger,
            'log',
            'invoice.save.success',
            `${foundInvoice ? 'Updated' : 'Created'} invoice`,
            {
              invoiceId: finalInvoice.id,
              invoiceNumber: finalInvoice.invoiceNumber,
              studentNumber: finalInvoice.student.studentNumber,
              totalBill: finalInvoice.totalBill,
              amountPaidOnInvoice: finalInvoice.amountPaidOnInvoice,
              balance: finalInvoice.balance,
              status: finalInvoice.status,
              creditAllocationsCount: creditAllocationsData.length,
              isNewInvoice: !foundInvoice,
            },
          );

          // Update status based on final balance (finalInvoice was loaded without creditAllocations so save won't touch allocation rows)
          finalInvoice.status = this.getInvoiceStatus(finalInvoice);
          await transactionalEntityManager.save(InvoiceEntity, finalInvoice);

          // Audit logging - use final invoice data
          if (performedBy) {
            try {
              if (foundInvoice) {
                await this.auditService.logInvoiceUpdated(
                  finalInvoice.id,
                  performedBy,
                  {
                    invoiceNumber: finalInvoice.invoiceNumber,
                    totalBill: finalInvoice.totalBill,
                    amountPaidOnInvoice: finalInvoice.amountPaidOnInvoice,
                    balance: finalInvoice.balance,
                    status: finalInvoice.status,
                    creditAllocationsCount: creditAllocationsData.length,
                  },
                  ipAddress,
                  transactionalEntityManager,
                );
              } else {
                await this.auditService.logInvoiceCreated(
                  finalInvoice.id,
                  performedBy,
                  {
                    invoiceNumber: finalInvoice.invoiceNumber,
                    totalBill: finalInvoice.totalBill,
                    amountPaidOnInvoice: finalInvoice.amountPaidOnInvoice,
                    balance: finalInvoice.balance,
                    status: finalInvoice.status,
                    creditAllocationsCount: creditAllocationsData.length,
                  },
                  ipAddress,
                  transactionalEntityManager,
                );
              }
            } catch (auditError) {
              // Don't fail the main operation if audit logging fails
              logStructured(
                this.logger,
                'warn',
                'invoice.save.auditFailed',
                'Failed to log audit entry for invoice save',
                {
                  invoiceId: finalInvoice.id,
                  error:
                    auditError instanceof Error
                      ? auditError.message
                      : String(auditError),
                },
              );
            }
          }

          // Return the invoice with all relations (reload so creditAllocations from our raw INSERT are included)
          const invoiceToReturn = await transactionalEntityManager.findOne(
            InvoiceEntity,
            {
              where: { id: finalInvoice.id },
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
            },
          );
          return invoiceToReturn ?? finalInvoice;
        } catch (error) {
          logStructured(
            this.logger,
            'error',
            'invoice.save.failure',
            'Error saving invoice',
            {
              studentNumber,
              invoiceNumber: invoice.invoiceNumber,
              error: error instanceof Error ? error.message : String(error),
            },
          );
          throw error;
        }
      },
    );

    // Send email notification for newly created invoices (after transaction completes)
    if (isNewInvoice && finalInvoice) {
      this.sendInvoiceNotification(finalInvoice).catch((error) => {
        this.logger.error('Failed to send invoice notification:', error);
        // Don't throw - notifications are non-critical
      });
    }

    return finalInvoice;
  }

  /**
   * Send email notification for invoice
   */
  private async sendInvoiceNotification(
    invoice: InvoiceEntity,
  ): Promise<void> {
    try {
      const student = invoice.student;
      if (!student) return;

      // Get parent email - fetch student with parent relation
      let parentEmail: string | undefined;
      if (student.parent && student.parent.email) {
        parentEmail = student.parent.email;
      } else {
        // Parent relation not loaded, fetch it
        try {
          const studentRepo = this.invoiceRepository.manager.getRepository(StudentsEntity);
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

      await this.notificationService.sendInvoiceNotification({
        studentName: `${student.surname} ${student.name}`,
        studentNumber: student.studentNumber,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate || new Date(),
        totalAmount: Number(invoice.totalBill || 0),
        dueDate: invoice.invoiceDueDate || undefined,
        parentEmail,
        studentEmail: student.email,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send invoice notification for ${invoice.invoiceNumber}:`,
        error,
      );
    }
  }

  async voidInvoice(
    invoiceId: number,
    voidedByEmail: string,
    ipAddress?: string,
  ): Promise<InvoiceEntity> {
    logStructured(this.logger, 'log', 'invoice.void.start', 'Voiding invoice', {
      invoiceId,
      voidedByEmail,
    });

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
          logStructured(
            this.logger,
            'error',
            'invoice.void.notFound',
            'Invoice not found for voiding',
            {
              invoiceId,
              voidedByEmail,
            },
          );
          throw new InvoiceNotFoundException(invoiceId);
        }

        if (invoiceToVoid.isVoided) {
          logStructured(
            this.logger,
            'warn',
            'invoice.void.alreadyVoided',
            'Attempt to void already voided invoice',
            { invoiceId, voidedByEmail },
          );
          throw new InvoiceAlreadyVoidedException(
            invoiceId,
            invoiceToVoid.invoiceNumber,
          );
        }

        invoiceToVoid.isVoided = true;
        invoiceToVoid.voidedAt = new Date();
        invoiceToVoid.voidedBy = voidedByEmail;
        // Clear enrol relationship to allow new invoice to be created for same enrol
        // The one-to-one relationship constraint requires this
        invoiceToVoid.enrol = null;

        const allocationsToDelete: ReceiptInvoiceAllocationEntity[] = [];
        const receiptAmountsToCredit = new Map<string, number>();

        for (const allocation of invoiceToVoid.allocations) {
          const receipt = allocation.receipt;
          const amountApplied = Number(allocation.amountApplied);

          if (receipt && !receipt.isVoided) {
            allocationsToDelete.push(allocation);
            const studentNumber = receipt.student?.studentNumber;
            if (studentNumber) {
              const currentCredit =
                receiptAmountsToCredit.get(studentNumber) || 0;
              receiptAmountsToCredit.set(
                studentNumber,
                currentCredit + amountApplied,
              );
            }
          } else if (receipt && receipt.isVoided) {
            allocationsToDelete.push(allocation);
          }
        }

        for (const [studentNumber, creditAmount] of receiptAmountsToCredit) {
          await this.creditService.createOrUpdateStudentCredit(
            studentNumber,
            creditAmount,
            transactionalEntityManager,
            `Restored: Receipt allocation from voided Invoice ${invoiceToVoid.invoiceNumber}`,
            undefined,
            voidedByEmail,
          );
        }

        if (allocationsToDelete.length > 0) {
          await transactionalEntityManager.remove(allocationsToDelete);
        }

        const creditAllocationsReversed = await this.reverseCreditAllocations(
          invoiceToVoid,
          transactionalEntityManager,
          voidedByEmail,
        );

        invoiceToVoid.amountPaidOnInvoice = 0;
        this.updateInvoiceBalance(invoiceToVoid, false);
        invoiceToVoid.status = this.getInvoiceStatus(invoiceToVoid);

        await transactionalEntityManager.save(invoiceToVoid);
        this.verifyInvoiceBalance(invoiceToVoid);

        // Reconcile student finances after voiding to ensure all balances are correct
        // This verifies credit balances, applies credit to other invoices if needed, etc.
        // Skip full reallocation (expensive) - only needed for manual reconciliation
        const studentNumber = invoiceToVoid.student?.studentNumber;
        if (studentNumber) {
          await this.reconcileStudentFinances(
            studentNumber,
            transactionalEntityManager,
            undefined,
            { skipFullReallocation: true }, // Skip expensive reallocation during invoice void
          );
        }

        const totalReceiptAmountCredited = Array.from(
          receiptAmountsToCredit.values(),
        ).reduce((sum, amount) => sum + amount, 0);
        logStructured(
          this.logger,
          'log',
          'invoice.void.success',
          'Invoice voided successfully',
          {
            invoiceId,
            invoiceNumber: invoiceToVoid.invoiceNumber,
            receiptAllocationsReversed: allocationsToDelete.length,
            receiptAmountCredited: totalReceiptAmountCredited,
            creditAllocationsReversed,
            voidedBy: voidedByEmail,
            studentNumber,
          },
        );

        // Audit logging
        try {
          await this.auditService.logInvoiceVoided(
            invoiceToVoid.id,
            voidedByEmail,
            {
              invoiceNumber: invoiceToVoid.invoiceNumber,
              receiptAllocationsReversed: allocationsToDelete.length,
              receiptAmountCredited: totalReceiptAmountCredited,
              creditAllocationsReversed,
            },
            ipAddress,
            transactionalEntityManager,
          );
        } catch (auditError) {
          // Don't fail the main operation if audit logging fails
          logStructured(
            this.logger,
            'warn',
            'invoice.void.auditFailed',
            'Failed to log audit entry for invoice void',
            {
              invoiceId: invoiceToVoid.id,
              error:
                auditError instanceof Error
                  ? auditError.message
                  : String(auditError),
            },
          );
        }

        return invoiceToVoid;
      },
    );
  }

  async applyExemptionToExistingInvoices(studentNumber: string): Promise<void> {
    const student =
      await this.studentsService.getStudentByStudentNumberWithExemption(
        studentNumber,
      );

    if (!student) {
      return;
    }

    const studentExemption = student.exemption;

    const invoicesToUpdate = await this.invoiceRepository.find({
      where: { student: { studentNumber } },
      relations: ['bills', 'bills.fees', 'balanceBfwd'],
    });

    for (const invoice of invoicesToUpdate) {
      if (studentExemption) {
        invoice.exemption = studentExemption;
      }

      this.updateInvoiceBalance(invoice, true);
      invoice.status = this.getInvoiceStatus(invoice);
      this.verifyInvoiceBalance(invoice);

      await this.invoiceRepository.save(invoice);
    }
  }
  async getInvoice(
    studentNumber: string,
    num: number,
    year: number,
    includeVoided: boolean = false,
  ): Promise<InvoiceResponseDto> {
    const relations: (keyof InvoiceEntity | string)[] = [
      'student',
      'enrol',
      'balanceBfwd',
      'bills',
      'bills.fees',
      'exemption',
    ];

    const baseWhere = {
      student: { studentNumber },
      enrol: { num, year },
    };

    // 1. Always try to return the active invoice (isVoided = false OR null)
    // No ordering needed - student + term uniquely identifies one invoice
    // Query for non-voided invoices explicitly using query builder for better control
    const activeInvoice = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .leftJoinAndSelect('invoice.enrol', 'enrol')
      .leftJoinAndSelect('invoice.balanceBfwd', 'balanceBfwd')
      .leftJoinAndSelect('invoice.bills', 'bills')
      .leftJoinAndSelect('bills.fees', 'fees')
      .leftJoinAndSelect('invoice.exemption', 'exemption')
      .where('student.studentNumber = :studentNumber', { studentNumber })
      .andWhere('enrol.num = :num', { num })
      .andWhere('enrol.year = :year', { year })
      .andWhere('(invoice.isVoided = false OR invoice.isVoided IS NULL)')
      .getOne();

    if (activeInvoice) {
      logStructured(
        this.logger,
        'log',
        'invoice.getInvoice.existing',
        'Returning existing invoice for student/term',
        {
          studentNumber,
          termNumber: num,
          year,
          invoiceId: activeInvoice.id,
          invoiceNumber: activeInvoice.invoiceNumber,
          isVoided: activeInvoice.isVoided,
        },
      );
      
      // Check if there's a voided invoice to show warning
      // No ordering needed - student + term uniquely identifies one invoice
      const voidedInvoice = await this.invoiceRepository.findOne({
        where: { ...baseWhere, isVoided: true },
        select: ['id', 'invoiceNumber', 'voidedAt', 'voidedBy'],
      });
      
      const response: InvoiceResponseDto = {
        invoice: activeInvoice,
      };
      
      if (voidedInvoice) {
        response.warning = {
          message: `A voided invoice (${voidedInvoice.invoiceNumber}) exists for this student and term.`,
          voidedInvoiceNumber: voidedInvoice.invoiceNumber,
          voidedAt: voidedInvoice.voidedAt,
          voidedBy: voidedInvoice.voidedBy,
        };
      }
      
      return response;
    }

    // 2. Optionally return the voided invoice if explicitly requested
    // No ordering needed - student + term uniquely identifies one invoice
    if (includeVoided) {
      const voidedInvoice = await this.invoiceRepository.findOne({
        where: { ...baseWhere, isVoided: true },
        relations,
      });

      if (voidedInvoice) {
        logStructured(
          this.logger,
          'log',
          'invoice.getInvoice.voidedRequested',
          'Returning voided invoice because includeVoided=true',
          {
            studentNumber,
            termNumber: num,
            year,
            invoiceId: voidedInvoice.id,
            invoiceNumber: voidedInvoice.invoiceNumber,
          },
        );
        return {
          invoice: voidedInvoice,
        };
      }
    }

    logStructured(
      this.logger,
      'log',
      'invoice.getInvoice.generateNew',
      'No existing invoice found. Generating empty invoice skeleton.',
      { studentNumber, termNumber: num, year },
    );
    
    const emptyInvoice = await this.generateEmptyInvoice(studentNumber, num, year);
    
    // Check if there's a voided invoice to show warning
    // No ordering needed - student + term uniquely identifies one invoice
    const voidedInvoice = await this.invoiceRepository.findOne({
      where: { ...baseWhere, isVoided: true },
      select: ['id', 'invoiceNumber', 'voidedAt', 'voidedBy'],
    });
    
    const response: InvoiceResponseDto = {
      invoice: emptyInvoice,
    };
    
    if (voidedInvoice) {
      response.warning = {
        message: `A voided invoice (${voidedInvoice.invoiceNumber}) exists for this student and term. A new invoice has been generated.`,
        voidedInvoiceNumber: voidedInvoice.invoiceNumber,
        voidedAt: voidedInvoice.voidedAt,
        voidedBy: voidedInvoice.voidedBy,
      };
    }
    
    return response;
  }

  async getInvoiceByInvoiceNumber(invoiceNumber: string) {
    return this.invoiceRepository.findOne({
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

  async getTermInvoices(num: number, year: number): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      where: {
        enrol: { num, year },
        isVoided: false,
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

  async getTermInvoicesForAudit(
    num: number,
    year: number,
  ): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      where: { enrol: { num, year } },
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
      order: { invoiceDate: 'DESC' },
    });
  }

  async getAllInvoices(): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      where: { isVoided: false },
      relations: [
        'student',
        'enrol',
        'balanceBfwd',
        'bills',
        'bills.fees',
        'exemption',
        'allocations',
        'creditAllocations',
        'creditAllocations.invoice', // Explicitly load invoice relation on credit allocations
      ],
    });
  }

  async getAllInvoicesForAudit(): Promise<InvoiceEntity[]> {
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
      ],
      order: { invoiceDate: 'DESC' },
    });
  }

  async getStudentInvoices(studentNumber: string): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      where: {
        student: { studentNumber },
        isVoided: false,
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
        'creditAllocations.invoice', // Explicitly load invoice relation on credit allocations
      ],
    });
  }

  async getStudentInvoicesForAudit(
    studentNumber: string,
  ): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      where: { student: { studentNumber } },
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
      order: { invoiceDate: 'DESC' },
    });
  }

  async getInvoiceStats(
    num: number,
    year: number,
  ): Promise<InvoiceStatsModel[]> {
    const invoices = await this.invoiceRepository.find({
      where: { enrol: { num, year } },
      relations: ['student', 'enrol', 'balanceBfwd', 'bills', 'bills.fees'],
    });

    const totals = [
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

    const stats = totals.map((title) => {
      const stat = new InvoiceStatsModel();
      stat.title = title;
      stat.total = 0;
      stat.aLevel = 0;
      stat.oLevel = 0;
      return stat;
    });

    const addAmount = (title: string, amount: number, enrolName: string) => {
      const index = totals.indexOf(title);
      if (index < 0) {
        return;
      }
      stats[index].total += amount;
      if (enrolName.charAt(0) === '5' || enrolName.charAt(0) === '6') {
        stats[index].aLevel += amount;
      } else {
        stats[index].oLevel += amount;
      }
    };

    invoices.forEach((invoice) => {
      addAmount('amount', Number(invoice.totalBill), invoice.enrol.name);
      invoice.bills.forEach((bill) => {
        switch (bill.fees.name) {
          case FeesNames.aLevelApplicationFee:
            addAmount('application', Number(bill.fees.amount), '6');
            break;
          case FeesNames.oLevelApplicationFee:
            addAmount('application', Number(bill.fees.amount), '3');
            break;
          case FeesNames.developmentFee:
            addAmount('development', Number(bill.fees.amount), invoice.enrol.name);
            break;
          case FeesNames.deskFee:
            addAmount('desk', Number(bill.fees.amount), invoice.enrol.name);
            break;
          case FeesNames.alevelScienceFee:
            addAmount('science', Number(bill.fees.amount), '6');
            break;
          case FeesNames.oLevelScienceFee:
            addAmount('science', Number(bill.fees.amount), '3');
            break;
          case FeesNames.transportFee:
            addAmount('transport', Number(bill.fees.amount), invoice.enrol.name);
            break;
          case FeesNames.foodFee:
            addAmount('food', Number(bill.fees.amount), invoice.enrol.name);
            break;
          case FeesNames.aLevelTuitionBoarder:
          case FeesNames.aLevelTuitionDay:
            addAmount('tuition', Number(bill.fees.amount), '6');
            addAmount('boarders', Number(bill.fees.amount), '6');
            break;
          case FeesNames.oLevelTuitionBoarder:
          case FeesNames.oLevelTuitionDay:
            addAmount('tuition', Number(bill.fees.amount), '3');
            addAmount('dayScholars', Number(bill.fees.amount), '3');
            break;
        }
      });
    });

    return stats;
  }

  async generateInvoicePdf(invoiceData: InvoiceEntity): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const stream = new Stream.PassThrough();
    doc.pipe(stream);

    const primaryBlue = '#2196f3';
    const primaryBlueDark = '#1976d2';
    const textPrimary = '#2c3e50';
    const textSecondary = '#7f8c8d';
    const successGreen = '#4caf50';
    const warningOrange = '#ff9800';
    const errorRed = '#f44336';
    const accentGold = '#ffc107';

    let currentY = 50;

    const companyName = 'Junior High School';
    const companyAddress = '30588 Lundi Drive, Rhodene, Masvingo';
    const companyPhone = '+263 392 263 293 / +263 78 223 8026';
    const companyEmail = 'info@juniorhighschool.ac.zw';
    const companyWebsite = 'www.juniorhighschool.ac.zw';

    try {
      const imgPath = path.join(process.cwd(), 'public', 'jhs_logo.jpg');
      if (fs.existsSync(imgPath)) {
        doc.image(imgPath, 50, currentY, { width: 120, height: 120 });
      }
    } catch (e) {
      logStructured(this.logger, 'warn', 'invoice.pdf.logo', 'Error adding invoice logo', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    const logoWidth = 120;
    const textStartX = 50 + logoWidth + 15;
    const textWidth = doc.page.width - textStartX - 50;

    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor(primaryBlue)
      .text(companyName.toUpperCase(), textStartX, currentY, {
        align: 'left',
        width: textWidth,
      });

    currentY += 20;
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(textSecondary)
      .text(companyAddress, textStartX, currentY, {
        align: 'left',
        width: textWidth,
      });

    currentY += 16;
    doc.text(companyPhone, textStartX, currentY, {
      align: 'left',
      width: textWidth,
    });

    currentY += 16;
    doc.text(`${companyEmail} | ${companyWebsite}`, textStartX, currentY, {
      align: 'left',
      width: textWidth,
    });

    const logoBottom = 50 + 120;
    const textBottom = currentY + 12;
    const borderY = Math.max(logoBottom, textBottom);
    currentY = borderY + 15;

    doc
      .strokeColor(primaryBlue)
      .lineWidth(2)
      .moveTo(50, currentY)
      .lineTo(doc.page.width - 50, currentY)
      .stroke();

    currentY += 15;

    const titleBoxY = currentY;
    const titleBoxHeight = 58;

    doc
      .rect(50, titleBoxY, doc.page.width - 100, titleBoxHeight)
      .fillOpacity(0.08)
      .fill(primaryBlue)
      .fillOpacity(1.0);

    doc.rect(50, titleBoxY, 4, titleBoxHeight).fill(primaryBlue);

    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(textPrimary)
      .text('INVOICE', 70, titleBoxY + 8);

    doc
      .font('Helvetica')
      .fontSize(14)
      .fillColor(textSecondary)
      .text(
        `Term ${invoiceData.enrol.num} ${invoiceData.enrol.year}`,
        70,
        titleBoxY + 37,
      );

    const invoiceNumber = invoiceData.invoiceNumber || 'N/A';
    const invoiceDate = invoiceData.invoiceDate
      ? new Date(invoiceData.invoiceDate)
      : new Date();
    const dueDate = invoiceData.invoiceDueDate
      ? new Date(invoiceData.invoiceDueDate)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const metaX = doc.page.width / 2 + 40;
    let metaY = titleBoxY + 12;

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

    const infoSectionY = currentY;
    const columnWidth = (doc.page.width - 120) / 2;
    const leftColumnX = 50;
    const rightColumnX = leftColumnX + columnWidth + 20;

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(primaryBlue)
      .text('Bill To', leftColumnX, infoSectionY);

    doc
      .strokeColor(primaryBlue)
      .lineWidth(2)
      .moveTo(leftColumnX, infoSectionY + 18)
      .lineTo(leftColumnX + 150, infoSectionY + 18)
      .stroke();

    let billToY = infoSectionY + 30;

    const addBillToRow = (label: string, value: string | undefined) => {
      if (!value) {
        return;
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(textSecondary)
        .text(label, leftColumnX, billToY, { width: 120 })
        .font('Helvetica')
        .fontSize(10)
        .fillColor(textPrimary)
        .text(value, leftColumnX, billToY + 13, { width: columnWidth - 10 });
      billToY += 30;
    };

    addBillToRow(
      'Name',
      `${invoiceData.student.surname} ${invoiceData.student.name}`,
    );
    addBillToRow('Student Number', invoiceData.student.studentNumber || 'N/A');
    addBillToRow('Class', invoiceData.enrol.name || 'N/A');
    addBillToRow('Residence', invoiceData.enrol.residence || 'N/A');
    addBillToRow('Phone', invoiceData.student.cell);
    addBillToRow('Email', invoiceData.student.email);

    const billToEndY = billToY + 35;

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(primaryBlue)
      .text('Invoice Summary', rightColumnX, infoSectionY);

    doc
      .strokeColor(primaryBlue)
      .lineWidth(2)
      .moveTo(rightColumnX, infoSectionY + 18)
      .lineTo(rightColumnX + 150, infoSectionY + 18)
      .stroke();

    let summaryY = infoSectionY + 30;
    const summaryItemHeight = 24;

    const getStatusColor = (status: string): string => {
      const statusLower = status?.toLowerCase() || '';
      if (statusLower.includes('paid')) return successGreen;
      if (statusLower.includes('pending') || statusLower.includes('partially'))
        return warningOrange;
      if (statusLower.includes('overdue')) return errorRed;
      return textSecondary;
    };

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

      doc
        .rect(rightColumnX, itemY, columnWidth, 22)
        .fillOpacity(0.05)
        .fill(primaryBlue)
        .fillOpacity(1.0);

      doc.rect(rightColumnX, itemY, 3, 22).fill(primaryBlue);

      const labelWidth = 100;
      const valueWidth = columnWidth - labelWidth - 20;

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(textSecondary)
        .text(item.label, rightColumnX + 10, itemY + 6, {
          width: labelWidth,
        });

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

    currentY = Math.max(
      billToEndY,
      summaryY + summaryItems.length * summaryItemHeight,
    ) + 8;

    const tableStartX = 50;
    const tableStartY = currentY;

    const columnWidths = [390, 100];
    const headers = ['Description', 'Amount'];

    const items = [...(invoiceData.bills || [])];

    if (invoiceData.exemption) {
      const calculatedExemptionAmount =
        this._calculateExemptionAmount(invoiceData);

      if (calculatedExemptionAmount > 0) {
        const exemptionFees: FeesEntity = {
          id: 0,
          name: FeesNames.exemption,
          amount: -calculatedExemptionAmount,
          description: 'Exemption Discount',
          bills: [],
          exemptionType: invoiceData.exemption.type,
        };

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

    const tableEndY = this.drawTable(
      doc,
      items,
      invoiceData.balanceBfwd,
      tableStartX,
      tableStartY,
      columnWidths,
      headers,
      invoiceData.totalBill,
      primaryBlue,
      textPrimary,
      'right',
    );

    currentY = tableEndY + 10;

    const termsBoxY = currentY;
    const termsBoxHeight = 45;

    doc
      .rect(50, termsBoxY, doc.page.width - 100, termsBoxHeight)
      .fillOpacity(0.5)
      .fill('#fff3e0')
      .fillOpacity(1.0);

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

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(primaryBlue)
      .text('Banking Details', 50, currentY);

    doc
      .strokeColor(primaryBlue)
      .lineWidth(2)
      .moveTo(50, currentY + 16)
      .lineTo(200, currentY + 16)
      .stroke();

    currentY += 24;

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

  async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const lastInvoice = await this.invoiceRepository.findOne({
      where: { invoiceNumber: Like(`${prefix}%`) },
      order: { id: 'DESC' },
    });

    let sequence = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNumber.split('-');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          sequence = lastSeq + 1;
        }
      }
    }

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }

  private calculateNetBillAmount(
    bills: BillsEntity[],
    studentExemption: ExemptionEntity | null,
  ): number {
    let totalGrossBill = 0;
    let groomingFeeTotal = 0;
    let exemptableFeesTotal = 0;
    let totalExemptionAmount = 0;

    // Separate grooming fees from other fees
    // Grooming fees are never exempted and apply to all students
    for (const bill of bills) {
      // Ensure proper numeric conversion - handle both string and number types
      const amount = bill.fees.amount;
      const numericAmount = typeof amount === 'string' 
        ? parseFloat(amount) || 0 
        : Number(amount) || 0;
      
      totalGrossBill += numericAmount;
      
      // Separate grooming fees - they are not subject to exemptions
      if (bill.fees.name === FeesNames.groomingFee) {
        groomingFeeTotal += numericAmount;
      } else {
        exemptableFeesTotal += numericAmount;
      }
    }

    // Calculate exemptions only on non-grooming fees
    if (studentExemption && studentExemption.isActive) {
      if (studentExemption.type === ExemptionType.FIXED_AMOUNT) {
        // Fixed amount exemption applies to exemptable fees only
        // Cap it at the exemptable fees total to avoid negative amounts
        totalExemptionAmount = Math.min(
          studentExemption.fixedAmount || 0,
          exemptableFeesTotal
        );
      } else if (studentExemption.type === ExemptionType.PERCENTAGE) {
        // Percentage exemption applies only to exemptable fees
        totalExemptionAmount =
          (exemptableFeesTotal * (studentExemption.percentageAmount || 0)) / 100;
      } else if (studentExemption.type === ExemptionType.STAFF_SIBLING) {
        let foodFeeTotal = 0;
        let otherFeesTotal = 0;
        // Calculate food fee and other fees (excluding grooming fees)
        for (const bill of bills) {
          // Skip grooming fees in exemption calculation
          if (bill.fees.name === FeesNames.groomingFee) {
            continue;
          }
          
          // Ensure proper numeric conversion - handle both string and number types
          const amount = bill.fees.amount;
          const numericAmount = typeof amount === 'string' 
            ? parseFloat(amount) || 0 
            : Number(amount) || 0;
          if (bill.fees.name === FeesNames.foodFee) {
            foodFeeTotal += numericAmount;
          } else {
            otherFeesTotal += numericAmount;
          }
        }
        totalExemptionAmount = otherFeesTotal + foodFeeTotal * 0.5;
      }
    }

    // Net bill = (exemptable fees - exemption) + grooming fees (always full amount)
    const netExemptableFees = Math.max(0, exemptableFeesTotal - totalExemptionAmount);
    return netExemptableFees + groomingFeeTotal;
  }

  private updateInvoiceBalance(
    invoice: InvoiceEntity,
    recalculateTotalBill: boolean = true,
  ): void {
    const calculated = this.calculateInvoiceBalance(invoice);

    if (recalculateTotalBill) {
      invoice.totalBill = calculated.totalBill;
      invoice.amountPaidOnInvoice = calculated.amountPaid;
      invoice.balance = calculated.balance;
    } else {
      const totalBill = Number(invoice.totalBill);
      invoice.amountPaidOnInvoice = calculated.amountPaid;
      invoice.balance = totalBill - calculated.amountPaid;
    }
  }

  private calculateInvoiceBalance(
    invoice: InvoiceEntity,
  ): { totalBill: number; amountPaid: number; balance: number } {
    // Use the same logic as calculateNetBillAmount to ensure consistency
    // This correctly handles grooming fees being excluded from exemptions
    let totalBill: number;
    
    if (invoice.totalBill && Number(invoice.totalBill) > 0) {
      // Use stored totalBill if available (it's already calculated correctly)
      totalBill = Number(invoice.totalBill);
    } else if (invoice.bills && invoice.bills.length > 0) {
      // Recalculate using the same logic as calculateNetBillAmount
      // This ensures grooming fees are excluded from exemption calculations
      const studentExemption = invoice.exemption;
      totalBill = this.calculateNetBillAmount(invoice.bills, studentExemption);
      
      // Add balanceBfwd if present
      const balanceBfwdAmount = invoice.balanceBfwd
        ? Number(invoice.balanceBfwd.amount)
        : 0;
      totalBill += balanceBfwdAmount;
    } else {
      // No bills, use stored totalBill or 0
      totalBill = Number(invoice.totalBill || 0);
      const balanceBfwdAmount = invoice.balanceBfwd
        ? Number(invoice.balanceBfwd.amount)
        : 0;
      totalBill += balanceBfwdAmount;
    }

    let receiptAllocations = 0;
    let creditAllocations = 0;

    if (invoice.allocations && Array.isArray(invoice.allocations)) {
      receiptAllocations = invoice.allocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied || 0),
        0,
      );
    }

    if (invoice.creditAllocations && Array.isArray(invoice.creditAllocations)) {
      creditAllocations = invoice.creditAllocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied || 0),
        0,
      );
    }

    const amountPaid =
      receiptAllocations > 0 || creditAllocations > 0
        ? receiptAllocations + creditAllocations
        : Number(invoice.amountPaidOnInvoice || 0);

    const balance = totalBill - amountPaid;

    return { totalBill, amountPaid, balance };
  }

  private verifyInvoiceBalance(invoice: InvoiceEntity): void {
    const calculated = this.calculateInvoiceBalance(invoice);
    const actualBalance = Number(invoice.balance);
    const tolerance = 0.01;

    if (Math.abs(calculated.balance - actualBalance) > tolerance) {
      logStructured(
        this.logger,
        'error',
        'invoice.balance.mismatch',
        'Invoice balance mismatch detected',
        {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          calculatedTotalBill: calculated.totalBill,
          calculatedAmountPaid: calculated.amountPaid,
          calculatedBalance: calculated.balance,
          actualBalance,
          storedTotalBill: invoice.totalBill,
          storedAmountPaidOnInvoice: invoice.amountPaidOnInvoice,
        },
      );
      throw new InvoiceBalanceMismatchException(
        invoice.invoiceNumber,
        calculated.balance,
        actualBalance,
      );
    }
  }

  private verifyCreditAllocations(
    studentCredit: StudentCreditEntity,
    allocations: CreditInvoiceAllocationEntity[],
  ): void {
    const totalAllocated = allocations.reduce(
      (sum, allocation) => sum + Number(allocation.amountApplied),
      0,
    );
    const creditAmount = Number(studentCredit.amount);
    const tolerance = 1000;

    if (totalAllocated > creditAmount + tolerance) {
      logStructured(
        this.logger,
        'warn',
        'invoice.creditAllocation.exceedsCredit',
        'Credit allocations may exceed available credit',
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
   * Public method to reconcile student finances from outside transactions
   * Creates its own transaction and calls the internal reconciliation method
   * Returns detailed results of what was reconciled
   */
  async reconcileStudentFinancesForStudent(
    studentNumber: string,
  ): Promise<{
    success: boolean;
    message: string;
    studentNumber: string;
    summary: {
      invoicesProcessed: number;
      invoicesCorrected: number;
      receiptsProcessed: number;
      voidedInvoicesUnlinked: number;
      creditApplied: boolean;
      creditAmount?: number;
      creditAppliedToInvoice?: string;
      invoicesWithBalance: number;
      totalCreditBalance: number;
    };
    details?: {
      correctedInvoices?: Array<{
        invoiceNumber: string;
        overpaymentAmount: number;
        creditCreated: number;
      }>;
      creditApplication?: {
        invoiceNumber: string;
        amountApplied: number;
      };
    };
  }> {
    const result = {
      success: true,
      message: `Student finances reconciled successfully for ${studentNumber}`,
      studentNumber,
      summary: {
        invoicesProcessed: 0,
        invoicesCorrected: 0,
        receiptsProcessed: 0,
        voidedInvoicesUnlinked: 0,
        creditApplied: false,
        creditAmount: 0,
        creditAppliedToInvoice: undefined,
        invoicesWithBalance: 0,
        totalCreditBalance: 0,
      },
      details: {
        correctedInvoices: [] as Array<{
          invoiceNumber: string;
          overpaymentAmount: number;
          creditCreated: number;
        }>,
      },
    };

    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        await this.reconcileStudentFinances(
          studentNumber,
          transactionalEntityManager,
          result,
        );
        return result;
      },
    );
  }

  /**
   * Unified reconciliation method that:
   * 1. Unlinks enrols from voided invoices
   * 2. Full reallocation of receipts to invoices (deletes all allocations, reallocates from scratch)
   * 3. Corrects invoice overpayments (amountPaidOnInvoice > totalBill)
   * 4. Verifies and recalculates all invoice balances
   * 5. Verifies credit balance
   * 6. Applies credit to oldest invoice with balance if both exist
   * 7. Creates receipt allocations from credit allocations (for traceability)
   * 8. Verifies receipt allocations match invoice payments
   * 9. Final verification of all invoices
   * 
   * Note: Full reallocation (Step 2) runs FIRST to ensure a clean slate before other steps.
   * This prevents conflicts where earlier steps would be undone by reallocation.
   * 
   * Should be called before saving receipts and after saving invoices.
   * All verification steps are mandatory.
   * 
   * @param result - Optional result object to track reconciliation details
   */
  async reconcileStudentFinances(
    studentNumber: string,
    transactionalEntityManager: EntityManager,
    result?: {
      summary: {
        invoicesProcessed: number;
        invoicesCorrected: number;
        receiptsProcessed: number;
        voidedInvoicesUnlinked: number;
        creditApplied: boolean;
        creditAmount?: number;
        creditAppliedToInvoice?: string;
        invoicesWithBalance: number;
        totalCreditBalance: number;
      };
      details?: {
        correctedInvoices?: Array<{
          invoiceNumber: string;
          overpaymentAmount: number;
          creditCreated: number;
        }>;
        creditApplication?: {
          invoiceNumber: string;
          amountApplied: number;
        };
      };
    },
    options?: {
      skipAutoCreditApplication?: boolean; // If true, skip automatic credit application (e.g., during invoice updates)
      skipFullReallocation?: boolean; // If true, skip full reallocation (expensive operation, only needed for manual reconciliation)
    },
  ): Promise<void> {
    logStructured(
      this.logger,
      'log',
      'reconciliation.start',
      'Starting student finance reconciliation',
      { studentNumber },
    );

    // Step 1: Load all invoices and receipts
    const invoices = await transactionalEntityManager.find(InvoiceEntity, {
      where: { student: { studentNumber }, isVoided: false },
      relations: [
        'allocations',
        'creditAllocations',
        'bills',
        'bills.fees',
      ],
      order: { invoiceDate: 'ASC' }, // Oldest first for credit application
    });

    const receipts = await transactionalEntityManager.find(ReceiptEntity, {
      where: { student: { studentNumber }, isVoided: false },
      relations: ['allocations', 'allocations.invoice'],
    });

    // Track counts for result
    if (result) {
      result.summary.invoicesProcessed = invoices.length;
      result.summary.receiptsProcessed = receipts.length;
    }

    // Step 1.5: Unlink enrols from voided invoices to prevent constraint violations
    // This allows new invoices to be created for the same enrol
    const voidedInvoices = await transactionalEntityManager.find(
      InvoiceEntity,
      {
        where: { student: { studentNumber }, isVoided: true },
        relations: ['enrol'],
      },
    );

    let unlinkedCount = 0;
    for (const voidedInvoice of voidedInvoices) {
      if (voidedInvoice.enrol) {
        logStructured(
          this.logger,
          'log',
          'reconciliation.unlinkEnrolFromVoided',
          'Unlinking enrol from voided invoice',
          {
            invoiceId: voidedInvoice.id,
            invoiceNumber: voidedInvoice.invoiceNumber,
            enrolId: voidedInvoice.enrol.id,
            enrolName: voidedInvoice.enrol.name,
          },
        );
        voidedInvoice.enrol = null;
        await transactionalEntityManager.save(InvoiceEntity, voidedInvoice);
        unlinkedCount++;
      }
    }

    if (unlinkedCount > 0) {
      logStructured(
        this.logger,
        'log',
        'reconciliation.enrolsUnlinked',
        'Unlinked enrols from voided invoices',
        {
          studentNumber,
          unlinkedCount,
        },
      );
    }

    if (result) {
      result.summary.voidedInvoicesUnlinked = unlinkedCount;
    }

    // Step 2: Full reallocation of receipts to invoices based on dates
    // This MUST run FIRST to ensure a clean slate before other reconciliation steps
    // It fixes incorrect allocations caused by bugs (e.g., double-counting)
    // It reallocates from scratch based on payment dates and invoice dates
    // NOTE: This is an expensive operation - only run during manual reconciliation
    if (!options?.skipFullReallocation) {
      await this.reallocateReceiptsToInvoices(
        studentNumber,
        transactionalEntityManager,
      );
    } else {
      logStructured(
        this.logger,
        'log',
        'reconciliation.skipFullReallocation',
        'Skipping full reallocation (only runs during manual reconciliation)',
        { studentNumber },
      );
    }

    // Step 3: Correct invoice overpayments (after reallocation)
    // This handles any overpayments that may have been created during reallocation
    let correctedCount = 0;
    const invoicesAfterReallocation = await transactionalEntityManager.find(
      InvoiceEntity,
      {
        where: { student: { studentNumber }, isVoided: false },
        relations: [
          'allocations',
          'creditAllocations',
          'bills',
          'bills.fees',
        ],
        order: { invoiceDate: 'ASC' },
      },
    );

    for (const invoice of invoicesAfterReallocation) {
      const wasCorrected = await this.correctInvoiceOverpayment(
        invoice,
        studentNumber,
        transactionalEntityManager,
        result?.details?.correctedInvoices,
      );
      if (wasCorrected) {
        correctedCount++;
      }
    }

    if (result) {
      result.summary.invoicesCorrected = correctedCount;
    }

    // Reload invoices after corrections to get fresh data
    const correctedInvoices = await transactionalEntityManager.find(
      InvoiceEntity,
      {
        where: { student: { studentNumber }, isVoided: false },
        relations: [
          'allocations',
          'creditAllocations',
          'bills',
          'bills.fees',
        ],
        order: { invoiceDate: 'ASC' }, // Oldest first for credit application
      },
    );

    // Step 4: Verify and recalculate all invoice balances
    for (const invoice of correctedInvoices) {
      await this.verifyAndRecalculateInvoiceBalance(
        invoice,
        transactionalEntityManager,
      );
    }

    // Step 5: Verify credit balance
    await this.creditService.verifyStudentCreditBalance(
      studentNumber,
      transactionalEntityManager,
    );

    // Step 6: Apply credit to oldest invoice with balance if both exist
    // Skip this step if skipAutoCreditApplication is true (e.g., during invoice updates)
    if (!options?.skipAutoCreditApplication) {
      const studentCredit = await this.creditService.getStudentCredit(
        studentNumber,
        transactionalEntityManager,
      );

      if (studentCredit && Number(studentCredit.amount) > 0.01) {
        // Reload invoices one more time to get latest balances after recalculations
        const latestInvoices = await transactionalEntityManager.find(
          InvoiceEntity,
          {
            where: { student: { studentNumber }, isVoided: false },
            relations: [
              'allocations',
              'creditAllocations',
              'bills',
              'bills.fees',
            ],
            order: { invoiceDate: 'ASC' }, // Oldest first
          },
        );

        // Find oldest invoice with balance
        const invoiceWithBalance = latestInvoices.find(
          (inv) => Number(inv.balance || 0) > 0.01,
        );

        if (invoiceWithBalance) {
        logStructured(
          this.logger,
          'log',
          'reconciliation.applyCredit',
          'Applying credit to oldest invoice with balance',
          {
            studentNumber,
            creditAmount: studentCredit.amount,
            invoiceNumber: invoiceWithBalance.invoiceNumber,
            invoiceBalance: invoiceWithBalance.balance,
          },
        );

        // Create array to collect credit allocations
        const creditAllocationsToSave: CreditInvoiceAllocationEntity[] = [];

        await this.applyStudentCreditToInvoice(
          invoiceWithBalance,
          studentNumber,
          transactionalEntityManager,
          creditAllocationsToSave,
          undefined,
        );

        // Save all credit allocations
        if (creditAllocationsToSave.length > 0) {
          // Ensure all allocations have a loaded invoice reference so TypeORM persists invoiceId
          if (invoiceWithBalance.id) {
            const invoiceRef = await transactionalEntityManager.findOne(
              InvoiceEntity,
              { where: { id: invoiceWithBalance.id } },
            );
            if (!invoiceRef) {
              throw new Error(
                `Invoice ${invoiceWithBalance.invoiceNumber} (id ${invoiceWithBalance.id}) not found when saving credit allocations`,
              );
            }
            for (const allocation of creditAllocationsToSave) {
              allocation.invoice = invoiceRef;
            }
          } else {
            logStructured(
              this.logger,
              'error',
              'reconciliation.creditAllocation.missingInvoiceId',
              'Cannot save credit allocation: invoice has no ID',
              {
                invoiceNumber: invoiceWithBalance.invoiceNumber,
                studentNumber,
              },
            );
            throw new Error(
              `Cannot save credit allocation: invoice ${invoiceWithBalance.invoiceNumber} has no ID`,
            );
          }

          const totalCreditApplied = creditAllocationsToSave.reduce(
            (sum, alloc) => sum + Number(alloc.amountApplied || 0),
            0,
          );

          await transactionalEntityManager.save(
            CreditInvoiceAllocationEntity,
            creditAllocationsToSave,
          );
          logStructured(
            this.logger,
            'log',
            'reconciliation.creditAllocationsSaved',
            'Credit allocations saved',
            {
              studentNumber,
              invoiceNumber: invoiceWithBalance.invoiceNumber,
              allocationsCount: creditAllocationsToSave.length,
              totalAmount: totalCreditApplied,
            },
          );

          // Track credit application details
          if (result) {
            result.summary.creditApplied = true;
            result.summary.creditAmount = totalCreditApplied;
            result.summary.creditAppliedToInvoice = invoiceWithBalance.invoiceNumber;
            if (result.details) {
              result.details.creditApplication = {
                invoiceNumber: invoiceWithBalance.invoiceNumber,
                amountApplied: totalCreditApplied,
              };
            }
          }
        }

        // Reload invoice with fresh allocations after credit application
        const updatedInvoice = await transactionalEntityManager.findOne(
          InvoiceEntity,
          {
            where: { id: invoiceWithBalance.id },
            relations: ['allocations', 'creditAllocations'],
          },
        );

        if (updatedInvoice) {
          // Recalculate balance after credit application
          await this.verifyAndRecalculateInvoiceBalance(
            updatedInvoice,
            transactionalEntityManager,
          );
        }
      }
      }
    }

    // Step 7: Retroactively create receipt allocations from credit allocations
    // This ensures traceability when receipts were converted to credits and then applied to invoices
    // Note: After reallocation, this may not find many allocations since reallocation creates
    // receipt allocations directly. This step is mainly for legacy data or edge cases.
    await this.createReceiptAllocationsFromCredits(
      studentNumber,
      transactionalEntityManager,
    );

    // Step 8: Verify receipt allocations match invoice payments
    for (const receipt of receipts) {
      await this.verifyReceiptAllocations(
        receipt,
        transactionalEntityManager,
      );
    }

    // Step 9: Final verification - reload and verify all invoices are saved correctly
    // This ensures status is updated for all invoices after all corrections and credit applications
    const finalInvoices = await transactionalEntityManager.find(
      InvoiceEntity,
      {
        where: { student: { studentNumber }, isVoided: false },
        relations: ['allocations', 'creditAllocations'],
      },
    );

    // Final pass: Verify and update status for all invoices
    // This catches any invoices that might have incorrect status after all operations
    for (const invoice of finalInvoices) {
      await this.verifyAndRecalculateInvoiceBalance(
        invoice,
        transactionalEntityManager,
      );
    }

    // Reload one more time to get the final state after status updates
    const verifiedInvoices = await transactionalEntityManager.find(
      InvoiceEntity,
      {
        where: { student: { studentNumber }, isVoided: false },
        relations: ['allocations', 'creditAllocations'],
      },
    );

    const finalCredit = await this.creditService.getStudentCredit(
      studentNumber,
      transactionalEntityManager,
    );

    logStructured(
      this.logger,
      'log',
      'reconciliation.complete',
      'Student finance reconciliation completed',
      {
        studentNumber,
        invoicesCount: verifiedInvoices.length,
        invoicesWithBalance: verifiedInvoices.filter(
          (inv) => Number(inv.balance || 0) > 0.01,
        ).length,
        creditBalance: finalCredit ? Number(finalCredit.amount) : 0,
        receiptsCount: receipts.length,
      },
    );

    // Update final summary in result
    if (result) {
      result.summary.invoicesWithBalance = verifiedInvoices.filter(
        (inv) => Number(inv.balance || 0) > 0.01,
      ).length;
      result.summary.totalCreditBalance = finalCredit
        ? Number(finalCredit.amount)
        : 0;
    }
  }

  /**
   * Verifies and recalculates invoice balance based on allocations.
   * 
   * Key principles:
   * 1. totalBill already has exemptions applied (it's the net amount student owes)
   * 2. amountPaidOnInvoice never exceeds the totalBill amount
   * 3. balance = totalBill - amountPaidOnInvoice (what's still owed on THIS invoice)
   * 4. Overpayments (totalPaid > totalBill) are converted to credit, not counted as payment on invoice
   * 5. Balance cannot be negative (overpayments become credit instead)
   */
  private async verifyAndRecalculateInvoiceBalance(
    invoice: InvoiceEntity,
    transactionalEntityManager: EntityManager,
  ): Promise<void> {
    // Reload invoice with fresh allocations
    const freshInvoice = await transactionalEntityManager.findOne(
      InvoiceEntity,
      {
        where: { id: invoice.id },
        relations: ['allocations', 'creditAllocations'],
      },
    );

    if (!freshInvoice) {
      return;
    }

    const totalBill = Number(freshInvoice.totalBill || 0);
    const exemptedAmount = Number(freshInvoice.exemptedAmount || 0);
    // FIXED: totalBill already has exemption applied during invoice creation
    // Don't subtract exemption again - totalBill is already the net amount
    const netBill = totalBill;

    // Sum all receipt allocations
    const receiptAllocations = freshInvoice.allocations || [];
    const totalReceiptAllocated = receiptAllocations.reduce(
      (sum, alloc) => sum + Number(alloc.amountApplied || 0),
      0,
    );

    // Sum all credit allocations
    const creditAllocations = freshInvoice.creditAllocations || [];
    const totalCreditAllocated = creditAllocations.reduce(
      (sum, alloc) => sum + Number(alloc.amountApplied || 0),
      0,
    );

    // Total paid = receipt allocations + credit allocations
    const totalPaid = totalReceiptAllocated + totalCreditAllocated;
    
    // FIXED LOGIC: Amount paid on invoice should never exceed the net bill
    // If total paid exceeds net bill, the excess should be converted to credit (handled elsewhere)
    // The balance should reflect what's actually still owed on THIS invoice
    const amountPaidOnThisInvoice = Math.min(totalPaid, netBill);
    const remainingBalance = netBill - amountPaidOnThisInvoice;
    
    // Update invoice fields with corrected logic
    freshInvoice.amountPaidOnInvoice = amountPaidOnThisInvoice; // Never exceeds netBill
    freshInvoice.balance = Math.max(0, remainingBalance); // What's still owed on this invoice
    
    // Log the calculation for debugging
    logStructured(
      this.logger,
      'log',
      'reconciliation.balanceCalculation',
      'Invoice balance recalculated',
      {
        invoiceNumber: freshInvoice.invoiceNumber,
        totalBill, // Already net of exemptions
        exemptedAmount, // For reference
        netBill, // Same as totalBill (exemption already applied)
        totalReceiptAllocated,
        totalCreditAllocated,
        totalPaid,
        amountPaidOnThisInvoice,
        remainingBalance: freshInvoice.balance,
      },
    );
    
    // Update status based on the recalculated balance
    freshInvoice.status = this.getInvoiceStatus(freshInvoice);

    // Verify balance calculation is consistent
    const tolerance = 0.01;
    const expectedBalance = Math.max(0, netBill - amountPaidOnThisInvoice);
    const actualBalance = Number(freshInvoice.balance || 0);
    
    if (Math.abs(expectedBalance - actualBalance) > tolerance) {
      logStructured(
        this.logger,
        'warn',
        'reconciliation.invoiceBalanceMismatch',
        'Invoice balance calculation inconsistency detected',
        {
          invoiceNumber: freshInvoice.invoiceNumber,
          invoiceId: freshInvoice.id,
          expectedBalance,
          actualBalance,
          netBill,
          amountPaidOnThisInvoice,
          totalPaid,
        },
      );
    }

    await transactionalEntityManager.save(InvoiceEntity, freshInvoice);
  }

  /**
   * Retroactively creates receipt allocations from credit allocations.
   * This ensures traceability when receipts were converted to credits and then applied to invoices.
   * Only creates allocations if:
   * 1. Credit allocation has a relatedReceiptId
   * 2. The receipt exists and has no allocations
   * 3. The invoice exists
   */
  private async createReceiptAllocationsFromCredits(
    studentNumber: string,
    transactionalEntityManager: EntityManager,
  ): Promise<void> {
    // Find all credit allocations for this student that have a relatedReceiptId
    const creditAllocations = await transactionalEntityManager.find(
      CreditInvoiceAllocationEntity,
      {
        where: {
          invoice: { student: { studentNumber } },
        },
        relations: ['invoice', 'invoice.student'],
      },
    );

    const creditAllocationsWithReceiptId = creditAllocations.filter(
      (ca) => ca.relatedReceiptId,
    );

    if (creditAllocationsWithReceiptId.length === 0) {
      return; // No credit allocations with receipt IDs
    }

    // Group by receipt ID to avoid duplicate allocations
    const receiptAllocationsToCreate = new Map<
      number,
      {
        receiptId: number;
        invoiceId: number;
        amountApplied: number;
        allocationDate: Date;
      }
    >();

    for (const creditAlloc of creditAllocationsWithReceiptId) {
      if (!creditAlloc.relatedReceiptId || !creditAlloc.invoice?.id) {
        continue;
      }

      const receiptId = creditAlloc.relatedReceiptId;
      const invoiceId = creditAlloc.invoice.id;

      // Check if receipt allocation already exists
      const existingAllocation = await transactionalEntityManager.findOne(
        ReceiptInvoiceAllocationEntity,
        {
          where: {
            receipt: { id: receiptId },
            invoice: { id: invoiceId },
          },
        },
      );

      if (existingAllocation) {
        continue; // Allocation already exists
      }

      // Check if receipt exists and has no allocations
      const receipt = await transactionalEntityManager.findOne(
        ReceiptEntity,
        {
          where: { id: receiptId, student: { studentNumber } },
          relations: ['allocations'],
        },
      );

      if (!receipt || (receipt.allocations && receipt.allocations.length > 0)) {
        continue; // Receipt doesn't exist or already has allocations
      }

      // Use the credit allocation amount, but don't exceed the receipt amount
      const receiptAmount = Number(receipt.amountPaid || 0);
      const creditAmount = Number(creditAlloc.amountApplied || 0);
      const amountToAllocate = Math.min(creditAmount, receiptAmount);

      if (amountToAllocate <= 0.01) {
        continue;
      }

      // Use a composite key to group allocations
      const key = `${receiptId}-${invoiceId}`;
      const existing = receiptAllocationsToCreate.get(receiptId);

      if (existing) {
        // If multiple credit allocations from same receipt to same invoice, sum them
        existing.amountApplied += amountToAllocate;
      } else {
        receiptAllocationsToCreate.set(receiptId, {
          receiptId,
          invoiceId,
          amountApplied: amountToAllocate,
          allocationDate: creditAlloc.allocationDate || new Date(),
        });
      }
    }

    // Create receipt allocations
    if (receiptAllocationsToCreate.size > 0) {
      const allocationsToSave: ReceiptInvoiceAllocationEntity[] = [];

      for (const allocationData of receiptAllocationsToCreate.values()) {
        // Verify receipt amount isn't exceeded
        const receipt = await transactionalEntityManager.findOne(
          ReceiptEntity,
          {
            where: { id: allocationData.receiptId },
            relations: ['allocations'],
          },
        );

        if (!receipt) {
          continue;
        }

        const existingAllocationsTotal =
          (receipt.allocations || []).reduce(
            (sum, alloc) => sum + Number(alloc.amountApplied || 0),
            0,
          ) + allocationsToSave.reduce(
            (sum, alloc) =>
              sum +
              (alloc.receipt?.id === allocationData.receiptId
                ? Number(alloc.amountApplied || 0)
                : 0),
            0,
          );

        const availableAmount =
          Number(receipt.amountPaid || 0) - existingAllocationsTotal;

        if (availableAmount <= 0.01) {
          continue; // Receipt already fully allocated
        }

        const finalAmount = Math.min(
          allocationData.amountApplied,
          availableAmount,
        );

        if (finalAmount <= 0.01) {
          continue;
        }

        const allocation = transactionalEntityManager.create(
          ReceiptInvoiceAllocationEntity,
          {
            receipt: { id: allocationData.receiptId } as ReceiptEntity,
            invoice: { id: allocationData.invoiceId } as InvoiceEntity,
            amountApplied: finalAmount,
            allocationDate: allocationData.allocationDate,
          },
        );

        allocationsToSave.push(allocation);
      }

      if (allocationsToSave.length > 0) {
        await transactionalEntityManager.save(allocationsToSave);

        logStructured(
          this.logger,
          'log',
          'reconciliation.createReceiptAllocations',
          'Created receipt allocations from credit allocations',
          {
            studentNumber,
            allocationsCreated: allocationsToSave.length,
            totalAmount: allocationsToSave.reduce(
              (sum, alloc) => sum + Number(alloc.amountApplied || 0),
              0,
            ),
          },
        );

        // Update invoice amounts after creating allocations
        for (const allocation of allocationsToSave) {
          if (allocation.invoice?.id) {
            const invoice = await transactionalEntityManager.findOne(
              InvoiceEntity,
              {
                where: { id: allocation.invoice.id },
                relations: ['allocations'],
              },
            );

            if (invoice) {
              const totalAllocated = (invoice.allocations || []).reduce(
                (sum, alloc) => sum + Number(alloc.amountApplied || 0),
                0,
              );

              invoice.amountPaidOnInvoice = Math.min(
                totalAllocated,
                Number(invoice.totalBill || 0),
              );

              await transactionalEntityManager.save(invoice);
            }
          }
        }
      }
    }
  }

  /**
   * Full reallocation of receipts and credit to invoices based on dates.
   * This fixes incorrect allocations caused by bugs (e.g., double-counting).
   * 
   * Process:
   * 1. Delete ALL allocations (both receipt and credit allocations) for the student
   * 2. Reset all invoice amounts to zero
   * 3. Sort receipts by payment date (oldest first)
   * 4. Sort invoices by invoice date (oldest first)
   * 5. For each receipt, allocate to invoices that exist by that date (invoiceDate <= receipt.paymentDate)
   * 6. If receipt payment date is before any invoice exists, create credit for remaining amount
   * 7. If receipt exceeds all available invoice balances, create credit for excess
   * 8. Apply credit to invoices with remaining balances (oldest first)
   * 
   * Note: Credit is NOT restored when deleting allocations. Instead, credit will be
   * recreated correctly from receipts during reallocation if there are overpayments.
   * This ensures credit only comes from actual overpayments, not incorrect allocations.
   * 
   * This ensures proper chronological allocation and handles the case where payment
   * was made before invoice was created. Everything is recalculated from scratch.
   */
  private async reallocateReceiptsToInvoices(
    studentNumber: string,
    transactionalEntityManager: EntityManager,
  ): Promise<void> {
    logStructured(
      this.logger,
      'log',
      'reconciliation.reallocate.start',
      'Starting full reallocation of receipts and credit to invoices',
      { studentNumber },
    );

    // Step 1: Delete ALL allocations (both receipt and credit) for this student
    // We're doing a complete reset, so we can't trust any existing allocations
    const existingReceiptAllocations = await transactionalEntityManager.find(
      ReceiptInvoiceAllocationEntity,
      {
        where: {
          receipt: { student: { studentNumber } },
        },
        relations: ['receipt', 'invoice'],
      },
    );

    const existingCreditAllocations = await transactionalEntityManager.find(
      CreditInvoiceAllocationEntity,
      {
        where: {
          invoice: { student: { studentNumber } },
        },
        relations: ['invoice', 'studentCredit'],
      },
    );

    if (existingReceiptAllocations.length > 0 || existingCreditAllocations.length > 0) {
      logStructured(
        this.logger,
        'log',
        'reconciliation.reallocate.deleteAllocations',
        'Deleting all existing allocations for complete reallocation',
        {
          studentNumber,
          receiptAllocationsCount: existingReceiptAllocations.length,
          creditAllocationsCount: existingCreditAllocations.length,
        },
      );

      // Get all affected invoice IDs
      const affectedInvoiceIds = new Set<number>();
      
      existingReceiptAllocations.forEach((alloc) => {
        if (alloc.invoice?.id) {
          affectedInvoiceIds.add(alloc.invoice.id);
        }
      });

      existingCreditAllocations.forEach((alloc) => {
        if (alloc.invoice?.id) {
          affectedInvoiceIds.add(alloc.invoice.id);
        }
      });

      // Reset all affected invoices to zero payments
      for (const invoiceId of affectedInvoiceIds) {
        const invoice = await transactionalEntityManager.findOne(
          InvoiceEntity,
          {
            where: { id: invoiceId },
          },
        );

        if (invoice) {
          invoice.amountPaidOnInvoice = 0;
          invoice.balance = Number(invoice.totalBill || 0);
          invoice.status = this.getInvoiceStatus(invoice);

          await transactionalEntityManager.save(invoice);
        }
      }

      // Delete all receipt allocations
      if (existingReceiptAllocations.length > 0) {
        await transactionalEntityManager.remove(
          ReceiptInvoiceAllocationEntity,
          existingReceiptAllocations,
        );
      }

      // Delete all credit allocations
      if (existingCreditAllocations.length > 0) {
        await transactionalEntityManager.remove(
          CreditInvoiceAllocationEntity,
          existingCreditAllocations,
        );
      }

      // Note: We do NOT restore credit balance here
      // Credit will be recreated correctly from receipts during reallocation
      // If there are overpayments, credit will be created automatically
      // This ensures credit only comes from actual overpayments, not incorrect allocations
    }

    // Step 2: Load and sort receipts by payment date (oldest first)
    const receipts = await transactionalEntityManager.find(ReceiptEntity, {
      where: { student: { studentNumber }, isVoided: false },
      order: { paymentDate: 'ASC' },
    });

    if (receipts.length === 0) {
      // If there are no receipts, credit cannot exist (credit only comes from receipt overpayments)
      // Reset credit balance to 0 and delete all receipt credit records
      const studentCredit = await this.creditService.getStudentCredit(
        studentNumber,
        transactionalEntityManager,
      );

      if (studentCredit && Number(studentCredit.amount) > 0.01) {
        logStructured(
          this.logger,
          'warn',
          'reconciliation.reallocate.resetCreditNoReceipts',
          'Resetting credit balance to 0 - student has no receipts but has credit balance',
          {
            studentNumber,
            previousCreditBalance: studentCredit.amount,
          },
        );

        // Delete all receipt credit records (they shouldn't exist if there are no receipts)
        const receiptCredits = await transactionalEntityManager.find(
          ReceiptCreditEntity,
          {
            where: { studentCredit: { id: studentCredit.id } },
          },
        );

        if (receiptCredits.length > 0) {
          await transactionalEntityManager.remove(
            ReceiptCreditEntity,
            receiptCredits,
          );
        }

        // Reset credit balance to 0
        studentCredit.amount = 0;
        studentCredit.lastCreditSource = 'Reset: No receipts found during reallocation';
        await transactionalEntityManager.save(studentCredit);
      }

      logStructured(
        this.logger,
        'log',
        'reconciliation.reallocate.noReceipts',
        'No receipts to reallocate',
        { studentNumber },
      );
      return;
    }

    // Step 3: Reload and sort invoices by invoice date (oldest first)
    // Reload after deleting allocations to get fresh data
    const invoices = await transactionalEntityManager.find(InvoiceEntity, {
      where: { student: { studentNumber }, isVoided: false },
      relations: ['creditAllocations'],
      order: { invoiceDate: 'ASC' },
    });

    // Step 4: For each receipt, allocate to invoices that exist by that date
    const newAllocations: ReceiptInvoiceAllocationEntity[] = [];
    let totalCreditCreated = 0;

    for (const receipt of receipts) {
      const receiptDate = receipt.paymentDate || new Date();
      const receiptAmount = Number(receipt.amountPaid || 0);

      if (receiptAmount <= 0.01) {
        continue; // Skip zero or negative receipts
      }

      let remainingAmount = receiptAmount;

      // Find invoices that exist by the receipt's payment date
      // (invoiceDate <= receipt.paymentDate)
      const invoicesByDate = invoices.filter((invoice) => {
        const invoiceDate = invoice.invoiceDate || new Date();
        return invoiceDate <= receiptDate;
      });

      // Sort invoices by invoice date (oldest first) for allocation order
      invoicesByDate.sort((a, b) => {
        const dateA = a.invoiceDate || new Date();
        const dateB = b.invoiceDate || new Date();
        return dateA.getTime() - dateB.getTime();
      });

      // Allocate receipt to invoices in order until receipt is fully allocated
      for (const invoice of invoicesByDate) {
        if (remainingAmount <= 0.01) {
          break; // Receipt fully allocated
        }

        // Reload invoice to get fresh data (may have been updated by previous allocations)
        const freshInvoice = await transactionalEntityManager.findOne(
          InvoiceEntity,
          {
            where: { id: invoice.id },
            relations: ['allocations', 'creditAllocations'],
          },
        );

        if (!freshInvoice) {
          continue; // Invoice not found, skip
        }

        // Calculate current invoice balance
        // Sum receipt allocations (may have been added in this reallocation)
        const receiptAllocations = freshInvoice.allocations || [];
        const totalReceiptAllocated = receiptAllocations.reduce(
          (sum, alloc) => sum + Number(alloc.amountApplied || 0),
          0,
        );

        // Sum credit allocations
        const creditAllocations = freshInvoice.creditAllocations || [];
        const totalCreditAllocated = creditAllocations.reduce(
          (sum, alloc) => sum + Number(alloc.amountApplied || 0),
          0,
        );

        const totalPaid = totalReceiptAllocated + totalCreditAllocated;
        const invoiceBalance = Math.max(
          0,
          Number(freshInvoice.totalBill || 0) - totalPaid,
        );

        if (invoiceBalance <= 0.01) {
          continue; // Invoice already fully paid
        }

        // Allocate as much as possible to this invoice
        const amountToAllocate = Math.min(remainingAmount, invoiceBalance);

        if (amountToAllocate > 0.01) {
          const allocation = transactionalEntityManager.create(
            ReceiptInvoiceAllocationEntity,
            {
              receipt: { id: receipt.id } as ReceiptEntity,
              invoice: { id: freshInvoice.id } as InvoiceEntity,
              amountApplied: amountToAllocate,
              allocationDate: receiptDate,
            },
          );

          newAllocations.push(allocation);
          remainingAmount -= amountToAllocate;

          // Update invoice amounts
          freshInvoice.amountPaidOnInvoice = totalPaid + amountToAllocate;
          freshInvoice.balance = invoiceBalance - amountToAllocate;
          freshInvoice.status = this.getInvoiceStatus(freshInvoice);

          await transactionalEntityManager.save(freshInvoice);
        }
      }

      // Step 5: If receipt payment date is before any invoice exists, create credit
      // OR if there's remaining amount after allocating to all available invoices
      if (remainingAmount > 0.01) {
        // Check if payment was made before any invoice exists
        const hasInvoicesBeforeReceipt = invoices.some((invoice) => {
          const invoiceDate = invoice.invoiceDate || new Date();
          return invoiceDate <= receiptDate;
        });

        if (!hasInvoicesBeforeReceipt || remainingAmount > 0.01) {
          // Create credit for remaining amount
          // This handles:
          // 1. Payment made before any invoice exists
          // 2. Payment exceeds all available invoice balances
          logStructured(
            this.logger,
            'log',
            'reconciliation.reallocate.createCredit',
            'Creating credit for remaining receipt amount',
            {
              studentNumber,
              receiptNumber: receipt.receiptNumber,
              receiptId: receipt.id,
              remainingAmount,
              hasInvoicesBeforeReceipt,
            },
          );

          const studentCredit = await this.creditService.createOrUpdateStudentCredit(
            studentNumber,
            remainingAmount,
            transactionalEntityManager,
            `Credit from receipt ${receipt.receiptNumber} (payment before invoice or excess payment)`,
            receipt.id,
          );

          // Create ReceiptCreditEntity record to track which receipt created this credit
          // This is required for proper credit balance verification
          const receiptCredit = transactionalEntityManager.create(ReceiptCreditEntity, {
            receipt: receipt,
            studentCredit: studentCredit,
            creditAmount: remainingAmount,
            createdAt: receipt.paymentDate || new Date(),
          });
          await transactionalEntityManager.save(receiptCredit);

          totalCreditCreated += remainingAmount;
        }
      }
    }

    // Step 6: Apply credit to invoices with remaining balances (oldest first)
    // Now that receipts are allocated, apply any available credit to remaining balances
    // Reload credit to get current balance (may have been updated during receipt allocation)
    const studentCredit = await this.creditService.getStudentCredit(
      studentNumber,
      transactionalEntityManager,
    );

    if (studentCredit && Number(studentCredit.amount) > 0.01) {
      // Reload invoices to get fresh balances after receipt allocation
      const invoicesWithBalances = await transactionalEntityManager.find(
        InvoiceEntity,
        {
          where: { student: { studentNumber }, isVoided: false },
          relations: ['allocations', 'creditAllocations'],
          order: { invoiceDate: 'ASC' }, // Oldest first
        },
      );

      // Filter invoices with balances and ensure they have valid IDs
      // Must check for both existence and that it's a positive number
      const invoicesNeedingCredit = invoicesWithBalances.filter(
        (inv) => {
          const hasValidId = inv.id && typeof inv.id === 'number' && inv.id > 0;
          const hasBalance = Number(inv.balance || 0) > 0.01;
          return hasValidId && hasBalance;
        },
      );

      // Track remaining credit (will be updated as we apply it)
      let remainingCredit = Number(studentCredit.amount);

      for (const invoice of invoicesNeedingCredit) {
        if (remainingCredit <= 0.01) {
          break; // No more credit to apply
        }

        const invoiceBalance = Number(invoice.balance || 0);
        if (invoiceBalance <= 0.01) {
          continue; // Invoice already paid
        }

        const amountToApply = Math.min(remainingCredit, invoiceBalance);

        if (amountToApply > 0.01) {
          // Ensure invoice has a valid ID before creating credit allocation
          // Check for both null and undefined, and ensure it's a number
          const invoiceId = invoice.id;
          if (!invoiceId || typeof invoiceId !== 'number' || invoiceId <= 0) {
            logStructured(
              this.logger,
              'warn',
              'reconciliation.reallocate.skipCreditAllocation.invalidInvoiceId',
              'Skipping credit allocation - invoice has invalid ID',
              {
                studentNumber,
                invoiceNumber: invoice.invoiceNumber,
                invoiceId: invoiceId,
                invoiceIdType: typeof invoiceId,
                amountToApply,
              },
            );
            continue; // Skip this invoice if it has no valid ID
          }

          // Use loaded invoice so TypeORM persists invoiceId (avoids null FK)
          const creditAllocation = transactionalEntityManager.create(
            CreditInvoiceAllocationEntity,
            {
              studentCredit,
              invoice,
              amountApplied: amountToApply,
              allocationDate: new Date(),
            },
          );

          await transactionalEntityManager.save(creditAllocation);

          // Update invoice
          invoice.amountPaidOnInvoice =
            Number(invoice.amountPaidOnInvoice || 0) + amountToApply;
          invoice.balance = invoiceBalance - amountToApply;
          invoice.status = this.getInvoiceStatus(invoice);

          await transactionalEntityManager.save(invoice);

          // Deduct from credit balance using the credit service
          await this.creditService.deductStudentCredit(
            studentNumber,
            amountToApply,
            transactionalEntityManager,
            `Applied to Invoice ${invoice.invoiceNumber} during reallocation`,
            invoice.id,
            'system',
          );

          remainingCredit -= amountToApply;

          logStructured(
            this.logger,
            'log',
            'reconciliation.reallocate.applyCredit',
            'Applied credit to invoice during reallocation',
            {
              studentNumber,
              invoiceNumber: invoice.invoiceNumber,
              amountApplied: amountToApply,
              remainingCredit,
            },
          );
        }
      }
    }

    // Save all new allocations
    if (newAllocations.length > 0) {
      await transactionalEntityManager.save(
        ReceiptInvoiceAllocationEntity,
        newAllocations,
      );

      logStructured(
        this.logger,
        'log',
        'reconciliation.reallocate.complete',
        'Full reallocation completed',
        {
          studentNumber,
          receiptsProcessed: receipts.length,
          allocationsCreated: newAllocations.length,
          creditCreated: totalCreditCreated,
        },
      );
    } else {
      logStructured(
        this.logger,
        'log',
        'reconciliation.reallocate.noAllocations',
        'No new allocations created during reallocation',
        { studentNumber },
      );
    }
  }

  /**
   * Verifies receipt allocations are correct and fixes allocations with NULL invoiceId.
   */
  private async verifyReceiptAllocations(
    receipt: ReceiptEntity,
    transactionalEntityManager: EntityManager,
  ): Promise<void> {
    const freshReceipt = await transactionalEntityManager.findOne(
      ReceiptEntity,
      {
        where: { id: receipt.id },
        relations: ['allocations', 'allocations.invoice', 'student'],
      },
    );

    if (!freshReceipt || !freshReceipt.student) {
      return;
    }

    const receiptAmount = Number(freshReceipt.amountPaid || 0);
    const allocations = freshReceipt.allocations || [];
    const totalAllocated = allocations.reduce(
      (sum, alloc) => sum + Number(alloc.amountApplied || 0),
      0,
    );

    // Receipt allocations should not exceed receipt amount
    if (totalAllocated > receiptAmount + 0.01) {
      logStructured(
        this.logger,
        'warn',
        'reconciliation.receiptAllocationExceeds',
        'Receipt allocations exceed receipt amount',
        {
          receiptNumber: freshReceipt.receiptNumber,
          receiptId: freshReceipt.id,
          receiptAmount,
          totalAllocated,
        },
      );
    }

    // Fix allocations with NULL invoiceId
    const studentNumber = freshReceipt.student.studentNumber;
    for (const allocation of allocations) {
      // Check if invoiceId is NULL by querying the database directly
      const allocationWithFk = await transactionalEntityManager.query(
        `SELECT "invoiceId" FROM receipt_invoice_allocations WHERE id = $1`,
        [allocation.id],
      );

      const invoiceId = allocationWithFk?.[0]?.invoiceId;

      if (!invoiceId && allocation.amountApplied) {
        // Find the correct invoice for this allocation
        // Look for invoices for this student that match the allocation amount
        const studentInvoices = await transactionalEntityManager.find(
          InvoiceEntity,
          {
            where: {
              student: { studentNumber },
              isVoided: false,
            },
            relations: ['allocations'],
            order: { invoiceDueDate: 'ASC' },
          },
        );

        // Try to find an invoice that should have this allocation
        // Strategy: Find invoice where this allocation would make sense
        let matchedInvoice: InvoiceEntity | null = null;
        const allocationAmount = Number(allocation.amountApplied || 0);
        
        for (const invoice of studentInvoices) {
          const invoiceAllocations = invoice.allocations || [];
          
          // Method 1: Check if this invoice already has this allocation in its allocations array
          // (even if the FK is NULL, the relation might be loaded)
          const hasThisAllocation = invoiceAllocations.some(
            (a) => a.id === allocation.id,
          );

          if (hasThisAllocation) {
            // This invoice already has this allocation, just need to set the FK
            matchedInvoice = invoice;
            break;
          }

          // Method 2: Check if invoice has a balance that could be reduced by this allocation
          // This handles cases where the invoice wasn't updated when the allocation was created
          const invoiceBalance = Number(invoice.balance || 0);
          const invoiceTotalBill = Number(invoice.totalBill || 0);
          const invoiceAmountPaid = Number(invoice.amountPaidOnInvoice || 0);
          
          // If invoice has a balance and this allocation amount would reduce it appropriately
          if (invoiceBalance > 0.01 && allocationAmount > 0.01) {
            // Check if adding this allocation to amountPaid would make sense
            const newAmountPaid = invoiceAmountPaid + allocationAmount;
            const newBalance = invoiceTotalBill - newAmountPaid;
            
            // If the new balance is reasonable (not negative beyond rounding), this is likely the invoice
            if (newBalance >= -0.01 && newBalance <= invoiceBalance + 0.01) {
              matchedInvoice = invoice;
              break;
            }
          }
          
          // Method 3: If invoice has no allocations yet and has a balance, it's a candidate
          // (prefer oldest invoice first due to ordering)
          if (
            !matchedInvoice &&
            invoiceAllocations.length === 0 &&
            invoiceBalance > 0.01 &&
            allocationAmount <= invoiceBalance + 0.01
          ) {
            matchedInvoice = invoice;
            // Don't break - continue to see if we find a better match (one that already has this allocation)
          }
        }

        if (matchedInvoice) {
          // Update the allocation's invoiceId
          await transactionalEntityManager.query(
            `UPDATE receipt_invoice_allocations SET "invoiceId" = $1 WHERE id = $2`,
            [matchedInvoice.id, allocation.id],
          );

          // Also update the invoice's amountPaidOnInvoice and balance if needed
          // Reload the invoice to get fresh data
          const updatedInvoice = await transactionalEntityManager.findOne(
            InvoiceEntity,
            {
              where: { id: matchedInvoice.id },
              relations: ['allocations'],
            },
          );

          if (updatedInvoice) {
            // Recalculate amountPaidOnInvoice from allocations
            const totalAllocated = (updatedInvoice.allocations || []).reduce(
              (sum, alloc) => sum + Number(alloc.amountApplied || 0),
              0,
            );

            const invoiceTotalBill = Number(updatedInvoice.totalBill || 0);
            updatedInvoice.amountPaidOnInvoice = totalAllocated;
            updatedInvoice.balance = Math.max(
              0,
              invoiceTotalBill - totalAllocated,
            );
            updatedInvoice.status = this.getInvoiceStatus(updatedInvoice);

            await transactionalEntityManager.save(updatedInvoice);
          }

          logStructured(
            this.logger,
            'log',
            'reconciliation.fixedAllocationInvoiceId',
            'Fixed allocation with NULL invoiceId and updated invoice',
            {
              allocationId: allocation.id,
              receiptId: freshReceipt.id,
              receiptNumber: freshReceipt.receiptNumber,
              invoiceId: matchedInvoice.id,
              invoiceNumber: matchedInvoice.invoiceNumber,
              allocationAmount: allocation.amountApplied,
            },
          );
        } else {
          logStructured(
            this.logger,
            'warn',
            'reconciliation.cannotFixAllocation',
            'Cannot find invoice for allocation with NULL invoiceId',
            {
              allocationId: allocation.id,
              receiptId: freshReceipt.id,
              receiptNumber: freshReceipt.receiptNumber,
              allocationAmount: allocation.amountApplied,
            },
          );
        }
      }
    }
  }

  /**
   * Corrects invoice if amountPaidOnInvoice > totalBill (data integrity issue).
   * This can happen when an invoice is edited (totalBill reduced) after payments were made.
   * The correction:
   * 1. Recalculates amountPaidOnInvoice from actual allocations (not from stored value)
   * 2. If recalculated amountPaidOnInvoice > totalBill, creates credit for the overpayment
   * 3. Sets balance = 0 (invoice is fully paid, with overpayment converted to credit)
   * 4. Saves the corrected invoice
   * 
   * Note: We don't modify allocations here - they represent actual payments.
   * The overpayment is converted to credit, which can then be applied to other invoices.
   * 
   * @returns true if invoice was corrected, false otherwise
   */
  private async correctInvoiceOverpayment(
    invoice: InvoiceEntity,
    studentNumber: string,
    transactionalEntityManager: EntityManager,
    correctedInvoicesList?: Array<{
      invoiceNumber: string;
      overpaymentAmount: number;
      creditCreated: number;
    }>,
  ): Promise<boolean> {
    // Reload invoice with fresh allocations to get accurate payment data
    const freshInvoice = await transactionalEntityManager.findOne(
      InvoiceEntity,
      {
        where: { id: invoice.id },
        relations: ['allocations', 'creditAllocations'],
      },
    );

    if (!freshInvoice) {
      return false;
    }

    const totalBill = Number(freshInvoice.totalBill || 0);
    const exemptedAmount = Number(freshInvoice.exemptedAmount || 0);
    const netBill = totalBill - exemptedAmount; // Net amount due after exemptions
    
    // Calculate actual amount paid from allocations (not from stored amountPaidOnInvoice)
    const receiptAllocations = freshInvoice.allocations || [];
    const creditAllocations = freshInvoice.creditAllocations || [];
    const totalReceiptAllocated = receiptAllocations.reduce(
      (sum, alloc) => sum + Number(alloc.amountApplied || 0),
      0,
    );
    const totalCreditAllocated = creditAllocations.reduce(
      (sum, alloc) => sum + Number(alloc.amountApplied || 0),
      0,
    );
    const actualAmountPaid = totalReceiptAllocated + totalCreditAllocated;
    
    // Overpayment is when actual amount paid exceeds the net bill (after exemptions)
    const overpayment = actualAmountPaid - netBill;

    if (overpayment <= 0.01) {
      return false; // No correction needed
    }

    logStructured(
      this.logger,
      'warn',
      'invoice.correctOverpayment',
      'Correcting invoice with overpayment detected',
      {
        invoiceNumber: freshInvoice.invoiceNumber,
        invoiceId: freshInvoice.id,
        studentNumber,
        totalBill,
        exemptedAmount,
        netBill,
        actualAmountPaid,
        storedAmountPaid: Number(freshInvoice.amountPaidOnInvoice || 0),
        overpayment,
        receiptAllocationsCount: receiptAllocations.length,
        creditAllocationsCount: creditAllocations.length,
      },
    );

    // Step 1: Update amountPaidOnInvoice to reflect what was actually paid towards the invoice
    // For overpayments, amountPaidOnInvoice should equal totalBill (not the overpayment amount)
    // The overpayment (actualAmountPaid - totalBill) will be converted to credit
    freshInvoice.amountPaidOnInvoice = netBill; // Cap at netBill (what the invoice is worth)
    freshInvoice.balance = 0; // Invoice is fully paid (overpayment becomes credit)

    // Step 2: Create credit for the overpayment amount
    // This represents the excess payment that should be available as credit
    await this.creditService.createOrUpdateStudentCredit(
      studentNumber,
      overpayment,
      transactionalEntityManager,
      `Overpayment correction from Invoice ${freshInvoice.invoiceNumber}`,
      undefined,
    );

    // Step 3: Save the corrected invoice
    await transactionalEntityManager.save(InvoiceEntity, freshInvoice);

    logStructured(
      this.logger,
      'log',
      'invoice.overpaymentCorrected',
      'Invoice overpayment corrected',
      {
        invoiceNumber: freshInvoice.invoiceNumber,
        invoiceId: freshInvoice.id,
        studentNumber,
        correctedAmountPaid: actualAmountPaid,
        creditCreated: overpayment,
      },
    );

    // Track correction details
    if (correctedInvoicesList) {
      correctedInvoicesList.push({
        invoiceNumber: freshInvoice.invoiceNumber,
        overpaymentAmount: overpayment,
        creditCreated: overpayment,
      });
    }

    return true;
  }

  private async applyStudentCreditToInvoice(
    invoice: InvoiceEntity,
    studentNumber: string,
    transactionalEntityManager: EntityManager,
    creditAllocationsToSave: CreditInvoiceAllocationEntity[],
    creditAllocationsData?: Array<{
      studentCredit: StudentCreditEntity;
      amountApplied: number;
      relatedReceiptId?: number;
    }>,
  ): Promise<number> {
    const studentCredit = await this.creditService.getStudentCredit(
      studentNumber,
      transactionalEntityManager,
    );

    if (!studentCredit || Number(studentCredit.amount) <= 0.01) {
      return 0;
    }

    const currentOutstanding =
      Number(invoice.totalBill) - Number(invoice.amountPaidOnInvoice || 0);
    const amountToApply = Math.min(
      currentOutstanding,
      Number(studentCredit.amount),
    );

    if (amountToApply <= 0.01) {
      return 0;
    }

    const relatedReceiptId = await this.creditService.determineReceiptSourceForCredit(
      studentCredit,
      amountToApply,
      transactionalEntityManager,
    );

    await this.creditService.deductStudentCredit(
      studentNumber,
      amountToApply,
      transactionalEntityManager,
      `Applied to Invoice ${invoice.invoiceNumber}`,
      invoice.id || undefined,
      'system',
    );

    if (invoice.id) {
      // Load invoice so TypeORM persists invoiceId (avoids null FK in credit_invoice_allocations)
      const invoiceRef = await transactionalEntityManager.findOne(
        InvoiceEntity,
        { where: { id: invoice.id } },
      );
      if (!invoiceRef) {
        this.logger.warn(
          `Invoice ${invoice.id} not found when applying credit, skipping allocation`,
        );
        return 0;
      }
      const creditAllocation = transactionalEntityManager.create(
        CreditInvoiceAllocationEntity,
        {
          studentCredit,
          invoice: invoiceRef,
          amountApplied: amountToApply,
          relatedReceiptId: relatedReceiptId || undefined,
          allocationDate: new Date(),
        },
      );
      creditAllocationsToSave.push(creditAllocation);
    } else if (creditAllocationsData) {
      creditAllocationsData.push({
        studentCredit,
        amountApplied: amountToApply,
        relatedReceiptId: relatedReceiptId || undefined,
      });
    }

    invoice.amountPaidOnInvoice =
      Number(invoice.amountPaidOnInvoice || 0) + amountToApply;

    this.logger.debug(
      `Applied credit ${amountToApply} to invoice ${invoice.invoiceNumber} for student ${studentNumber}`,
      {
        studentNumber,
        invoiceNumber: invoice.invoiceNumber,
        amountApplied: amountToApply,
        remainingCredit: Number(studentCredit.amount) - amountToApply,
      },
    );

    return amountToApply;
  }

  private async reverseCreditAllocations(
    invoice: InvoiceEntity,
    transactionalEntityManager: EntityManager,
    voidedByEmail: string,
  ): Promise<number> {
    const creditAllocations = invoice.creditAllocations || [];

    if (creditAllocations.length === 0) {
      return 0;
    }

    const studentCreditsToUpdate = new Map<number, StudentCreditEntity>();
    const allocationsByCredit = new Map<
      number,
      CreditInvoiceAllocationEntity[]
    >();

    for (const allocation of creditAllocations) {
      const studentCredit = allocation.studentCredit;
      if (!studentCredit) {
        logStructured(
          this.logger,
          'warn',
          'invoice.creditAllocation.missingStudentCredit',
          'Credit allocation missing student credit, skipping',
          { allocationId: allocation.id, invoiceId: invoice.id },
        );
        continue;
      }

      const creditId = studentCredit.id;
      if (!allocationsByCredit.has(creditId)) {
        allocationsByCredit.set(creditId, []);
      }
      allocationsByCredit.get(creditId)!.push(allocation);
    }

    for (const [creditId, allocations] of allocationsByCredit.entries()) {
      const managedCredit = await transactionalEntityManager.findOne(
        StudentCreditEntity,
        { where: { id: creditId } },
      );

      if (!managedCredit) {
        logStructured(
          this.logger,
          'warn',
          'invoice.creditAllocation.missingCredit',
          'Student credit not found while restoring allocations',
          { creditId, invoiceId: invoice.id },
        );
        continue;
      }

      const totalAmountToRestore = allocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied || 0),
        0,
      );

      if (totalAmountToRestore <= 0.01) {
        continue;
      }

      managedCredit.amount =
        Number(managedCredit.amount) + totalAmountToRestore;
      managedCredit.lastCreditSource = `Restored: Credit from voided Invoice ${invoice.invoiceNumber}`;

      studentCreditsToUpdate.set(creditId, managedCredit);

      for (const allocation of allocations) {
        const amountApplied = Number(allocation.amountApplied || 0);
        if (amountApplied > 0.01) {
          await transactionalEntityManager.save(CreditTransactionEntity, {
            studentCredit: managedCredit,
            amount: amountApplied,
            transactionType: CreditTransactionType.REVERSAL,
            source: `Restored: Credit from voided Invoice ${invoice.invoiceNumber}`,
            relatedInvoiceId: invoice.id,
            performedBy: voidedByEmail,
            transactionDate: new Date(),
          });
        }
      }
    }

    if (studentCreditsToUpdate.size > 0) {
      await transactionalEntityManager.save(
        Array.from(studentCreditsToUpdate.values()),
      );
    }

    if (creditAllocations.length > 0) {
      await transactionalEntityManager.remove(creditAllocations);
    }

    return creditAllocations.length;
  }

  private _getGrossBillAmount(bills: BillsEntity[]): number {
    return bills.reduce((sum, bill) => sum + (+bill.fees?.amount || 0), 0);
  }

  /**
   * Get gross bill amount excluding grooming fees
   * Grooming fees are never exempted
   */
  private _getGrossBillAmountExcludingGrooming(bills: BillsEntity[]): number {
    return bills.reduce((sum, bill) => {
      // Exclude grooming fees from exemption calculations
      if (bill.fees?.name === FeesNames.groomingFee) {
        return sum;
      }
      return sum + (+bill.fees?.amount || 0);
    }, 0);
  }

  private _calculateExemptionAmount(invoiceData: InvoiceEntity): number {
    if (!invoiceData.exemption || !invoiceData.exemption.type) {
      return 0;
    }

    const exemption = invoiceData.exemption;
    let calculatedAmount = 0;

    switch (exemption.type) {
      case ExemptionType.FIXED_AMOUNT: {
        // Fixed amount exemption applies to exemptable fees only
        // Cap it at the exemptable fees total to avoid negative amounts
        const exemptableFeesTotal = this._getGrossBillAmountExcludingGrooming(invoiceData.bills);
        calculatedAmount = Math.min(
          Number(exemption.fixedAmount || 0),
          exemptableFeesTotal
        );
        break;
      }
      case ExemptionType.PERCENTAGE: {
        // Percentage exemption applies only to exemptable fees (excluding grooming)
        const exemptableFeesTotal = this._getGrossBillAmountExcludingGrooming(invoiceData.bills);
        calculatedAmount =
          (exemptableFeesTotal * Number(exemption.percentageAmount || 0)) / 100;
        break;
      }
      case ExemptionType.STAFF_SIBLING: {
        let totalFoodFee = 0;
        let totalOtherFees = 0;

        invoiceData.bills.forEach((bill) => {
          // Skip grooming fees in exemption calculation
          if (bill.fees?.name === FeesNames.groomingFee) {
            return;
          }
          
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
      }
      default:
        calculatedAmount = 0;
    }
    return calculatedAmount;
  }

  private drawTable(
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

    const totalWidth = columnWidths.reduce((a, b) => a + b, 0);

    doc.rect(startX, y, totalWidth, headerHeight).fill(headerColor);

    doc.font(boldFont).fontSize(headerFontSize);
    headers.forEach((header, i) => {
      const columnX = startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);

      doc
        .fillColor('#ffffff')
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

    doc.fillColor(textColor);
    y += headerHeight;

    if (balanceBfwd && balanceBfwd.amount > 0) {
      const totalRowWidth = columnWidths.reduce((a, b) => a + b, 0);

      doc
        .rect(startX, y, totalRowWidth, rowHeight)
        .fillOpacity(0.05)
        .fill('#ff9800')
        .fillOpacity(1.0);
      doc.rect(startX, y, 3, rowHeight).fill('#ff9800');

      doc.font(font).fontSize(fontSize).fillColor(textColor);

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

      doc
        .font(font)
        .fontSize(fontSize)
        .fillColor(textColor)
        .text(this.formatCurrency(balanceBfwd.amount), startX + columnWidths[0] + padding, y + rowHeight / 2 - fontSize / 2, {
          width: columnWidths[1] - 2 * padding,
          align: amountAlign,
        });

      doc
        .strokeColor(borderColor)
        .lineWidth(1)
        .moveTo(startX, y + rowHeight)
        .lineTo(startX + totalRowWidth, y + rowHeight)
        .stroke();

      y += rowHeight;
    }

    doc.font(font).fontSize(fontSize).fillColor(textColor);

    data.forEach((row) => {
      const isExemption = row.fees && row.fees.name === FeesNames.exemption;
      const totalRowWidth = columnWidths.reduce((a, b) => a + b, 0);

      if (isExemption) {
        doc
          .rect(startX, y, totalRowWidth, rowHeight)
          .fillOpacity(0.05)
          .fill('#4caf50')
          .fillOpacity(1.0);
        doc.rect(startX, y, 3, rowHeight).fill('#4caf50');
      }

      headers.forEach((header, i) => {
        let text = '';
        let align: 'left' | 'right' = 'left';
        let rowTextColor = textColor;

        if (i === 0) {
          if (isExemption && row.fees?.exemptionType) {
            text = 'Exemption';
            const exemptionDesc = `(${row.fees.exemptionType.replace(/_/g, ' ')}${
              row.fees.description ? `: ${row.fees.description}` : ''
            })`;
            doc
              .fontSize(9)
              .fillColor('#7f8c8d')
              .font('Helvetica-Oblique')
              .text(exemptionDesc, startX + padding, y + 18, {
                width: columnWidths[0] - 2 * padding,
                align: 'left',
              });
          } else if (row.fees?.name !== undefined && row.fees?.name !== null) {
            text = this.feesNamesToString(row.fees.name);
          }
        } else if (i === 1) {
          if (isExemption) {
            const amount = Number(row.fees?.amount);
            text = `-${this.formatCurrency(Math.abs(amount))}`;
            rowTextColor = '#4caf50';
          } else if (row.fees && row.fees.amount !== undefined) {
            text = this.formatCurrency(row.fees.amount);
          }
          align = amountAlign;
        }

        doc.fillColor(rowTextColor);

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
              align,
            });
        }
      });

      doc
        .strokeColor(borderColor)
        .lineWidth(1)
        .moveTo(startX, y + rowHeight)
        .lineTo(startX + totalRowWidth, y + rowHeight)
        .stroke();

      y += rowHeight;
    });

    const totalRowWidth = columnWidths.reduce((a, b) => a + b, 0);

    doc
      .rect(startX, y, totalRowWidth, rowHeight)
      .fillOpacity(0.1)
      .fill(headerColor)
      .fillOpacity(1.0);

    doc
      .strokeColor(headerColor)
      .lineWidth(2)
      .moveTo(startX, y)
      .lineTo(startX + totalRowWidth, y)
      .stroke();

    doc.font(boldFont).fontSize(14).fillColor(textColor);
    doc.text(
      'TOTAL'.toUpperCase(),
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

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(headerColor)
      .text(
        this.formatCurrency(displayTotalAmount),
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

  private feesNamesToString(
    feesName: FeesNames,
    exemptionTypeFromBill?: ExemptionType,
  ): string {
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



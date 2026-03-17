/* eslint-disable prettier/prettier */
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ReceiptEntity } from './entities/payment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { CreateReceiptDto } from './dtos/createPayment.dto';
import { ROLES } from 'src/auth/models/roles.enum';
import { CreateInvoiceDto } from './dtos/create-invoice.dto';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceStatsModel } from 'src/finance/models/invoice-stats.model';
import { CreditTransactionEntity } from './entities/credit-transaction.entity';
import { CreditTransactionQueryDto } from './dtos/credit-transaction-query.dto';
import {
  FinanceDashboardSummaryDto,
  FinanceDashboardSummaryFilters,
  MonthlyBreakdownItem,
} from './dtos/finance-dashboard-summary.dto';
import { StudentFinanceSummaryDto } from './dtos/student-finance-summary.dto';
import { InvoiceStatus } from 'src/finance/models/invoice-status.enum';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { CreditService } from './services/credit.service';
import { InvoiceService } from './services/invoice.service';
import { ReceiptService } from './services/receipt.service';
import { logStructured } from './utils/logger.util';
import { EnrolmentService } from 'src/enrolment/enrolment.service';
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(AccountsEntity)
    private readonly accountsRepository: Repository<AccountsEntity>,
    @InjectRepository(TeachersEntity)
    private readonly teachersRepository: Repository<TeachersEntity>,
    private readonly creditService: CreditService,
    private readonly invoiceService: InvoiceService,
    private readonly receiptService: ReceiptService,
    private readonly enrolmentService: EnrolmentService,
  ) {}

  /**
   * Voids a receipt - reverses all allocations and credit
   * @param receiptId - The ID of the receipt to void
   * @param voidedByEmail - Email of the user voiding the receipt
   * @returns The voided receipt
   */
  async voidReceipt(
    receiptId: number,
    voidedByEmail: string,
    ipAddress?: string,
  ): Promise<ReceiptEntity> {
    logStructured(
      this.logger,
      'log',
      'receipt.void.request',
      'Voiding receipt request received',
      { receiptId, voidedByEmail },
    );

    const userRole = await this.getUserRoleByEmail(voidedByEmail);
    const allowedRoles = [ROLES.auditor, ROLES.director, ROLES.dev];
    if (!allowedRoles.includes(userRole)) {
      logStructured(
        this.logger,
        'warn',
        'receipt.void.unauthorized',
        'Unauthorized attempt to void receipt',
        { receiptId, voidedByEmail, userRole },
      );
      throw new UnauthorizedException(
        'Only auditors, directors, and developers can void receipts.',
      );
    }

    return this.receiptService.voidReceipt(receiptId, voidedByEmail, ipAddress);
  }

  /**
   * Gets the user's role by their email address.
   * This is used for authorization checks in void operations.
   *
   * @param email - The email address of the user
   * @returns The user's role (ROLES enum value)
   * @throws NotFoundException if user is not found
   * @throws UnauthorizedException if user is not a staff member
   */
  private async getUserRoleByEmail(email: string): Promise<ROLES> {
    // Get teacher by email
    const teacher = await this.teachersRepository.findOne({
      where: { email },
    });

    if (!teacher) {
      throw new NotFoundException(
        `User with email ${email} not found. Only staff members can void receipts and invoices.`,
      );
    }

    // Get account by teacher ID (account.id = teacher.id based on OneToOne relationship)
    const account = await this.accountsRepository.findOne({
      where: { id: teacher.id },
    });

    if (!account) {
      throw new NotFoundException(
        `Account for user ${email} not found. Cannot verify authorization.`,
      );
    }

    // Use the enum-backed role field for authorization checks.
    // This avoids relying on roleEntity.name, which is display text and can drift.
    return account.role;
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
    ipAddress?: string,
  ): Promise<InvoiceEntity> {
    logStructured(
      this.logger,
      'log',
      'invoice.void.request',
      'Voiding invoice request received',
      { invoiceId, voidedByEmail },
    );

    // Authorization check: Only auditors, directors, and developers can void invoices
    const userRole = await this.getUserRoleByEmail(voidedByEmail);
    const allowedRoles = [ROLES.auditor, ROLES.director, ROLES.dev];
    if (!allowedRoles.includes(userRole)) {
      logStructured(
        this.logger,
        'warn',
        'invoice.void.unauthorized',
        'Unauthorized attempt to void invoice',
        { invoiceId, voidedByEmail, userRole },
      );
      throw new UnauthorizedException(
        'Only auditors, directors, and developers can void invoices.',
      );
    }

    return this.invoiceService.voidInvoice(invoiceId, voidedByEmail, ipAddress);
  }

  async getStudentBalance(
    studentNumber: string,
  ): Promise<{ amountDue: number }> {
    return this.receiptService.getStudentBalance(studentNumber);
  }

  /**
   * Finance-only summary for a student (single source for totals and balance).
   * Loads invoices/receipts, normalizes balances, then returns totals and outstanding by term.
   */
  async getStudentFinanceSummary(
    studentNumber: string,
  ): Promise<StudentFinanceSummaryDto> {
    const [studentInvoices, studentReceipts] = await Promise.all([
      this.getStudentInvoices(studentNumber),
      this.getPaymentsByStudent(studentNumber),
    ]);
    await this.normalizeStudentInvoiceBalances(studentInvoices);
    const { amountDue: amountOwed } =
      await this.getStudentBalance(studentNumber);

    const totalBilled = studentInvoices.reduce(
      (sum, inv) => sum + Number(inv.totalBill),
      0,
    );
    const totalPaid = studentReceipts.reduce(
      (sum, rec) => sum + Number(rec.amountPaid),
      0,
    );

    const outstandingStatuses = [
      InvoiceStatus.Pending,
      InvoiceStatus.PartiallyPaid,
      InvoiceStatus.Overdue,
    ];
    const outstandingBalances =
      amountOwed <= 0
        ? []
        : studentInvoices
            .filter((inv) =>
              outstandingStatuses.includes(inv.status as InvoiceStatus),
            )
            .map((inv) => {
              const totalBill = Number(inv.totalBill || 0);
              const amountPaid = Number(inv.amountPaidOnInvoice || 0);
              const calculatedBalance = Math.max(
                0,
                Math.round((totalBill - amountPaid) * 100) / 100,
              );
              if (calculatedBalance <= 0) return null;
              const enrol: EnrolEntity | undefined = inv.enrol;
              const termLabel = enrol ? `Term ${enrol.num}` : 'N/A';
              const year = enrol ? enrol.year : null;
              return { term: termLabel, year, amount: calculatedBalance };
            })
            .filter((item): item is NonNullable<typeof item> => item != null);

    return {
      totalBilled,
      totalPaid,
      amountOwed,
      outstandingBalances,
    };
  }

  async createReceipt(
    createReceiptDto: CreateReceiptDto,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
    ipAddress?: string,
  ): Promise<ReceiptEntity> {
    return this.receiptService.createReceipt(
      createReceiptDto,
      profile,
      ipAddress,
    );
  }

  async getAllReceipts(): Promise<ReceiptEntity[]> {
    return this.receiptService.getAllReceipts();
  }

  /**
   * Paginated receipts for dashboards/list views to avoid loading entire history.
   */
  async getDashboardReceipts(
    limit: number,
    offset: number,
  ): Promise<{ items: ReceiptEntity[]; total: number }> {
    return this.receiptService.getReceiptsPage(limit, offset);
  }

  /**
   * Get all receipts including voided ones (for audit purposes)
   * @returns All receipts including voided
   */
  async getAllReceiptsForAudit(): Promise<ReceiptEntity[]> {
    return this.receiptService.getAllReceiptsForAudit();
  }

  async getNotApprovedPayments(): Promise<ReceiptEntity[]> {
    return this.receiptService.getNotApprovedPayments();
  }

  async getPaymentsByStudent(studentNumber: string): Promise<ReceiptEntity[]> {
    return this.receiptService.getPaymentsByStudent(studentNumber);
  }

  /**
   * Get all receipts for a student including voided ones (for audit purposes)
   * @param studentNumber - The student number
   * @returns All receipts including voided
   */
  async getPaymentsByStudentForAudit(
    studentNumber: string,
  ): Promise<ReceiptEntity[]> {
    return this.receiptService.getPaymentsByStudentForAudit(studentNumber);
  }

  async getReceiptByReceiptNumber(
    receiptNumber: string,
    includeVoided: boolean = false,
  ): Promise<ReceiptEntity | null> {
    return this.receiptService.getReceiptByReceiptNumber(
      receiptNumber,
      includeVoided,
    );
  }

  async getPaymentsInTerm(num: number, year: number): Promise<ReceiptEntity[]> {
    return this.receiptService.getPaymentsInTerm(num, year);
  }

  async getPaymentsByYear(year: number): Promise<ReceiptEntity[]> {
    return this.receiptService.getPaymentsByYear(year);
  }

  async generateStatementOfAccount(
    studentNumber: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<InvoiceEntity> {
    return this.invoiceService.generateStatementOfAccount(
      studentNumber,
      profile,
    );
  }

  async saveInvoice(
    invoice: CreateInvoiceDto,
    performedBy?: string,
    ipAddress?: string,
  ): Promise<InvoiceEntity> {
    return this.invoiceService.saveInvoice(invoice, performedBy, ipAddress);
  }

  async generateEmptyInvoice(
    studentNumber: string,
    num: number,
    year: number,
  ): Promise<InvoiceEntity> {
    return this.invoiceService.generateEmptyInvoice(studentNumber, num, year);
  }

  /**
   * Applies the current student exemption to all existing invoices for that student.
   * This is called when an exemption is created, updated, or deactivated.
   * @param studentNumber - The student number whose invoices need to be re-calculated.
   */
  async applyExemptionToExistingInvoices(studentNumber: string): Promise<void> {
    return this.invoiceService.applyExemptionToExistingInvoices(studentNumber);
  }

  async getTermInvoices(num: number, year: number): Promise<InvoiceEntity[]> {
    return this.invoiceService.getTermInvoices(num, year);
  }

  /**
   * Get all invoices for a term including voided ones (for audit purposes)
   * @param num - Term number
   * @param year - Term year
   * @returns All invoices including voided
   */
  async getTermInvoicesForAudit(
    num: number,
    year: number,
  ): Promise<InvoiceEntity[]> {
    return this.invoiceService.getTermInvoicesForAudit(num, year);
  }

  async getAllInvoices(): Promise<InvoiceEntity[]> {
    return this.invoiceService.getAllInvoices();
  }

  /**
   * Paginated invoices for dashboards/list views to avoid loading entire history.
   */
  async getDashboardInvoices(
    limit: number,
    offset: number,
  ): Promise<{ items: InvoiceEntity[]; total: number }> {
    return this.invoiceService.getInvoicesPage(limit, offset);
  }

  /**
   * Get all invoices including voided ones (for audit purposes)
   * @returns All invoices including voided
   */
  async getAllInvoicesForAudit(): Promise<InvoiceEntity[]> {
    return this.invoiceService.getAllInvoicesForAudit();
  }

  async getStudentInvoices(studentNumber: string): Promise<InvoiceEntity[]> {
    const invoices = await this.invoiceService.getStudentInvoices(studentNumber);
    // Normalize balances/statuses so UI and finance summary stay in sync
    await this.normalizeStudentInvoiceBalances(invoices);
    return invoices;
  }

  /**
   * Fix stored balance/status when they disagree with totalBill - amountPaidOnInvoice.
   * Call when loading student data (e.g. dashboard) to correct timing/bugs/data issues.
   * @param invoices - Invoices already loaded for the student
   * @returns Number of invoices that were corrected and saved
   */
  async normalizeStudentInvoiceBalances(
    invoices: InvoiceEntity[],
  ): Promise<number> {
    return this.invoiceService.normalizeInvoiceBalances(invoices);
  }

  /**
   * Get all invoices for a student including voided ones (for audit purposes)
   * @param studentNumber - The student number
   * @returns All invoices including voided
   */
  async getStudentInvoicesForAudit(
    studentNumber: string,
  ): Promise<InvoiceEntity[]> {
    return this.invoiceService.getStudentInvoicesForAudit(studentNumber);
  }

  async getInvoice(
    studentNumber: string,
    num: number,
    year: number,
    includeVoided: boolean = false,
  ) {
    return this.invoiceService.getInvoice(
      studentNumber,
      num,
      year,
      includeVoided,
    );
  }

  /**
   * Fix an invoice whose totalBill does not include balanceBfwd (e.g. legacy data).
   * Recomputes totalBill to include balance brought forward, updates balance/status, and reconciles the student.
   */
  async fixInvoiceTotalToIncludeBalanceBfwd(
    invoiceId: number,
  ): Promise<InvoiceEntity> {
    return this.invoiceService.fixInvoiceTotalToIncludeBalanceBfwd(invoiceId);
  }

  async getInvoiceByInvoiceNumber(invoiceNumber: string) {
    return this.invoiceService.getInvoiceByInvoiceNumber(invoiceNumber);
  }

  async getInvoiceStats(
    num: number,
    year: number,
  ): Promise<InvoiceStatsModel[]> {
    return this.invoiceService.getInvoiceStats(num, year);
  }

  async updatePayment(
    receiptNumber: string,
    approved: boolean,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.receiptService.updatePayment(receiptNumber, approved, profile);
  }

  async generateInvoicePdf(invoiceData: InvoiceEntity): Promise<Buffer> {
    return this.invoiceService.generateInvoicePdf(invoiceData);
  }

  async generateReceiptPdf(receipt: ReceiptEntity): Promise<Buffer> {
    return this.receiptService.generateReceiptPdf(receipt);
  }

  async generateReceiptNumber(): Promise<string> {
    return this.receiptService.generateReceiptNumber();
  }

  /**
   * Reconcile student finances - corrects overpayments, verifies balances, applies credit
   * @param studentNumber - The student number to reconcile
   * @returns Detailed reconciliation results
   */
  async reconcileStudentFinances(studentNumber: string): Promise<{
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
    logStructured(
      this.logger,
      'log',
      'payment.reconcile.start',
      'Starting manual reconciliation for student',
      { studentNumber },
    );

    try {
      // Call the invoice service's reconciliation method
      // It will handle the transaction internally and return detailed results
      const result = await this.invoiceService.reconcileStudentFinancesForStudent(
        studentNumber,
      );

      logStructured(
        this.logger,
        'log',
        'payment.reconcile.success',
        'Manual reconciliation completed successfully',
        { studentNumber, summary: result.summary },
      );

      return result;
    } catch (error) {
      logStructured(
        this.logger,
        'error',
        'payment.reconcile.failure',
        'Manual reconciliation failed',
        {
          studentNumber,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }
  }

  async reconcileClassTerm(
    className: string,
    num: number,
    year: number,
  ): Promise<{
    className: string;
    termNum: number;
    year: number;
    totalStudents: number;
    succeeded: number;
    failed: number;
    results: Array<{
      studentNumber: string;
      studentName?: string;
      success: boolean;
      error?: string;
      reconciliationSummary?: {
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
    }>;
  }> {
    logStructured(
      this.logger,
      'log',
      'payment.reconcile.class.start',
      'Starting class-term reconciliation',
      { className, termNum: num, year },
    );

    const enrols = await this.enrolmentService.getEnrolmentByClass(
      className,
      num,
      year,
    );

    const studentsByNumber = new Map<
      string,
      { studentNumber: string; studentName?: string }
    >();

    for (const enrol of enrols) {
      const studentNumber = enrol.student?.studentNumber;
      if (!studentNumber) continue;
      if (!studentsByNumber.has(studentNumber)) {
        const studentName =
          enrol.student?.surname || enrol.student?.name
            ? `${enrol.student?.surname ?? ''} ${enrol.student?.name ?? ''}`.trim()
            : undefined;
        studentsByNumber.set(studentNumber, { studentNumber, studentName });
      }
    }

    const results: Array<{
      studentNumber: string;
      studentName?: string;
      success: boolean;
      error?: string;
      reconciliationSummary?: {
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
    }> = [];

    for (const student of studentsByNumber.values()) {
      try {
        const reconciled =
          await this.invoiceService.reconcileStudentFinancesForStudent(
            student.studentNumber,
          );
        results.push({
          studentNumber: student.studentNumber,
          studentName: student.studentName,
          success: true,
          reconciliationSummary: reconciled.summary,
        });
      } catch (error) {
        results.push({
          studentNumber: student.studentNumber,
          studentName: student.studentName,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    logStructured(
      this.logger,
      'log',
      'payment.reconcile.class.complete',
      'Class-term reconciliation completed',
      { className, termNum: num, year, totalStudents: results.length, succeeded, failed },
    );

    return {
      className,
      termNum: num,
      year,
      totalStudents: results.length,
      succeeded,
      failed,
      results,
    };
  }

  /**
   * Get credit transaction history for a student
   * @param studentNumber - The student number
   * @param query - Optional query parameters (date range, type, etc.)
   * @returns Array of credit transactions
   */
  async getCreditTransactions(
    studentNumber: string,
    query?: CreditTransactionQueryDto,
  ): Promise<CreditTransactionEntity[]> {
    return this.creditService.getCreditTransactions(studentNumber, query);
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
    return this.creditService.getCreditTransactionSummary(
      studentNumber,
      startDate,
      endDate,
    );
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
    return this.creditService.getCreditActivityReport(startDate, endDate);
  }

  /**
   * Aggregated finance summary for the dashboard (cards + chart).
   * Uses SQL aggregates for invoices and receipts to minimise memory usage.
   * @param filters - Optional startDate, endDate, enrolTerm, transactionType
   */
  async getFinanceDashboardSummary(
    filters?: FinanceDashboardSummaryFilters,
  ): Promise<FinanceDashboardSummaryDto> {
    const includeInvoices = !filters || filters.transactionType !== 'Payment';
    const includeReceipts = !filters || filters.transactionType !== 'Invoice';
    const invoiceFilters = includeInvoices ? this.toInvoiceFilters(filters) : undefined;
    const receiptFilters = includeReceipts ? this.toReceiptFilters(filters) : undefined;

    const [
      totalInvoiced,
      totalPayments,
      invoiceCount,
      receiptCount,
      invoiceMonthly,
      receiptMonthly,
    ] = await Promise.all([
      includeInvoices
        ? this.invoiceService.getTotalInvoicedAmount(invoiceFilters)
        : Promise.resolve(0),
      includeReceipts
        ? this.receiptService.getTotalReceiptedAmount(receiptFilters)
        : Promise.resolve(0),
      includeInvoices
        ? this.invoiceService.getInvoiceCount(invoiceFilters)
        : Promise.resolve(0),
      includeReceipts
        ? this.receiptService.getReceiptCount(receiptFilters)
        : Promise.resolve(0),
      includeInvoices
        ? this.invoiceService.getMonthlyInvoiceBreakdown(invoiceFilters)
        : Promise.resolve([]),
      includeReceipts
        ? this.receiptService.getMonthlyReceiptBreakdown(receiptFilters)
        : Promise.resolve([]),
    ]);

    const outstandingBalance = totalInvoiced - totalPayments;
    const totalTransactions = invoiceCount + receiptCount;
    const averageInvoiceAmount =
      invoiceCount > 0 ? totalInvoiced / invoiceCount : 0;
    const averagePaymentAmount =
      receiptCount > 0 ? totalPayments / receiptCount : 0;
    const collectionRate =
      totalInvoiced > 0 ? (totalPayments / totalInvoiced) * 100 : 0;

    const monthlyBreakdown = this.mergeMonthlyBreakdowns(
      invoiceMonthly,
      receiptMonthly,
    );

    return {
      totalInvoiced,
      totalPayments,
      outstandingBalance,
      invoiceCount,
      receiptCount,
      totalTransactions,
      averageInvoiceAmount,
      averagePaymentAmount,
      collectionRate,
      monthlyBreakdown,
    };
  }

  private toInvoiceFilters(
    f?: FinanceDashboardSummaryFilters,
  ): { startDate?: string; endDate?: string; enrolTerm?: string } | undefined {
    if (!f) return undefined;
    return {
      startDate: f.startDate,
      endDate: f.endDate,
      enrolTerm: f.enrolTerm,
    };
  }

  private toReceiptFilters(
    f?: FinanceDashboardSummaryFilters,
  ): { startDate?: string; endDate?: string; enrolTerm?: string } | undefined {
    if (!f) return undefined;
    return {
      startDate: f.startDate,
      endDate: f.endDate,
      enrolTerm: f.enrolTerm,
    };
  }

  private mergeMonthlyBreakdowns(
    invoiceMonthly: { monthLabel: string; year: number; month: number; total: number }[],
    receiptMonthly: { monthLabel: string; year: number; month: number; total: number }[],
  ): MonthlyBreakdownItem[] {
    const map = new Map<string, MonthlyBreakdownItem>();
    const add = (
      label: string,
      year: number,
      month: number,
      invoicesTotal: number,
      paymentsTotal: number,
    ) => {
      const key = `${year}-${month}`;
      const existing = map.get(key);
      if (existing) {
        existing.invoicesTotal += invoicesTotal;
        existing.paymentsTotal += paymentsTotal;
      } else {
        map.set(key, {
          monthLabel: label,
          year,
          month,
          invoicesTotal,
          paymentsTotal,
        });
      }
    };
    for (const row of invoiceMonthly) {
      add(row.monthLabel, row.year, row.month, row.total, 0);
    }
    for (const row of receiptMonthly) {
      add(row.monthLabel, row.year, row.month, 0, row.total);
    }
    return Array.from(map.values()).sort(
      (a, b) => a.year - b.year || a.month - b.month,
    );
  }
}

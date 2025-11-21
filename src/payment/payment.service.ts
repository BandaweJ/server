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
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { CreditService } from './services/credit.service';
import { InvoiceService } from './services/invoice.service';
import { ReceiptService } from './services/receipt.service';
import { logStructured } from './utils/logger.util';
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
    const allowedRoles = [ROLES.auditor, ROLES.director];
    if (!allowedRoles.includes(userRole)) {
      logStructured(
        this.logger,
        'warn',
        'receipt.void.unauthorized',
        'Unauthorized attempt to void receipt',
        { receiptId, voidedByEmail, userRole },
      );
      throw new UnauthorizedException(
        'Only auditors and directors can void receipts.',
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

    // Authorization check: Only auditors and directors can void invoices
    const userRole = await this.getUserRoleByEmail(voidedByEmail);
    const allowedRoles = [ROLES.auditor, ROLES.director];
    if (!allowedRoles.includes(userRole)) {
      logStructured(
        this.logger,
        'warn',
        'invoice.void.unauthorized',
        'Unauthorized attempt to void invoice',
        { invoiceId, voidedByEmail, userRole },
      );
      throw new UnauthorizedException(
        'Only auditors and directors can void invoices.',
      );
    }

    return this.invoiceService.voidInvoice(invoiceId, voidedByEmail, ipAddress);
  }

  async getStudentBalance(
    studentNumber: string,
  ): Promise<{ amountDue: number }> {
    return this.receiptService.getStudentBalance(studentNumber);
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
   * Get all invoices including voided ones (for audit purposes)
   * @returns All invoices including voided
   */
  async getAllInvoicesForAudit(): Promise<InvoiceEntity[]> {
    return this.invoiceService.getAllInvoicesForAudit();
  }

  async getStudentInvoices(studentNumber: string): Promise<InvoiceEntity[]> {
    return this.invoiceService.getStudentInvoices(studentNumber);
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
}

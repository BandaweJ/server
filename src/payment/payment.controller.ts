/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateReceiptDto } from './dtos/createPayment.dto'; // Assuming this is CreateReceiptDto
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { PaymentService } from './payment.service';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { Request, Response } from 'express';
import { CreateInvoiceDto } from './dtos/create-invoice.dto';
import { ReceiptEntity } from './entities/payment.entity';
import { CreditTransactionQueryDto } from './dtos/credit-transaction-query.dto';
import { Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ROLES } from 'src/auth/models/roles.enum';

@Controller('payment')
@UseGuards(AuthGuard(), RolesGuard)
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Patch('receipt/void/:receiptId')
  @Roles(ROLES.auditor, ROLES.director)
  voidReceipt(
    @Param('receiptId', ParseIntPipe) receiptId: number,
    @GetUser() profile: TeachersEntity,
    @Req() req: Request,
  ) {
    return this.paymentService.voidReceipt(
      receiptId,
      profile.email,
      req.ip || req.socket.remoteAddress,
    );
  }

  @Patch('invoice/void/:invoiceId')
  @Roles(ROLES.auditor, ROLES.director)
  voidInvoice(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @GetUser() profile: TeachersEntity,
    @Req() req: Request,
  ) {
    return this.paymentService.voidInvoice(
      invoiceId,
      profile.email,
      req.ip || req.socket.remoteAddress,
    );
  }

  @Get('studentBalance/:studentNumber')
  getStudentBalance(@Param('studentNumber') studentNumber: string) {
    return this.paymentService.getStudentBalance(studentNumber);
  }

  // CREDIT TRANSACTION HISTORY
  @Get('credit-transactions/:studentNumber')
  getCreditTransactions(
    @Param('studentNumber') studentNumber: string,
    @Query() query: CreditTransactionQueryDto,
  ) {
    return this.paymentService.getCreditTransactions(studentNumber, query);
  }

  @Get('credit-transactions/:studentNumber/summary')
  getCreditTransactionSummary(
    @Param('studentNumber') studentNumber: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentService.getCreditTransactionSummary(
      studentNumber,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('credit-activity-report')
  getCreditActivityReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentService.getCreditActivityReport(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  // Specific by ID (literal segment + parameter)
  @Get('receipt/:receiptNumber')
  getReceiptByReceiptNumber(
    @Param('receiptNumber') receiptNumber: string,
    @Query('includeVoided') includeVoided?: string,
  ) {
    return this.paymentService.getReceiptByReceiptNumber(
      receiptNumber,
      includeVoided === 'true',
    );
  }

  @Get('receipt/student/:studentNumber')
  getStudentReceipts(@Param('studentNumber') studentNumber: string) {
    return this.paymentService.getPaymentsByStudent(studentNumber);
  }

  @Get('receiptpdf/:receiptNumber')
  async getReceiptPdf(
    @Param('receiptNumber') receiptNumber: string,
    @Res() res: Response,
  ) {
    try {
      const receipt: ReceiptEntity =
        await this.paymentService.getReceiptByReceiptNumber(receiptNumber);

      if (!receipt) {
        return res.status(HttpStatus.NOT_FOUND).send('Receipt not found.');
      }

      const pdfBuffer = await this.paymentService.generateReceiptPdf(receipt);

      // Construct a more robust filename
      const sanitizedReceiptNumber = (receipt.receiptNumber || 'N/A').replace(
        /[^a-zA-Z0-9-]/g,
        '_',
      ); // Replace non-alphanumeric (except hyphen) with underscore
      const sanitizedStudentSurname = (
        receipt.student?.surname || 'unknown'
      ).replace(/\s/g, '_'); // Replace spaces with underscores
      const sanitizedStudentName = (receipt.student?.name || 'student').replace(
        /\s/g,
        '_',
      ); // Replace spaces with underscores

      const filename = `receipt_${sanitizedReceiptNumber}_${sanitizedStudentSurname}_${sanitizedStudentName}.pdf`;

      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length,
      });
      res.end(pdfBuffer);
    } catch (error) {
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send('Failed to generate PDF.');
    }
  }

  // General Receipts (no parameters)
  @Get('receipt') // This should come after specific receipt paths
  getAllReceipts() {
    return this.paymentService.getAllReceipts();
  }

  // AUDIT ENDPOINTS - Include voided records
  @Get('receipt/audit/all')
  getAllReceiptsForAudit() {
    return this.paymentService.getAllReceiptsForAudit();
  }

  @Get('receipt/audit/student/:studentNumber')
  getStudentReceiptsForAudit(@Param('studentNumber') studentNumber: string) {
    return this.paymentService.getPaymentsByStudentForAudit(studentNumber);
  }

  @Post('receipt')
  @Roles(ROLES.reception, ROLES.auditor)
  createReceipt(
    @Body() createReceiptDto: CreateReceiptDto,
    @GetUser() profile: TeachersEntity,
    @Req() req: Request,
  ) {
    return this.paymentService.createReceipt(
      createReceiptDto,
      profile,
      req.ip || req.socket.remoteAddress,
    );
  }

  // INVOICES
  // MOST SPECIFIC: 'invoice' + studentNumber + num + year
  @Get('invoicepdf/:invoiceNumber')
  @Header('Content-Type', 'application/pdf')
  // @Header('Content-Disposition', 'attachment; filename=invoice.pdf')
  async getInvoicePdf(
    @Res() res: Response,
    @Param('invoiceNumber') invoiceNumber: string,
  ): Promise<any> {
    const invoice = await this.paymentService.getInvoiceByInvoiceNumber(
      invoiceNumber,
    );
    const pdfBuffer = await this.paymentService.generateInvoicePdf(invoice);

    const filename = `invoice_${invoice.invoiceNumber}_${invoice.student?.name}_${invoice.student?.surname}_${invoice.enrol.name}.pdf`;

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  // More specific than /:num/:year if it were directly under /payment, but here it's under 'invoice'
  @Get('invoice/stats/:num/:year') // This specific sub-path is fine
  getInvoiceStats(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.paymentService.getInvoiceStats(num, year);
  }

  @Get('invoice/:studentNumber/:num/:year')
  generateInvoice(
    @Param('studentNumber') studentNumber: string,
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
    @Query('includeVoided') includeVoided?: string,
  ) {
    return this.paymentService.getInvoice(
      studentNumber,
      num,
      year,
      includeVoided === 'true',
    );
  }

  // 'invoice' + num + year
  @Get('invoice/:num/:year') // This path is now after the more specific 'invoice/:studentNumber/:num/:year'
  getTermInvoices(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.paymentService.getTermInvoices(num, year);
  }

  @Get('invoice')
  getAllInvoices() {
    return this.paymentService.getAllInvoices();
  }

  @Get('invoice/:studentNumber')
  getStudentInvoices(@Param('studentNumber') studentNumber: string) {
    return this.paymentService.getStudentInvoices(studentNumber);
  }

  // AUDIT ENDPOINTS - Include voided records
  @Get('invoice/audit/all')
  getAllInvoicesForAudit() {
    return this.paymentService.getAllInvoicesForAudit();
  }

  @Get('invoice/audit/student/:studentNumber')
  getStudentInvoicesForAudit(@Param('studentNumber') studentNumber: string) {
    return this.paymentService.getStudentInvoicesForAudit(studentNumber);
  }

  @Get('invoice/audit/term/:num/:year')
  getTermInvoicesForAudit(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.paymentService.getTermInvoicesForAudit(num, year);
  }

  @Post('invoice')
  saveInvoice(
    @Body() invoice: CreateInvoiceDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
    @Req() req: Request,
  ) {
    return this.paymentService.saveInvoice(
      invoice,
      profile.email,
      req.ip || req.socket.remoteAddress,
    );
  }

  // STATEMENTS
  @Get('statement/:studentNumber')
  generateStatement(
    @Param('studentNumber') studentNumber: string,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.paymentService.generateStatementOfAccount(
      studentNumber,
      profile,
    );
  }

  // GENERAL PAYMENT ROUTES (These are the trickiest due to parameters)
  // Use a distinct prefix for each. E.g., '/student/:studentNumber', '/term/:num/:year', '/year/:year'
  // Or consolidate into a single general payments query endpoint with optional query parameters.

  // OPTION 1: Use specific prefixes (Recommended)
  @Get('student/:studentNumber') // Recommended prefix
  getPaymentsByStudent(@Param('studentNumber') studentNumber: string) {
    return this.paymentService.getPaymentsByStudent(studentNumber);
  }

  @Get('term/:num/:year') // Recommended prefix
  getPaymentsInTerm(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.paymentService.getPaymentsInTerm(num, year);
  }

  @Get('year/:year') // Recommended prefix
  getPaymentsInYear(@Param('year', ParseIntPipe) year: number) {
    return this.paymentService.getPaymentsByYear(year);
  }

  // Least specific: No parameters
  @Get() // This should come last among the general payment GETs
  getNotApprovedPayments() {
    return this.paymentService.getNotApprovedPayments();
  }

  // PATCH (Less prone to conflicts with GETs, but ordering for clarity is still good)
  @Patch('receipt/:receiptNumber/:approved') // Or just use a DTO for the body for 'approved' status
  updatePayment(
    @Param('receiptNumber') receiptNumber: string, // Keep as string if it's alphanumeric
    @Param('approved') approved: boolean,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.paymentService.updatePayment(receiptNumber, approved, profile);
  }

  @Post('reconcile/:studentNumber')
  @Roles(ROLES.reception, ROLES.auditor, ROLES.director)
  reconcileStudentFinances(
    @Param('studentNumber') studentNumber: string,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.paymentService.reconcileStudentFinances(studentNumber);
  }

}

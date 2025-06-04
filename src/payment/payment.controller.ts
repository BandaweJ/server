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
import { Response } from 'express';
import { Invoice } from './models/invoice.model'; // Assuming this is InvoiceModel
import { ReceiptEntity } from './entities/payment.entity';

@Controller('payment')
@UseGuards(AuthGuard())
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  // RECEIPTS
  // MOST SPECIFIC: Literal 'new' segment
  @Get('receipt/new/:studentNumber')
  getNewReceipt(
    @Param('studentNumber') studentNumber: string,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.paymentService.getNewReceipt(studentNumber, profile);
  }

  // Specific by ID (literal segment + parameter)
  @Get('receipt/:receiptNumber')
  getReceiptByReceiptNumber(
    @Param('receiptNumber') receiptNumber: string, // Keep as string if it's alphanumeric
    // If it's always numeric, use ParseIntPipe if you want it as number directly here,
    // but the DTO indicates string for receiptNumber, so match that here.
  ) {
    return this.paymentService.getReceiptByReceiptNumber(receiptNumber);
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

  @Post('receipt')
  createReceipt(
    @Body() createReceiptDto: CreateReceiptDto,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.paymentService.createReceipt(createReceiptDto, profile);
  }

  // INVOICES
  // MOST SPECIFIC: 'invoice' + studentNumber + num + year
  @Get('invoicepdf/:studentNumber/:num/:year')
  @Header('Content-Type', 'application/pdf')
  // @Header('Content-Disposition', 'attachment; filename=invoice.pdf')
  async getInvoicePdf(
    @Res() res: Response,
    @Param('studentNumber') studentNumber: string,
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ): Promise<any> {
    const invoice = await this.paymentService.getInvoice(
      studentNumber,
      num,
      year,
    );
    const pdfBuffer = await this.paymentService.generateInvoicePdf(invoice);

    const filename = `receipt_${invoice.invoiceNumber}_${invoice.student?.name}_${invoice.student?.surname}_${invoice.enrol.name}.pdf`;

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  @Get('invoice/:studentNumber/:num/:year')
  generateInvoice(
    @Param('studentNumber') studentNumber: string,
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.paymentService.getInvoice(studentNumber, num, year);
  }

  // More specific than /:num/:year if it were directly under /payment, but here it's under 'invoice'
  @Get('invoice/stats/:num/:year') // This specific sub-path is fine
  getInvoiceStats(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.paymentService.getInvoiceStats(num, year);
  }

  // 'invoice' + num + year
  @Get('invoice/:num/:year') // This path is now after the more specific 'invoice/:studentNumber/:num/:year'
  getInvoices(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.paymentService.getInvoices(num, year);
  }

  @Post('invoice')
  saveInvoice(@Body() invoice: Invoice) {
    return this.paymentService.saveInvoice(invoice);
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

  // OPTION 2 (Alternative to Option 1): Consolidate into a single endpoint with query parameters
  // This is often more flexible for filtering/searching.
  // @Get('search')
  // searchPayments(
  //   @Query('studentNumber') studentNumber?: string,
  //   @Query('num', new DefaultValuePipe(null), ParseIntPipe) num?: number,
  //   @Query('year', new DefaultValuePipe(null), ParseIntPipe) year?: number,
  // ) {
  //   // You'd need to adapt your service method to handle optional parameters
  //   return this.paymentService.searchPayments(studentNumber, num, year);
  // }

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
}

/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  And,
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { PaymentEntity } from './entities/payment.entity';
import { StudentsService } from '../profiles/students/students.service';
import { EnrolmentService } from '../enrolment/enrolment.service';
import { InjectRepository } from '@nestjs/typeorm';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { CreatePaymentDto } from './dtos/createPayment.dto';
import { ROLES } from 'src/auth/models/roles.enum';
import { FinanceService } from 'src/finance/finance.service';
import { Invoice } from './models/invoice.model';
import { ResourceByIdService } from 'src/resource-by-id/resource-by-id.service';
import * as PDFDocument from 'pdfkit';
import { Stream } from 'stream';
import * as fs from 'fs';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    // private readonly studentsService: StudentsService,
    private readonly enrolmentService: EnrolmentService,
    private readonly financeService: FinanceService,
    private studentsService: StudentsService,
    private resourceById: ResourceByIdService,
  ) {}

  async createPayment(
    createPaymentDto: CreatePaymentDto,

    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<PaymentEntity> {
    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.student:
      case ROLES.teacher:
        throw new UnauthorizedException('You are not allowed to define fees');
    }

    const { student, amount, description, receiptBookNumber, paymentMethod } =
      createPaymentDto;

    const payment = this.paymentRepository.create({
      student,
      amount,
      description,
      receiptBookNumber,
      paymentMethod,
    });
    return this.paymentRepository.save(payment);
  }

  async getNotApprovedPayments(): Promise<PaymentEntity[]> {
    return await this.paymentRepository.find({
      where: {
        approved: false,
      },
    });
  }

  async getPaymentsByStudent(studentNumber: string): Promise<PaymentEntity[]> {
    //   const student = await this.studentsService.getStudent(studentNumber, profile);

    return await this.paymentRepository.find({
      where: {
        student: { studentNumber },
      },
      relations: ['student'],
    });
  }

  async getPaymentByReceiptNumber(
    receiptNumber: number,
  ): Promise<PaymentEntity> {
    return await this.paymentRepository.findOne({
      where: { receiptNumber },
    });
  }

  async getPaymentsInTerm(num: number, year: number): Promise<PaymentEntity[]> {
    const term = await this.enrolmentService.getOneTerm(num, year);

    if (!term) {
      return []; // Return an empty array if term is not found
    }

    return await this.paymentRepository.find({
      where: {
        paymentDate: And(
          MoreThanOrEqual(term.startDate),
          LessThanOrEqual(term.endDate),
        ),
      },
    });
  }

  async getPaymentsByYear(year: number): Promise<PaymentEntity[]> {
    const startDate = new Date(year, 0, 1); // January 1st of the year
    const endDate = new Date(year + 1, 0, 1); // January 1st of the next year (exclusive)

    return await this.paymentRepository.find({
      where: {
        paymentDate: Between(startDate, endDate),
      },
    });
  }

  async generateStatementOfAccount(
    studentNumber: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<any> {
    const payments = await this.getPaymentsByStudent(studentNumber);
    const bills = await this.financeService.getStudentBills(studentNumber);
    const student = await this.studentsService.getStudent(
      studentNumber,
      profile,
    );

    const totalPayments = payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const totalBill = bills.reduce(
      (sum, bill) => sum + Number(bill.fees.amount),
      0,
    );

    const balanceBfwd = await this.financeService.findStudentBalance(
      studentNumber,
    );

    const invoice = new Invoice(
      totalBill,
      totalPayments,
      balanceBfwd,
      student,
      bills,
      payments,
      Number(totalBill) + Number(balanceBfwd.amount) - Number(totalPayments),
    );

    // const invoice: Invoice = {
    //   totalBill,
    //   totalPayments,
    //   balanceBfwd,
    //   student,
    //   bills,
    //   payments,
    //   balance: totalBill + balanceBfwd.amount - totalPayments,
    // };

    return invoice;
  }

  async generateInvoice(studentNumber: string, num: number, year: number) {
    const bills = await this.financeService.getStudentBillsByTerm(
      studentNumber,
      num,
      year,
    );

    const balanceBfwd = await this.financeService.findStudentBalance(
      studentNumber,
    );

    const totalBills = bills.reduce(
      (sum, bill) => sum + Number(bill.fees.amount),
      0,
    );

    const totalPayments = 0;

    const student = await this.resourceById.getStudentByStudentNumber(
      studentNumber,
    );

    const invoice = new Invoice(
      totalBills,
      totalPayments,
      balanceBfwd,
      student,
      bills,
      [],
      Number(totalBills) + Number(balanceBfwd.amount) - totalPayments,
    );

    // const invoice: Invoice = {
    //   totalBill: totalBills,
    //   totalPayments: 0,
    //   balanceBfwd,
    //   student,
    //   bills,
    //   payments: [],
    //   balance:
    //     Number(totalBills) + Number(balanceBfwd.amount) - Number(totalPayments), //totalBills + balanceBfwd.amount - totalPayments,
    // };

    return invoice;
  }

  async updatePayment(
    receiptNumber: number,
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

    return await this.paymentRepository.update(
      { receiptNumber: receiptNumber }, // Where clause: find the payment by receiptNumber
      { approved: approved }, // What to update: set approved to the provided value
    );
  }

  // ---------------------Invoice PDF----------------------------------//
  // Helper function to create a formatted address block
  createAddressBlock(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    name: string,
    address: string,
    phone: string,
    email: string,
  ): void {
    const lineHeight = 15;
    doc
      .font('Helvetica-Bold')
      .text(name, x, y)
      .font('Helvetica')
      .text(address, x, y + lineHeight)
      .text(`Phone: ${phone}`, x, y + 2 * lineHeight)
      .text(`Email: ${email}`, x, y + 3 * lineHeight);
  }

  // Helper function to draw a table with headers and data
  drawTable(
    doc: PDFKit.PDFDocument,
    data: any[],
    startX: number,
    startY: number,
    columnWidths: number[],
    headers: string[],
    headerColor = '#eeeeee',
    textColor = '#000000',
  ): number {
    const rowHeight = 20;
    const headerHeight = 25;
    const borderColor = '#cccccc';
    const font = 'Helvetica';
    const boldFont = 'Helvetica-Bold';
    const fontSize = 10;
    const headerFontSize = 10;

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
          startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0) + 5, // Add padding
          y + headerHeight / 2 - headerFontSize / 2,
          {
            width: columnWidths[i] - 10, // Subtract padding from width
            align: 'left',
          },
        );
    });
    y += headerHeight;

    // Draw table rows
    doc.font(font).fontSize(fontSize).fillColor(textColor);
    data.forEach((row) => {
      headers.forEach((header, i) => {
        const text =
          row[header] !== undefined && row[header] !== null
            ? row[header].toString()
            : ''; //handle null or undefined
        doc
          .rect(
            startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0),
            y,
            columnWidths[i],
            rowHeight,
          )
          .stroke(borderColor)
          .text(
            text,
            startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0) + 5, // Add padding
            y + rowHeight / 2 - fontSize / 2,
            {
              width: columnWidths[i] - 10, // Subtract padding from width
              align: 'left', // Align text
            },
          );
      });
      y += rowHeight;
    });

    // Draw the black line below the table
    doc
      .strokeColor('#000000')
      .lineWidth(2)
      .moveTo(startX, y)
      .lineTo(startX + columnWidths.reduce((a, b) => a + b, 0), y)
      .stroke();

    return y; // Return the y-coordinate of the end of the table
  }

  async generateInvoicePdf(invoiceData: Invoice): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    // Create a writeable stream
    const stream = new Stream.PassThrough();
    doc.pipe(stream);

    // --- Document Header ---
    const logo = 'path/to/your/logo.png'; // Replace with the actual path to your logo
    const companyName = 'Your Company Name'; // Replace
    const companyAddress = '123 Main Street, Anytown, USA'; // Replace
    const companyPhone = '123-456-7890'; // Replace
    const companyEmail = 'info@yourcompany.com'; // Replace

    // Add logo (replace with your logo path)
    if (fs.existsSync(logo)) {
      try {
        doc.image(logo, 50, 50, { width: 100 });
      } catch (e) {
        console.log('Error adding image', e);
      }
    }

    // Add company info
    const companyInfoX = 200; // Adjust as needed
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
      .text('INVOICE', 50, 150, { align: 'left' });

    // --- Invoice Details ---
    const invoiceDetailsX = 400; // Adjust
    const invoiceNumber = invoiceData.invoiceNumber || 'INV-001'; // Replace
    const invoiceDate =
      invoiceData.invoiceDate || new Date().toLocaleDateString(); // Replace
    const dueDate =
      invoiceData.invoiceDueDate ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(); // 30 days from now

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(`Invoice #:`, invoiceDetailsX, 150)
      .font('Helvetica')
      .text(invoiceNumber, invoiceDetailsX + 80, 150) // Adjust spacing
      .font('Helvetica-Bold')
      .text(`Date:`, invoiceDetailsX, 170)
      .font('Helvetica')
      .text(invoiceDate.toLocaleString(), invoiceDetailsX + 80, 170)
      .font('Helvetica-Bold')
      .text(`Due Date:`, invoiceDetailsX, 190)
      .font('Helvetica')
      .text(dueDate.toLocaleString(), invoiceDetailsX + 80, 190);

    // --- Bill To Address ---
    const billToName =
      invoiceData.student.surname + invoiceData.student.name || 'Customer Name'; // Replace
    const billToAddress = invoiceData.student.address || 'Customer Address'; // Replace
    const billToPhone = invoiceData.student.cell || 'Customer Phone'; // Replace
    const billToEmail = invoiceData.student.email || 'customer@example.com'; // Replace

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Bill To:', 50, 220)
      .font('Helvetica');
    this.createAddressBlock(
      doc,
      50,
      235,
      billToName,
      billToAddress,
      billToPhone,
      billToEmail,
    );

    // --- Invoice Items Table ---
    const tableStartX = 50;
    const tableStartY = 300; // Adjust
    const columnWidths = [180, 50, 80, 80, 100]; // Widths for Description, Qty, Rate, Tax, Amount
    const headers = ['Description', 'Qty', 'Rate', 'Tax', 'Amount'];
    const items = invoiceData.bills || [];

    const tableEndY = this.drawTable(
      doc,
      items,
      tableStartX,
      tableStartY,
      columnWidths,
      headers,
    );

    // --- Subtotal, Tax, Total ---
    const subtotalX =
      tableStartX + columnWidths.slice(0, -1).reduce((a, b) => a + b, 0); // Start X of the amount column
    const subtotalY = tableEndY + 20; // Position after table
    const subtotal = items.reduce((sum, item) => sum + item.fees.amount, 0);
    const tax = items.reduce((sum, item) => sum + item.fees.amount, 0);
    const total = subtotal; // For this example, total = subtotal + tax

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Subtotal:', subtotalX - 80, subtotalY, {
        align: 'left',
        width: 70,
      });
    doc.font('Helvetica').text(subtotal.toFixed(2), subtotalX, subtotalY, {
      align: 'left',
      width: 100,
    });
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Tax:', subtotalX - 80, subtotalY + 20, {
        align: 'left',
        width: 70,
      });
    doc.font('Helvetica').text(tax.toFixed(2), subtotalX, subtotalY + 20, {
      align: 'left',
      width: 100,
    });
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('Total:', subtotalX - 80, subtotalY + 40, {
        align: 'left',
        width: 70,
      });
    doc
      .font('Helvetica')
      .fontSize(14)
      .text(total.toFixed(2), subtotalX, subtotalY + 40, {
        align: 'left',
        width: 100,
      });

    // --- Terms and Conditions ---
    const termsAndConditions = `Terms and Conditions:
      Payment is due within 30 days.  Please include the invoice number on your payment.
      Late payments may be subject to a 1.5% monthly finance charge.`; // Replace

    const termsStartY = subtotalY + 70; // Adjust
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#555555')
      .text(termsAndConditions, 50, termsStartY, {
        align: 'left',
        lineGap: 8,
      });

    // --- Footer ---
    const footerText = 'Thank you for your business!'; // Replace
    const footerY = doc.page.height - 30; // 30 from the bottom

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#888888')
      .text(footerText, 50, footerY, { align: 'center' });

    // Finalize the PDF and end the stream
    doc.end();

    // Return a buffer
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}

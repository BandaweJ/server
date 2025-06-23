/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  And,
  Between,
  DataSource,
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

  async getStudentBalance(
    studentNumber: string,
  ): Promise<{ amountDue: number }> {
    const student = await this.resourceById.getStudentByStudentNumber(
      studentNumber,
    );
    if (!student) {
      throw new Error('Student not found'); // Or throw NotFoundException
    }

    // Calculate total outstanding invoices
    const outstandingInvoices = await this.invoiceRepository.find({
      where: {
        student: { studentNumber }, // Link by student entity or student ID
        status: In([
          InvoiceStatus.Pending,
          InvoiceStatus.PartiallyPaid,
          InvoiceStatus.Overdue,
        ]),
      },
    });

    const totalInvoiceBalance = outstandingInvoices.reduce(
      (sum, inv) => sum + +inv.balance,
      0,
    );

    return {
      amountDue: totalInvoiceBalance, // This is the 'amount due' for the student
    };
  }

  async createReceipt(
    createReceiptDto: CreateReceiptDto,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ReceiptEntity> {
    // 1. Authorization Check (already provided)
    const allowedRoles = [ROLES.reception]; // Define your allowed roles
    if (!allowedRoles.includes(profile.role as ROLES)) {
      throw new UnauthorizedException(
        'You are not allowed to generate receipts',
      );
    }

    // 2. Fetch Student Entity
    // Assuming createReceiptDto has studentNumber directly for lookup
    const studentNumber = createReceiptDto.studentNumber; // Adjust if DTO is nested e.g., createReceiptDto.student.studentNumber
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
      // Copy over DTO properties directly if they match
      amountPaid: createReceiptDto.amountPaid,
      description: createReceiptDto.description,
      paymentMethod: createReceiptDto.paymentMethod,
      // Manual assignments
      student: student, // Link the found student entity
      receiptNumber: this.generateReceiptNumber(),
      servedBy: profile.email, // Or profile.name, or a more specific user ID
      // paymentDate: new Date(), // auto created by db
      // approved: false, // Default or determined by your workflow//auto in db
      enrol: enrol,
      // enrol: await this.enrolmentService.getCurrentEnrollment(studentNumber), // If you have an enrolment service
    });

    // Start a database transaction for atomicity
    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        // Save the receipt first to get its ID before creating allocations
        const savedReceipt = await transactionalEntityManager.save(newReceipt);

        let remainingPaymentAmount = savedReceipt.amountPaid;
        const allocationsToSave: ReceiptInvoiceAllocationEntity[] = [];
        const updatedInvoices: InvoiceEntity[] = []; // To hold invoices that need saving

        // 3. Fetch and Order Outstanding Invoices
        const openInvoices = await transactionalEntityManager.find(
          InvoiceEntity,
          {
            where: {
              student: { studentNumber }, // Link by student ID
              status: In([
                InvoiceStatus.Pending,
                InvoiceStatus.PartiallyPaid,
                InvoiceStatus.Overdue,
              ]),
            },
            order: {
              invoiceDueDate: 'ASC', // FIFO: Oldest due date first
            },
          },
        );

        // 4. Apply payment amount to invoices sequentially (FIFO)
        for (const invoice of openInvoices) {
          if (remainingPaymentAmount <= 0) {
            break; // Payment has been fully applied
          }

          const invoiceCurrentBalance = +invoice.balance; // Using invoice.balance which is totalBill - amountPaidOnInvoice

          if (invoiceCurrentBalance <= 0) {
            continue; // This invoice is already paid or has a credit, skip it
          }

          const amountToApplyToCurrentInvoice = Math.min(
            remainingPaymentAmount,
            invoiceCurrentBalance,
          );

          // Create an allocation record
          const allocation = transactionalEntityManager.create(
            ReceiptInvoiceAllocationEntity,
            {
              receipt: savedReceipt, // Link to the newly saved receipt
              invoice: invoice, // Link to the current invoice
              amountApplied: amountToApplyToCurrentInvoice,
              allocationDate: new Date(),
            },
          );
          allocationsToSave.push(allocation);

          // Update the invoice itself
          invoice.amountPaidOnInvoice =
            +invoice.amountPaidOnInvoice + amountToApplyToCurrentInvoice;

          invoice.balance = +invoice.balance - +amountToApplyToCurrentInvoice; // Decrease balance directly
          invoice.status = this.getInvoiceStatus(invoice); // Determine new status
          updatedInvoices.push(invoice); // Mark invoice for saving

          remainingPaymentAmount =
            +remainingPaymentAmount - +amountToApplyToCurrentInvoice;
        }

        // 5. Handle any Overpayment
        // if (remainingPaymentAmount > 0) {
        //   // Create a StudentCreditEntity
        //   const studentCredit = transactionalEntityManager.create(
        //     StudentCreditEntity,
        //     {
        //       student: student,
        //       amount: remainingPaymentAmount,
        //       creditDate: new Date(),
        //       description: `Overpayment from Receipt #${savedReceipt.receiptNumber}`,
        //       // You might link to the receipt or invoice as well if your credit model supports it
        //     },
        //   );
        //   await transactionalEntityManager.save(studentCredit);
        //   console.log(
        //     `Student ${student.studentNumber} has an overpayment credit of ${remainingPaymentAmount}`,
        //   );
        // }

        // 6. Save all changes within the transaction
        await transactionalEntityManager.save(updatedInvoices); // Save all updated invoices
        await transactionalEntityManager.save(allocationsToSave); // Save all allocation records

        // Load the saved receipt again, but this time eager-load its 'allocations' relation
        const finalReceipt = await transactionalEntityManager.findOne(
          ReceiptEntity,
          {
            where: { id: savedReceipt.id }, // Find by the ID of the newly saved receipt
            relations: [
              'allocations',
              'allocations.invoice',
              'student',
              'enrol',
            ], // Load the allocations and their related invoice entities
          },
        );

        if (!finalReceipt) {
          // This should ideally not happen if savedReceipt was successful
          throw new Error(
            'Failed to retrieve full receipt details after save.',
          );
        }

        return finalReceipt; // Return the fully loaded receipt
      },
    );
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
    //   const student = await this.studentsService.getStudent(studentNumber, profile);
    const receipts = await this.receiptRepository.find({
      where: {
        student: { studentNumber },
      },
      relations: ['student', 'enrol', 'allocations', 'allocations.invoice'],
    });
    console.log('got ', receipts.length);
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
  ): Promise<any> {
    const payments = await this.getPaymentsByStudent(studentNumber);
    const bills = await this.financeService.getStudentBills(studentNumber);
    const student = await this.studentsService.getStudent(
      studentNumber,
      profile,
    );

    const enrol = await this.enrolmentService.getCurrentEnrollment(
      studentNumber,
    );

    const totalPayments = payments.reduce(
      (sum, payment) => sum + Number(payment.amountPaid),
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

      balanceBfwd,
      student,
      bills,
      Number(totalBill) + Number(balanceBfwd.amount) - Number(totalPayments),
    );

    return invoice;
  }

  async saveInvoice(invoice: Invoice): Promise<InvoiceEntity> {
    const {
      totalBill,

      balanceBfwd,
      student,
      bills,

      balance,
      enrol,
      invoiceNumber,
      invoiceDate,
      invoiceDueDate,
    } = invoice;

    try {
      const foundInvoice = await this.invoiceRepository.findOne({
        where: {
          student: {
            studentNumber: student.studentNumber,
          },
          enrol: {
            num: enrol.num,
            year: enrol.year,
          },
        },
        relations: ['student', 'enrol', 'balanceBfwd', 'bills', 'bills.fees'],
      });

      if (foundInvoice) {
        foundInvoice.totalBill = totalBill;
        //if invoice is already saved, dont set keep the old balanceBfwd
        // foundInvoice.balanceBfwd = balanceBfwd;
        foundInvoice.bills = bills;
        // foundInvoice.payments = payments;
        foundInvoice.balance = balance;
        foundInvoice.invoiceNumber = invoiceNumber;
        foundInvoice.invoiceDate = invoiceDate;
        foundInvoice.invoiceDueDate = invoiceDueDate;
        return await this.invoiceRepository.save(foundInvoice);
      } else {
        const newInvoice = new InvoiceEntity();

        newInvoice.totalBill = totalBill;

        newInvoice.balanceBfwd = balanceBfwd;
        newInvoice.student = student;
        newInvoice.bills = bills;
        // newInvoice.payments = payments;
        newInvoice.balance = totalBill;
        newInvoice.enrol = enrol;
        newInvoice.invoiceNumber = invoiceNumber;
        newInvoice.invoiceDate = invoiceDate;
        newInvoice.invoiceDueDate = invoiceDueDate;
        const saved = await this.invoiceRepository.save(newInvoice);

        await this.financeService.deleteBalance(balanceBfwd);

        return saved;
      }
    } catch (error) {
      throw new NotImplementedException(
        'Could not save Invoice due to ',
        error.message,
      );
    }
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

  async getTermInvoices(num: number, year: number): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      where: {
        enrol: {
          num: num,
          year: year,
        },
      },
      relations: ['student', 'enrol', 'balanceBfwd', 'bills', 'bills.fees'],
    });
  }

  async getAllInvoices(): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      relations: ['student', 'enrol', 'balanceBfwd', 'bills', 'bills.fees'],
    });
  }

  async getStudentInvoices(studentNumber: string): Promise<InvoiceEntity[]> {
    return this.invoiceRepository.find({
      where: {
        student: {
          studentNumber: studentNumber,
        },
      },
      relations: ['student', 'enrol', 'balanceBfwd', 'bills', 'bills.fees'],
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
      relations: ['student', 'enrol', 'balanceBfwd', 'bills', 'bills.fees'],
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
      relations: ['student', 'enrol', 'balanceBfwd', 'bills', 'bills.fees'],
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
    className?: string,
    residence?: string,
  ): void {
    const lineHeight = 20;
    doc
      .font('Helvetica-Bold')
      .text(name, x, y)
      .font('Helvetica')
      .text(address, x, y + lineHeight);
    if (className && residence) {
      const valueX = doc.widthOfString('Residence: ');
      doc
        .text(`Class`, x, y + 2 * lineHeight)
        .text(`${className}`, x + valueX, y + 2 * lineHeight)

        .text(`Residence`, x, y + 3 * lineHeight)
        .text(`${residence}`, x + valueX, y + 3 * lineHeight)

        .text(`Phone`, x, y + 4 * lineHeight)
        .text(`${phone}`, x + valueX, y + 4 * lineHeight)

        .text(`Email`, x, y + 5 * lineHeight)
        .text(` ${email}`, x + valueX, y + 5 * lineHeight);
    } else {
      const valueX = doc.widthOfString('Residence: ');

      doc
        .text(`Phone`, x, y + 2 * lineHeight)
        .text(`${phone}`, x + valueX, y + 2 * lineHeight)

        .text(`Email`, x, y + 3 * lineHeight)
        .text(`${email}`, x + valueX, y + 3 * lineHeight)
        .moveDown();
    }
  }

  // Helper function to draw a table with headers and data
  drawTable(
    doc: PDFKit.PDFDocument,
    data: BillsEntity[],
    balanceBfwd: BalancesEntity,
    startX: number,
    startY: number,
    columnWidths: number[],
    headers: string[],
    headerColor = '#96d4d4',
    textColor = '#000000',
    amountAlign: 'left' | 'right' = 'left', //Added for currency alignment
  ): number {
    const rowHeight = 20;
    const headerHeight = 25;
    const borderColor = '#96d4d4';
    const font = 'Helvetica';
    const boldFont = 'Helvetica-Bold';
    const fontSize = 10;
    const headerFontSize = 10;
    const padding = 5; // Consistent padding for text inside cells

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

    // --- NEW: Draw Balance B/Fwd row if balanceBfwd.amount > 0 ---
    if (balanceBfwd && balanceBfwd.amount > 0) {
      doc.font(font).fontSize(fontSize).fillColor(textColor);

      // Draw the row rectangle/border
      doc
        .rect(
          startX,
          y,
          columnWidths.reduce((a, b) => a + b, 0),
          rowHeight,
        )
        .stroke(borderColor);

      // Column 0: Fee Description for Balance B/Fwd
      doc.text(
        'Balance B/Fwd as at ' + balanceBfwd.dateCreated.toLocaleDateString(), // Fixed description for this row
        startX + padding,
        y + rowHeight / 2 - fontSize / 2,
        {
          width: columnWidths[0] - 2 * padding,
          align: 'left',
        },
      );

      // Column 1: Amount for Balance B/Fwd
      doc.text(
        // Format the amount to 2 decimal places and add currency symbol
        `\$${balanceBfwd.amount.toFixed(2)}`,
        startX + columnWidths[0] + padding, // Start position for second column
        y + rowHeight / 2 - fontSize / 2,
        {
          width: columnWidths[1] - 2 * padding,
          align: amountAlign, // Use the new alignment parameter for amounts
        },
      );

      y += rowHeight; // Increment y to move to the next row position
    }

    // Draw table rows
    doc.font(font).fontSize(fontSize).fillColor(textColor);
    data.forEach((row) => {
      headers.forEach((header, i) => {
        let text = '';
        if (i === 0) {
          text =
            row.fees && row.fees.name !== undefined && row.fees.name !== null
              ? this.feesNamesToString(row.fees.name)
              : '';
        } else if (i === 1) {
          text =
            row.fees &&
            row.fees.amount !== undefined &&
            row.fees.amount !== null
              ? '$' + row.fees.amount.toString()
              : '';
        }

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

    doc
      .strokeColor('#000000')
      .lineWidth(2)
      .moveTo(startX, y)
      .lineTo(startX + columnWidths.reduce((a, b) => a + b, 0), y)
      .stroke();

    return y; // Return the y-coordinate of the end of the table
  }

  async generateInvoicePdf(invoiceData: InvoiceEntity): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    // Create a writeable stream
    const stream = new Stream.PassThrough();
    doc.pipe(stream);

    // --- Document Header ---
    const companyName = 'Junior High School'; // Replace
    const companyAddress = '30588 Lundi Drive, Rhodene, Masvingo'; // Replace
    const companyPhone = '+263 392 263 293 / +263 78 223 8026'; // Replace
    const companyEmail = 'info@juniorhighschool.ac.zw'; // Replace

    try {
      // Corrected path using process.cwd()
      const imgPath = path.join(process.cwd(), 'public', 'jhs_logo.jpg');
      // console.log('Attempting to load image from:', imgPath); // For debugging
      const imgBuffer = fs.readFileSync(imgPath);

      doc.image(imgBuffer, 50, 30, { width: 100 });
    } catch (e) {
      console.log('Error adding image:', e.message); // Log the error message for more detail
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
      .text(
        'INVOICE FOR TERM ' +
          invoiceData.enrol.num +
          ' ' +
          invoiceData.enrol.year,
        50,
        150,
        { align: 'left' },
      );

    // --- Invoice Details ---
    const invoiceDetailsX = 380; // Adjust
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
      .text(
        invoiceDate.toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        }),
        invoiceDetailsX + 80,
        170,
      )
      .font('Helvetica-Bold')
      .text(`Due Date:`, invoiceDetailsX, 190)
      .font('Helvetica')
      .text(
        dueDate.toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        }),
        invoiceDetailsX + 80,
        190,
      );

    // --- Bill To Address ---
    const billToName =
      invoiceData.student.surname + ' ' + invoiceData.student.name; //
    const billToAddress = invoiceData.student.studentNumber; //
    const billToPhone = invoiceData.student.cell || 'Student Cell Number'; // Replace
    const billToEmail = invoiceData.student.email || 'Student Email'; // Replace
    const className = invoiceData.enrol.name;
    const residence = invoiceData.enrol.residence;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#3185fc')
      .text('Bill To:', 50, 220)
      .font('Helvetica')
      .fillColor('#000');
    this.createAddressBlock(
      doc,
      50,
      235,
      billToName,
      billToAddress,
      billToPhone,
      billToEmail,
      className,
      residence,
    );

    // --- Invoice Summary ---
    const invoiceSummaryY = 220;
    const summaryValueX = doc.widthOfString('Amount Paid: ');
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#3185fc')
      .text('Invoice Summary:', doc.page.width / 2, invoiceSummaryY)
      .font('Helvetica')
      .fillColor('#000')
      .text(`Total Bill`, doc.page.width / 2, invoiceSummaryY + 20)
      .text(
        `\$${invoiceData.totalBill}`,
        doc.page.width / 2 + summaryValueX,
        invoiceSummaryY + 20,
      )

      .text(`Amount Paid`, doc.page.width / 2, invoiceSummaryY + 40)
      .text(
        `\$${invoiceData.amountPaidOnInvoice}`,
        doc.page.width / 2 + summaryValueX,
        invoiceSummaryY + 40,
      )

      .text(`Balance Due`, doc.page.width / 2, invoiceSummaryY + 60)
      .text(
        `\$${invoiceData.balance}`,
        doc.page.width / 2 + summaryValueX,
        invoiceSummaryY + 60,
      )

      .text(`Status`, doc.page.width / 2, invoiceSummaryY + 80)
      .fillColor('#3185fc')
      .text(
        `${invoiceData.status}`,
        doc.page.width / 2 + summaryValueX,
        invoiceSummaryY + 80,
      );

    // --- Invoice Items Table ---
    const tableStartX = 50;
    const tableStartY = 330; // Adjust
    const columnWidths = [390, 100]; // Widths for Description, Amount
    const headers = ['Fee Description', 'Amount'];
    const items = invoiceData.bills || [];

    const tableEndY = this.drawTable(
      doc,
      items,
      invoiceData.balanceBfwd,
      tableStartX,
      tableStartY,
      columnWidths,
      headers,
    );

    // --- Subtotal, Tax, Total ---
    const subtotalX =
      tableStartX + columnWidths.slice(0, -1).reduce((a, b) => a + b, 0); // Start X of the amount column
    const subtotalY = tableEndY + 20; // Position after table
    // const subtotal =
    // items.reduce((sum, item) => sum + item.fees.amount, 0) +
    // Number(invoiceData.balanceBfwd.amount); // const tax = items.reduce((sum, item) => sum + item.fees.amount, 0);
    // const total = subtotal; // For this example, total = subtotal + tax

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Total:', subtotalX - 80, subtotalY, {
        align: 'left',
        width: 70,
      });

    invoiceData.balance = Number(invoiceData.totalBill);
    doc
      .font('Helvetica')
      .text('$' + invoiceData.balance.toFixed(2), subtotalX, subtotalY, {
        align: 'left',
        width: 100,
      });

    // --- Terms and Conditions ---
    const termsAndConditions = `Terms and Conditions: Payment is due within 30 days or before schools open whichever comes first.  Please include the Student Number on your payment.
      `; // Replace

    const termsStartY = subtotalY + 20; // Adjust
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#555555')
      .text(termsAndConditions, 50, termsStartY, {
        align: 'left',
        lineGap: 8,
      });

    const bankingDetailsStartY = termsStartY + 50; // Adjust
    const accountName = 'JUNIOR HIGH SCHOOL';
    const bank = 'ZB BANK';
    const brach = 'MASVINGO';
    const accountNumber = '4564 00321642 405';

    doc
      .font('Helvetica-Bold')
      .text('BANKING DETAILS', 50, bankingDetailsStartY, {
        align: 'left',
        lineGap: 8,
      })
      .text('Account Name: ' + accountName, 50, bankingDetailsStartY + 20, {
        align: 'left',
        lineGap: 8,
      })
      .text('Bank: ' + bank, 50, bankingDetailsStartY + 40, {
        align: 'left',
        lineGap: 8,
      })
      .text('Branch: ' + brach, 50, bankingDetailsStartY + 60, {
        align: 'left',
        lineGap: 8,
      })
      .text('Account Number: ' + accountNumber, 50, bankingDetailsStartY + 80, {
        align: 'left',
        lineGap: 8,
      });

    // --- Footer ---
    const footerText = 'Thank you for your business!'; // Replace
    const footerY = bankingDetailsStartY + 100; // 20 from the bottom

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

  feesNamesToString(feesName: FeesNames) {
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

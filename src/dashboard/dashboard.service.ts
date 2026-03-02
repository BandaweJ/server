// src/dashboard/dashboard.service.ts

/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { StudentDashboardSummary } from './models/student-dashboard-summary.model';
import { PaymentService } from 'src/payment/payment.service';
import { ReportsService } from 'src/reports/reports.service';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { InvoiceStatus } from 'src/finance/models/invoice-status.enum';

@Injectable()
export class DashboardService {
  constructor(
    private paymentService: PaymentService,
    private reportsService: ReportsService,
  ) {}

  async getStudentDashboardSummary(
    studentNumber: string,
  ): Promise<StudentDashboardSummary> {
    // Fetch invoices, receipts, and reports (do not fetch balance yet).
    // NOTE: The getStudentInvoices method MUST fetch the 'enrol' relation for this to work.
    const [studentInvoices, studentReceipts, studentReports] =
      await Promise.all([
        this.paymentService.getStudentInvoices(studentNumber),
        this.paymentService.getPaymentsByStudent(studentNumber),
        this.reportsService.getStudentReports(studentNumber),
      ]);

    // Fix any invoices where stored balance disagrees with totalBill - amountPaidOnInvoice
    // (corrects timing, bugs, or legacy data so ledger and dashboard stay in sync).
    // Must run before getStudentBalance so amountOwed reflects normalized balances.
    await this.paymentService.normalizeStudentInvoiceBalances(studentInvoices);

    // Get balance after normalization so summary amountOwed is the single source of truth.
    const amountOwedResult =
      await this.paymentService.getStudentBalance(studentNumber);
    const amountOwed = amountOwedResult.amountDue;

    // --- Financial Summary ---
    const totalBilled = studentInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.totalBill),
      0,
    );
    const totalPaid = studentReceipts.reduce(
      (sum, receipt) => sum + Number(receipt.amountPaid),
      0,
    );

    // Outstanding balances by term: use same criteria as getStudentBalance (only
    // Pending / PartiallyPaid / Overdue). Use calculated balance (totalBill - amountPaidOnInvoice)
    // so display is correct even if stored balance was stale (timing/bugs/data fixes).
    const outstandingStatuses = [
      InvoiceStatus.Pending,
      InvoiceStatus.PartiallyPaid,
      InvoiceStatus.Overdue,
    ];
    const outstandingBalances = studentInvoices
      .filter((invoice) =>
        outstandingStatuses.includes(invoice.status as InvoiceStatus),
      )
      .map((invoice) => {
        const totalBill = Number(invoice.totalBill || 0);
        const amountPaid = Number(invoice.amountPaidOnInvoice || 0);
        const calculatedBalance = Math.max(
          0,
          Math.round((totalBill - amountPaid) * 100) / 100,
        );
        if (calculatedBalance <= 0) return null;
        const enrol: EnrolEntity = invoice.enrol;
        const termLabel = enrol ? `Term ${enrol.num}` : 'N/A';
        const year = enrol ? enrol.year : null;
        return {
          term: termLabel,
          year: year,
          amount: calculatedBalance,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);

    // --- Academic Summary ---
    const numberOfReportCards = studentReports.length;
    // ... (rest of academic summary logic remains the same)
    let bestPosition = null;
    let worstPosition = null;

    if (numberOfReportCards > 0) {
      const sortedReports = [...studentReports].sort(
        (a, b) => a.report.classPosition - b.report.classPosition,
      );

      const firstReport = sortedReports[0].report;
      bestPosition = {
        position: firstReport.classPosition + ' / ' + firstReport.classSize,
        term: firstReport.termNumber + '',
        year: firstReport.termYear,
        class: firstReport.className,
      };

      const lastReport = sortedReports[sortedReports.length - 1].report;
      worstPosition = {
        position: lastReport.classPosition + ' / ' + lastReport.classSize,
        term: lastReport.termNumber + '',
        year: lastReport.termYear,
        class: lastReport.className,
      };
    }

    // --- Assemble the Summary Object ---
    const studentDashboardSummary: StudentDashboardSummary = {
      studentNumber,
      financialSummary: {
        totalBilled,
        totalPaid,
        amountOwed,
        outstandingBalances, // ADDED: Include the new array
      },
      academicSummary: {
        numberOfReportCards,
        bestPosition,
        worstPosition,
      },
    };

    return studentDashboardSummary;
  }
}

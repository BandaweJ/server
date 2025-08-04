// src/dashboard/dashboard.service.ts

/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { StudentDashboardSummary } from './models/student-dashboard-summary.model';
import { PaymentService } from 'src/payment/payment.service';
import { ReportsService } from 'src/reports/reports.service';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';

@Injectable()
export class DashboardService {
  constructor(
    private paymentService: PaymentService,
    private reportsService: ReportsService,
  ) {}

  async getStudentDashboardSummary(
    studentNumber: string,
  ): Promise<StudentDashboardSummary> {
    // Fetch all necessary data concurrently using Promise.all
    // NOTE: The getStudentInvoices method MUST fetch the 'enrol' relation for this to work.
    // e.g., this.invoiceRepository.find({ where: { ... }, relations: ['enrol'] });
    const [studentInvoices, studentReceipts, studentReports, amountOwedResult] =
      await Promise.all([
        this.paymentService.getStudentInvoices(studentNumber),
        this.paymentService.getPaymentsByStudent(studentNumber),
        this.reportsService.getStudentReports(studentNumber),
        this.paymentService.getStudentBalance(studentNumber),
      ]);

    // --- Financial Summary ---
    const totalBilled = studentInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.totalBill),
      0,
    );
    const totalPaid = studentReceipts.reduce(
      (sum, receipt) => sum + Number(receipt.amountPaid),
      0,
    );
    const amountOwed = amountOwedResult.amountDue;

    // ADDED: Create an array of outstanding balances
    const outstandingBalances = studentInvoices
      .filter((invoice) => invoice.balance > 0)
      .map((invoice) => {
        // Ensure enrol data is available
        const enrol: EnrolEntity = invoice.enrol;
        // Construct the label from the enrolment data
        const termLabel = enrol ? `Term ${enrol.num}` : 'N/A';
        const year = enrol ? enrol.year : null;

        return {
          term: termLabel,
          year: year,
          amount: invoice.balance,
        };
      });

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

/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { StudentDashboardSummary } from './models/student-dashboard-summary.model';
import { PaymentService } from 'src/payment/payment.service';
import { ReportsService } from 'src/reports/reports.service';

/* eslint-disable prettier/prettier */
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
    const [studentInvoices, studentReceipts, studentReports, amountOwedResult] =
      await Promise.all([
        this.paymentService.getStudentInvoices(studentNumber),
        this.paymentService.getPaymentsByStudent(studentNumber),
        this.reportsService.getStudentReports(studentNumber),
        this.paymentService.getStudentBalance(studentNumber), // Assuming this returns { amountDue: number }
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
    // Use the amountDue from the getStudentBalance call
    const amountOwed = amountOwedResult.amountDue;

    // --- Academic Summary ---
    const numberOfReportCards = studentReports.length;
    let bestPosition = null;
    let worstPosition = null;

    if (numberOfReportCards > 0) {
      // Sort reports based on classPosition (ascending)
      // Make a copy of the array before sorting to avoid modifying the original if it's used elsewhere
      const sortedReports = [...studentReports].sort(
        (a, b) => a.report.classPosition - b.report.classPosition,
      );

      // Best position is the first element after sorting ascending
      const firstReport = sortedReports[0].report;
      bestPosition = {
        position: firstReport.classPosition + ' / ' + firstReport.classSize,
        term: firstReport.termNumber + '',
        year: firstReport.termYear,
        class: firstReport.className,
      };

      // Worst position is the last element after sorting ascending
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
      },
      academicSummary: {
        numberOfReportCards,
        bestPosition, // Will be null if no reports
        worstPosition, // Will be null if no reports
      },
    };

    return studentDashboardSummary;
  }
}

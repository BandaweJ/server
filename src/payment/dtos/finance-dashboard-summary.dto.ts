/* eslint-disable prettier/prettier */
/**
 * Optional filters for staff finance dashboard summary (query params).
 */
export interface FinanceDashboardSummaryFilters {
  startDate?: string; // ISO date
  endDate?: string;   // ISO date
  enrolTerm?: string; // e.g. "1 2026" (num + year)
  termType?: 'regular' | 'vacation';
  transactionType?: 'Invoice' | 'Payment';
}

/**
 * One month in the monthly breakdown for the chart.
 */
export interface MonthlyBreakdownItem {
  monthLabel: string;   // e.g. "Jan 2026"
  year: number;
  month: number;
  invoicesTotal: number;
  paymentsTotal: number;
}

/**
 * Staff finance dashboard summary (cards + chart).
 */
export interface FinanceDashboardSummaryDto {
  totalInvoiced: number;
  totalPayments: number;
  outstandingBalance: number;
  invoiceCount: number;
  receiptCount: number;
  totalTransactions: number;
  averageInvoiceAmount: number;
  averagePaymentAmount: number;
  collectionRate: number;
  monthlyBreakdown: MonthlyBreakdownItem[];
}

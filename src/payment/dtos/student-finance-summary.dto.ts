/* eslint-disable prettier/prettier */
/**
 * Finance-only summary for a student (no academic/reports).
 * Single source for totals and balance when student views financials.
 */
export interface StudentFinanceSummaryDto {
  totalBilled: number;
  totalPaid: number;
  amountOwed: number;
  outstandingBalances: {
    term: string;
    year: number;
    amount: number;
  }[];
}

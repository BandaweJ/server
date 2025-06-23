/* eslint-disable prettier/prettier */
export interface StudentDashboardSummary {
  studentNumber: string;
  financialSummary: {
    totalBilled: number;
    totalPaid: number;
    amountOwed: number;
  };
  academicSummary: {
    numberOfReportCards: number;
    bestPosition: {
      position: string;
      term: string;
      year: number;
      class: string;
    } | null;
    worstPosition: {
      position: string;
      term: string;
      year: number;
      class: string;
    } | null;
  };
}

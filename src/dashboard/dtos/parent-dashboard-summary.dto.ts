/* eslint-disable prettier/prettier */

export interface ChildSummaryDto {
  studentNumber: string;
  name: string;
  surname: string;
  profile: {
    studentNumber: string;
    name: string;
    surname: string;
    gender?: string;
    dob?: string;
    cell?: string;
    email?: string;
    address?: string;
  };
  enrolment: {
    className: string;
    term: number;
    year: number;
    residence: string;
  } | null;
  academics: {
    bestPosition?: { position: string; term: string; year: number; class: string };
    worstPosition?: { position: string; term: string; year: number; class: string };
    numberOfReportCards: number;
    latestAverage?: number;
  };
  finance: {
    amountOwed: number;
    totalBilled: number;
    totalPaid: number;
    creditBalance: number;
    lastReceipt?: { date: string; amount: number; receiptNumber: string };
  };
}

export interface ParentDashboardSummaryDto {
  parentId: string;
  parentName: string;
  children: ChildSummaryDto[];
}

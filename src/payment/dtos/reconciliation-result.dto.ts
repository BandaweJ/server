export class ReconciliationResultDto {
  success: boolean;
  message: string;
  studentNumber: string;
  summary: {
    invoicesProcessed: number;
    invoicesCorrected: number;
    receiptsProcessed: number;
    voidedInvoicesUnlinked: number;
    creditApplied: boolean;
    creditAmount?: number;
    creditAppliedToInvoice?: string;
    invoicesWithBalance: number;
    totalCreditBalance: number;
  };
  details?: {
    correctedInvoices?: Array<{
      invoiceNumber: string;
      overpaymentAmount: number;
      creditCreated: number;
    }>;
    creditApplication?: {
      invoiceNumber: string;
      amountApplied: number;
    };
  };
}




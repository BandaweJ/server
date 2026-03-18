import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceChargeEntity } from '../entities/invoice-charge.entity';

export class InvoiceResponseDto {
  invoice: InvoiceEntity;
  warning?: {
    message: string;
    voidedInvoiceNumber?: string;
    voidedAt?: Date;
    voidedBy?: string;
  };

  pendingCharges?: InvoiceChargeEntity[];
}

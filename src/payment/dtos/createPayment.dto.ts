/* eslint-disable prettier/prettier */
export class CreatePaymentDto {
  receiptNumber?: number;
  amount: number;
  description: string;
  paymentDate?: Date;
  studentNumber: string;
}

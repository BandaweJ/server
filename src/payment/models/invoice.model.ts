import { BillsEntity } from 'src/finance/entities/bills.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { PaymentEntity } from '../entities/payment.entity';

/* eslint-disable prettier/prettier */
export class Invoice {
  constructor(
    public student: StudentsEntity,
    public bills: BillsEntity[],
    public payments: PaymentEntity[],
    public balance: number,
  ) {}
}

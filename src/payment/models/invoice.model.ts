import { BillsEntity } from 'src/finance/entities/bills.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { BalancesEntity } from 'src/finance/entities/balances.entity';

/* eslint-disable prettier/prettier */
export class Invoice {
  constructor(
    // public balanceBfwd: BalancesEntity,
    public student: StudentsEntity,
    public bills: BillsEntity[],
    public payments: PaymentEntity[],
    public balance: number,
  ) {}
}

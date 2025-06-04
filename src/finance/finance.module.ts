/* eslint-disable prettier/prettier */
import { forwardRef, Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeesEntity } from './entities/fees.entity';
import { AuthModule } from 'src/auth/auth.module';
import { EnrolmentModule } from 'src/enrolment/enrolment.module';
import { BillsEntity } from './entities/bills.entity';
import { BalancesEntity } from './entities/balances.entity';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
  imports: [
    AuthModule,
    // EnrolmentModule,
    forwardRef(() => EnrolmentModule),
    TypeOrmModule.forFeature([FeesEntity, BillsEntity, BalancesEntity]),
  ],
})
export class FinanceModule {}

/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeesEntity } from './entities/fees.entity';
import { AuthModule } from 'src/auth/auth.module';
import { EnrolmentModule } from 'src/enrolment/enrolment.module';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
  imports: [
    AuthModule,
    EnrolmentModule,
    TypeOrmModule.forFeature([FeesEntity]),
  ],
})
export class FinanceModule {}

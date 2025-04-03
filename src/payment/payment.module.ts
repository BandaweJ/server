import { ProfilesModule } from './../profiles/profiles.module';
/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { AuthModule } from 'src/auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from './entities/payment.entity';
import { EnrolmentModule } from 'src/enrolment/enrolment.module';
import { FinanceModule } from 'src/finance/finance.module';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
  imports: [
    AuthModule,
    ProfilesModule,
    EnrolmentModule,
    FinanceModule,
    ProfilesModule,
    TypeOrmModule.forFeature([PaymentEntity]),
  ],
})
export class PaymentModule {}

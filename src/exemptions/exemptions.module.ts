/* eslint-disable prettier/prettier */
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { ExemptionEntity } from 'src/exemptions/entities/exemptions.entity';
import { ExemptionsController } from './exemptions.controller';
import { ProfilesModule } from 'src/profiles/profiles.module';
import { PaymentModule } from 'src/payment/payment.module';
import { ExemptionService } from './exemptions.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([ExemptionEntity]),
    ProfilesModule,
    forwardRef(() => PaymentModule),
  ],
  controllers: [ExemptionsController],
  providers: [ExemptionService],
  exports: [ExemptionService],
})
export class ExemptionsModule {}

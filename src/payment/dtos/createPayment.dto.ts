/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { PaymentMethods } from 'src/finance/models/payment-methods.model';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { SanitizeAmount } from '../decorators/sanitize-amount.decorator';

/* eslint-disable prettier/prettier */
export class CreateReceiptDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  @SanitizeAmount()
  amountPaid: number;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentNumber: string;

  @ApiProperty({ enum: PaymentMethods, enumName: 'PaymentMethods' })
  @IsEnum(PaymentMethods)
  paymentMethod: PaymentMethods;
}

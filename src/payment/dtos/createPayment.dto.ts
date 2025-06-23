/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { PaymentMethods } from 'src/finance/models/payment-methods.model';
import { StudentsEntity } from 'src/profiles/entities/students.entity';

/* eslint-disable prettier/prettier */
export class CreateReceiptDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
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

/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
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
  @IsString()
  receiptNumber: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  receiptBookNumber?: string;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  amountPaid: number;

  @ApiProperty()
  @IsNumber()
  amountDue: number;

  @ApiProperty()
  @IsNumber()
  amountOutstanding: number;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({})
  @IsDateString()
  paymentDate: Date;

  @ApiProperty()
  student: StudentsEntity;

  @ApiProperty({ enum: PaymentMethods, enumName: 'PaymentMethods' })
  @IsEnum(PaymentMethods)
  paymentMethod: PaymentMethods;

  @ApiProperty()
  @IsString()
  servedBy: string;

  @ApiProperty()
  enrol: EnrolEntity;
}

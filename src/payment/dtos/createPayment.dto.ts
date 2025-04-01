/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { StudentsEntity } from 'src/profiles/entities/students.entity';

/* eslint-disable prettier/prettier */
export class CreatePaymentDto {
  @ApiProperty()
  @IsOptional()
  @IsNumber()
  receiptNumber?: number;

  @ApiProperty()
  receiptBookNumber?: string;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({})
  paymentDate?: Date;

  @ApiProperty()
  student: StudentsEntity;
}

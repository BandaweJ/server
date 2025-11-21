/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsEnum, IsString } from 'class-validator';
import { CreditTransactionType } from '../entities/credit-transaction.entity';

export class CreditTransactionQueryDto {
  @ApiProperty({
    description: 'Start date for filtering transactions (ISO date string)',
    required: false,
    example: '2025-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'End date for filtering transactions (ISO date string)',
    required: false,
    example: '2025-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Filter by transaction type',
    enum: CreditTransactionType,
    required: false,
  })
  @IsOptional()
  @IsEnum(CreditTransactionType)
  transactionType?: CreditTransactionType;

  @ApiProperty({
    description: 'Filter by user who performed the transaction',
    required: false,
  })
  @IsOptional()
  @IsString()
  performedBy?: string;
}



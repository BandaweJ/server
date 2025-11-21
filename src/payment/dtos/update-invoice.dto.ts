/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateBillDto } from 'src/finance/dtos/bills.dto';

/**
 * DTO for updating an existing invoice
 * This replaces the Invoice model class to use InvoiceEntity as the single source of truth
 * 
 * All fields are optional - only provide the fields you want to update.
 */
export class UpdateInvoiceDto {
  @ApiProperty({ 
    description: 'Array of bills to update in the invoice', 
    type: [CreateBillDto], 
    required: false,
    example: [
      {
        student: { studentNumber: 'STU001' },
        fees: { id: 1 },
        enrol: { id: 1 }
      }
    ]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBillDto)
  bills?: CreateBillDto[];

  @ApiProperty({ 
    description: 'Optional due date for the invoice (ISO date string)', 
    required: false,
    example: '2024-12-31T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  invoiceDueDate?: string;

  @ApiProperty({ 
    description: 'Optional invoice date (ISO date string)', 
    required: false,
    example: '2024-01-15T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;
}



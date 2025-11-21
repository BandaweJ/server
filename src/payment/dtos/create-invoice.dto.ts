/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateBillDto } from 'src/finance/dtos/bills.dto';
import { BillsEntity } from 'src/finance/entities/bills.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { BalancesEntity } from 'src/finance/entities/balances.entity';
import { SanitizeAmount } from '../decorators/sanitize-amount.decorator';

/**
 * DTO for creating/updating an invoice
 * This replaces the Invoice model class to use InvoiceEntity as the single source of truth
 * 
 * Supports both ID-based (recommended) and entity-based (backward compatibility) approaches:
 * - ID-based: Use studentNumber, termNum, year, and CreateBillDto[] for bills
 * - Entity-based: Use full entity objects (for backward compatibility with existing frontend)
 * 
 * The service will handle both approaches and load entities from IDs when needed.
 */
export class CreateInvoiceDto {
  // ID-based approach (recommended)
  @ApiProperty({ 
    description: 'Student number (use this instead of student entity for new code)',
    example: 'STU001',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  studentNumber?: string;

  @ApiProperty({ 
    description: 'Term number (use this instead of enrol entity for new code)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  termNum?: number;

  @ApiProperty({ 
    description: 'Academic year (use this instead of enrol entity for new code)',
    example: 2024,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  year?: number;

  // Entity-based approach (backward compatibility)
  @ApiProperty({ 
    description: 'Student entity (for backward compatibility - use studentNumber instead for new code)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  student?: StudentsEntity;

  @ApiProperty({ 
    description: 'Enrolment entity (for backward compatibility - use termNum/year instead for new code)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  enrol?: EnrolEntity;

  // Bills - supports both CreateBillDto (recommended) and BillsEntity (backward compatibility)
  @ApiProperty({ 
    description: 'Array of bills using CreateBillDto (recommended) or BillsEntity (backward compatibility)',
    type: [CreateBillDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  // Removed @ValidateNested and @Type to allow full bill objects from frontend
  // The service will handle validation and transformation
  bills?: CreateBillDto[] | BillsEntity[];

  @ApiProperty({ description: 'Balance brought forward entity', required: false })
  @IsOptional()
  @IsObject()
  balanceBfwd?: BalancesEntity;

  @ApiProperty({ description: 'Total bill amount (calculated automatically if not provided)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @SanitizeAmount()
  totalBill?: number;

  @ApiProperty({ description: 'Balance amount (calculated automatically if not provided)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @SanitizeAmount()
  balance?: number;

  @ApiProperty({ description: 'Optional due date for the invoice', required: false })
  @IsOptional()
  @IsDateString()
  invoiceDueDate?: string | Date;

  @ApiProperty({ description: 'Optional invoice date', required: false })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string | Date;

  @ApiProperty({ description: 'Optional invoice number (will be auto-generated if not provided)', required: false })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiProperty({ description: 'Optional invoice ID (for updates)', required: false })
  @IsOptional()
  @IsNumber()
  id?: number;
}


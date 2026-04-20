import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class BulkClassInvoiceRequestDto {
  @ApiProperty({
    description:
      'Optional term id. When omitted, term is resolved from num and year path params.',
    required: false,
    example: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  termId?: number;

  @ApiProperty({
    description: 'When true, validates and previews without creating invoices.',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class BulkClassInvoiceStudentResultDto {
  @ApiProperty()
  studentNumber: string;

  @ApiProperty({ required: false })
  studentName?: string;

  @ApiProperty()
  success: boolean;

  @ApiProperty({ required: false })
  invoiceNumber?: string;

  @ApiProperty({ required: false })
  termType?: 'regular' | 'vacation';

  @ApiProperty({ required: false })
  residence?: string;

  @ApiProperty({ required: false })
  error?: string;
}

export class BulkClassInvoiceResponseDto {
  @ApiProperty()
  className: string;

  @ApiProperty()
  termNum: number;

  @ApiProperty()
  year: number;

  @ApiProperty()
  termType: 'regular' | 'vacation';

  @ApiProperty()
  totalStudents: number;

  @ApiProperty()
  successCount: number;

  @ApiProperty()
  failureCount: number;

  @ApiProperty({ type: [BulkClassInvoiceStudentResultDto] })
  results: BulkClassInvoiceStudentResultDto[];
}

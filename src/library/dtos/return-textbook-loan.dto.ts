import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class ReturnTextbookLoanDto {
  @IsString()
  @IsNotEmpty()
  loanId: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string | null;
}


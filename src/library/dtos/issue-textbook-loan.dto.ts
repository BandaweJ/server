import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class IssueTextbookLoanDto {
  @IsString()
  @IsNotEmpty()
  copyId: string;

  @IsString()
  @IsNotEmpty()
  studentNumber: string;

  @IsDateString()
  dueAt: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string | null;
}


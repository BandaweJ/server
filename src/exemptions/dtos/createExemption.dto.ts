/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ExemptionType } from '../enums/exemptions-type.enum';

/* eslint-disable prettier/prettier */
export class CreateExemptionDto {
  @IsString()
  @IsNotEmpty()
  studentNumber: string;

  @IsNotEmpty()
  type: ExemptionType;

  @IsNumber()
  @IsOptional()
  fixedAmount?: number;

  @IsNumber()
  @IsOptional()
  percentageAmount?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  isActive?: boolean;
}

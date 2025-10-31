/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ExemptionType } from '../enums/exemptions-type.enum';

export class UpdateExemptionDto {
  @IsNotEmpty()
  type?: ExemptionType;

  @IsNumber()
  @IsOptional()
  fixedAmount?: number;

  @IsNumber()
  @IsOptional()
  percentageAmount?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}


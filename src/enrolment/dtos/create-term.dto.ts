import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TermType } from '../models/term-type.enum';

export class CreateTermDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  num: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  year: number;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  startDate: Date;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  endDate: Date;

  @ApiProperty({ enum: TermType, required: false, default: TermType.REGULAR })
  @IsOptional()
  @IsEnum(TermType)
  type?: TermType;

  @ApiProperty({ required: false, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

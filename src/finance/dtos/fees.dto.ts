/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Residence } from 'src/enrolment/models/residence.model';
import { FeesNames } from '../models/fees-names.enum';

/* eslint-disable prettier/prettier */
export class CreateFeesDto {
  @ApiProperty()
  @IsOptional()
  id?: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  name: FeesNames;
}

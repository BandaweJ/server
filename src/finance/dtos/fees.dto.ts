import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Residence } from 'src/enrolment/models/residence.model';

/* eslint-disable prettier/prettier */
export class CreateFeesDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  num: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  year: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  residence: Residence;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;
}

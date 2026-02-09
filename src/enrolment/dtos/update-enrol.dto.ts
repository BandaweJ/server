/* eslint-disable prettier/prettier */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { EnrolDto } from './enrol.dto';

export class UpdateEnrolDto extends PartialType(EnrolDto) {
  @ApiPropertyOptional({ description: 'Enrolment id - when provided, used to find the record to update (allows changing class name)' })
  @IsOptional()
  @IsNumber()
  id?: number;
}

/* eslint-disable prettier/prettier */
import { IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportsModel } from '../models/reports.model';

export class TeacherCommentDto {
  @IsString()
  @IsNotEmpty()
  comment: string;

  // Full report wrapper so we can persist using ReportsEntity
  @ValidateNested()
  @Type(() => Object) // Use Object since ReportsModel is a class, not a DTO
  @IsNotEmpty()
  report: ReportsModel;
}




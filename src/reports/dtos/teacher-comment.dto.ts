/* eslint-disable prettier/prettier */
import { IsString, IsNotEmpty, IsObject } from 'class-validator';
import { ReportsModel } from '../models/reports.model';

export class TeacherCommentDto {
  @IsString()
  @IsNotEmpty()
  comment: string;

  // Full report wrapper so we can persist using ReportsEntity
  // Note: We use @IsObject() instead of @ValidateNested() because ReportsModel
  // is not a DTO with validation decorators. Detailed validation is done in the service.
  @IsObject()
  @IsNotEmpty()
  report: ReportsModel;
}




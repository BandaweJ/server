/* eslint-disable prettier/prettier */
import { IsString } from 'class-validator';
import { ReportsModel } from '../models/reports.model';

export class TeacherCommentDto {
  @IsString()
  comment: string;

  // Full report wrapper so we can persist using ReportsEntity
  report: ReportsModel;
}



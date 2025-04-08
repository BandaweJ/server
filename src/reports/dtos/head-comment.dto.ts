/* eslint-disable prettier/prettier */
import { IsString } from 'class-validator';
import { ReportModel } from '../models/report.model';
import { ReportsModel } from '../models/reports.model';

export class HeadCommentDto {
  @IsString()
  comment: string;

  report: ReportsModel;
}

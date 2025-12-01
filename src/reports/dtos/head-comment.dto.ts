/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { ReportModel } from '../models/report.model';
import { ReportsModel } from '../models/reports.model';

export class HeadCommentDto {
  @IsString()
  comment: string;

  @IsNotEmpty()
  report: ReportsModel;
  
  // Validate that report.id exists (report must be saved first)
  get reportId(): number | undefined {
    return this.report?.id;
  }
}

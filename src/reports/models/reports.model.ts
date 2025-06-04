/* eslint-disable prettier/prettier */
import { ReportModel } from './report.model';

export class ReportsModel {
  id?: number;
  num: number;
  name: string;
  year: number;
  studentNumber: string;
  report: ReportModel;
  examType?: string;
}

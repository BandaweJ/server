import { ReportModel } from './report.model';

export class ReportsModel {
  id?: number;
  termId?: number;
  num: number;
  name: string;
  year: number;
  studentNumber: string;
  report: ReportModel;
  examType?: string;
}

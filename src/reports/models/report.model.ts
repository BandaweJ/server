/* eslint-disable prettier/prettier */
import { SubjectInfoModel } from './subject-info.model';
export class ReportModel {
  studentNumber: string;
  name: string;
  surname: string;
  classPosition: number;
  formPosition: number;
  className: string;
  termNumber: number;
  termYear: number;
  points?: number;
  percentageAverge: number;
  title: string;
  percentageMark: number;
  classTrComment: string;
  headComment: string;
  subjectsTable: SubjectInfoModel[];
  classSize: number;
  subjectsPassed: number;
  symbols: number[];
  // eslint-disable-next-line prettier/prettier
  examType?: string;
}

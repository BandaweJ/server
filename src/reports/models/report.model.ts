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
  symbols: { [key: string]: number } = {
    as: 0,
    bs: 0,
    cs: 0,
    ds: 0,
  };
}

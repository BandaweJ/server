import { IsIn, IsNotEmpty, IsObject } from 'class-validator';
import { ReportsModel } from '../models/reports.model';

export class GenerateRoleCommentDto {
  @IsIn(['formTeacher', 'headTeacher'])
  role: 'formTeacher' | 'headTeacher';

  @IsObject()
  @IsNotEmpty()
  report: ReportsModel;
}


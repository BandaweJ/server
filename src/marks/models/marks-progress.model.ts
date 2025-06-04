import { SubjectsEntity } from '../entities/subjects.entity';

/* eslint-disable prettier/prettier */
export class MarksProgressModel {
  className: string;
  totalStudents: number;
  marksEntered: number;
  subject: SubjectsEntity;
  progress: number; //percentage
}

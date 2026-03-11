import { SubjectsEntity } from '../entities/subjects.entity';

export class MarksProgressModel {
  className: string;
  totalStudents: number;
  marksEntered: number;
  subject: SubjectsEntity;
  progress: number; //percentage
}

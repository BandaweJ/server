import { EnrolEntity } from '../entities/enrol.entity';

export class StudentEnrolmentDto {
  id: number;
  name: string;
  num: number;
  year: number;
  residence: string;

  static fromEntity(enrol: EnrolEntity): StudentEnrolmentDto {
    return {
      id: enrol.id,
      name: enrol.name,
      num: enrol.num,
      year: enrol.year,
      residence: enrol.residence,
    };
  }
}

export class StudentEnrolmentStatusDto {
  currentEnrolment: StudentEnrolmentDto | null;
  lastEnrolment: StudentEnrolmentDto | null;
  isCurrentlyEnrolled: boolean;
  enrolments: StudentEnrolmentDto[];
}


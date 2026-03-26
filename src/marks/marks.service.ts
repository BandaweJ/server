import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MarksEntity } from './entities/marks.entity';
import { Repository } from 'typeorm';
import { SubjectsEntity } from './entities/subjects.entity';
import { CreateMarkDto } from './dtos/create-mark.dto';
import { ResourceByIdService } from '../resource-by-id/resource-by-id.service';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { ROLES } from '../auth/models/roles.enum';
import { UnauthorizedException } from '@nestjs/common';
import { CreateSubjectDto } from './dtos/create-subject.dto';
import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { TeacherCommentEntity } from './entities/teacher-comments.entity';
import { MarksProgressModel } from './models/marks-progress.model';

@Injectable()
export class MarksService {
  constructor(
    @InjectRepository(MarksEntity)
    private marksRepository: Repository<MarksEntity>,
    @InjectRepository(TeacherCommentEntity)
    private teacherCommentRepository: Repository<TeacherCommentEntity>,
    @InjectRepository(SubjectsEntity)
    private subjectsRepository: Repository<SubjectsEntity>,
    private resourceById: ResourceByIdService,
    private enrolmentService: EnrolmentService,
  ) {}

  async createSubject(
    createSubjectDto: CreateSubjectDto,
    profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ): Promise<SubjectsEntity> {
    // console.log(profile);

    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher:
        throw new UnauthorizedException(
          'Only Admins allowed to create new subjects',
        );
    }

    return await this.subjectsRepository.save(createSubjectDto);
  }

  async getAllSubjects(): Promise<SubjectsEntity[]> {
    return await this.subjectsRepository.find();
  }

  async getOneSubject(subjectCode: string): Promise<SubjectsEntity> {
    const subject = await this.subjectsRepository.findOne({
      where: {
        code: subjectCode,
      },
    });

    if (!subject) {
      throw new NotFoundException(
        `Subject with code: ${subjectCode} not found`,
      );
    }

    return subject;
  }

  async deleteSubject(
    code: string,
    profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ): Promise<{ code: string }> {
    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher:
        throw new UnauthorizedException('Only Admins can delete subjects');
    }

    const result = await this.subjectsRepository.delete(code);

    if (!result.affected) {
      throw new NotImplementedException(
        `Subject with code ${code} not deleted`,
      );
    }

    return { code };
  }

  async editSubject(subject: CreateSubjectDto): Promise<SubjectsEntity> {
    return await this.subjectsRepository.save({
      ...subject,
    });
  }

  async createMark(
    createMarkDto: CreateMarkDto,
    profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ): Promise<MarksEntity> {
    switch (profile.role) {
      case ROLES.student:
      case ROLES.parent:
      case ROLES.reception: {
        throw new UnauthorizedException('You are not allowed to enter marks');
      }
    }

    const { num, year, termId, name, mark, comment, subject, student, examType } =
      createMarkDto;

    const matches = await this.marksRepository.find({
      where: {
        num,
        year,
        ...(termId ? { termId } : {}),
        name,
        examType,
        subject: { code: subject.code },
        student: { studentNumber: student.studentNumber },
      },
      relations: ['student', 'subject'],
    });

    if (matches.length > 0) {
      // Update the oldest existing row and remove accidental duplicates.
      const [canonical, ...duplicates] = [...matches].sort((a, b) => a.id - b.id);
      canonical.mark = mark;
      canonical.comment = comment;

      const updated = await this.marksRepository.save(canonical);

      if (duplicates.length > 0) {
        await this.marksRepository.delete(duplicates.map((d) => d.id));
      }

      return updated;
    } else {
      //new mark
      const record = new MarksEntity();
      record.num = num;
      record.year = year;
      record.termId = termId ?? null;
      record.name = name;
      record.mark = mark;
      record.comment = comment;
      record.subject = subject;
      record.student = student;
      record.examType = examType; //all new marks have examtype set
      // console.log('new mark ', record);

      try {
        await this.marksRepository.save(record);
        return record;
      } catch (err) {
        throw new NotImplementedException(err);
      }
    }
  }

  async getAllMarks(
    profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ): Promise<MarksEntity[]> {
    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student: {
        throw new UnauthorizedException(
          'You are not allowed to access all marks',
        );
      }
    }
    return await this.marksRepository.find({
      relations: ['student', 'subject'],
    });
  }

  async getMarksbyClass(
    num: number,
    year: number,
    name: string,
    examType: string,
    profile: StudentsEntity | ParentsEntity | TeachersEntity,
    termId?: number,
  ): Promise<MarksEntity[]> {
    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student: {
        throw new UnauthorizedException('You are not allowed');
      }
    }

    if (examType) {
      return await this.marksRepository.find({
        where: {
          num,
          year,
          ...(termId ? { termId } : {}),
          name,
          examType,
        },
        relations: ['subject', 'student'],
      });
    }
    // else
    //   return await this.marksRepository.find({
    //     where: {
    //       num,
    //       year,
    //       name,
    //     },
    //     relations: ['subject', 'student'],
    //   });
  }

  async getSubjectMarksInClass(
    num: number,
    year: number,
    name: string,
    subjectCode: string,
    examType: string,
    profile: StudentsEntity | ParentsEntity | TeachersEntity,
    termId?: number,
  ): Promise<MarksEntity[]> {
    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student: {
        throw new UnauthorizedException('You are not authorised');
      }
    }

    // const updated = await this.marksRepository.update(
    //   { num: 2, year: 2024 },
    //   { examType: 'Mid Term' },
    // );

    // console.log('Updated marks', updated.affected);
    // console.log('Always getSubjectMarksInClass called');

    const subject = await this.getOneSubject(subjectCode); //get the subject

    const classlist = await this.enrolmentService.getEnrolmentByClass(
      //get the list of students in the class
      name,
      num,
      year,
      termId,
    );

    let foundMarks: MarksEntity[] = []; //array to store the marks currently saved for the subject and class

    if (examType) {
      foundMarks = await this.marksRepository.find({
        where: {
          num,
          name,
          year,
          ...(termId ? { termId } : {}),
          examType,
        },
        relations: ['subject', 'student'],
      });
    } else
      foundMarks = await this.marksRepository.find({
        where: {
          num,
          name,
          year,
          ...(termId ? { termId } : {}),
        },
        relations: ['subject', 'student'],
      });

    const subjectMarks = foundMarks.filter(
      //filter the marks to remain with those of the concerned
      (mark) => mark.subject.code === subjectCode,
    );

    const classSubjectMarks: MarksEntity[] = [];

    classlist.map((enrol) => {
      const mark = new MarksEntity();

      mark.num = num;
      mark.name = name;
      mark.year = year;
      mark.termId = termId ?? null;
      mark.student = enrol.student;
      mark.subject = subject;
      if (examType) {
        mark.examType = examType;
      }

      classSubjectMarks.push(mark);
    });

    classSubjectMarks.map((mark) => {
      subjectMarks.map((mrk) => {
        if (mark.student.studentNumber === mrk.student.studentNumber) {
          mark.mark = mrk.mark;
          mark.comment = mrk.comment;
          mark.id = mrk.id;
          // mark.examType = mrk.examType;
        }
      });
    });

    // console.log(classSubjectMarks[0]);

    return classSubjectMarks;
  }

  async getStudentMarks(studentNumber: string): Promise<MarksEntity[]> {
    return await this.marksRepository.find({
      where: { student: { studentNumber } },
      relations: ['subject', 'student'],
    });
  }

  async deleteMark(
    id: number,
    profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ): Promise<MarksEntity> {
    switch (profile.role) {
      case ROLES.student:
      case ROLES.parent: {
        throw new UnauthorizedException('You are not authorised to edit marks');
      }
    }

    const mark = await this.marksRepository.findOne({
      where: {
        id,
      },
      relations: ['subject', 'student'],
    });

    if (mark) {
      const result = await this.marksRepository.delete(id);

      if (result.affected) {
        mark.comment = null;
        mark.mark = null;
        return mark;
      }
    }
  }

  async getPerfomanceData(
    num: number,
    year: number,
    name: string,
    examType: string,
    termId?: number,
  ) {
    let marks: MarksEntity[] = [];

    if (examType)
      marks = await this.marksRepository.find({
        where: {
          num,
          name,
          year,
          ...(termId ? { termId } : {}),
          examType,
        },
        relations: ['student', 'subject'],
      });
    else
      marks = await this.marksRepository.find({
        where: {
          num,
          name,
          year,
          ...(termId ? { termId } : {}),
        },
        relations: ['student', 'subject'],
      });

    // const subjectsSet = new Set<SubjectsEntity>();
    const subjectsArray: SubjectsEntity[] = [];

    marks.map((mark) => {
      // subjectsSet.add(mark.subject);
      if (!subjectsArray.find((subj) => subj.code === mark.subject.code)) {
        subjectsArray.push(mark.subject);
      }
    });

    const subjectMarks: Array<MarksEntity[]> = [];
    const markArray: Array<number[]> = [];

    // subjectsArray = Array.from(subjectsSet);

    subjectsArray.map((subject) => {
      const subjectMarksArray: MarksEntity[] = marks.filter(
        (mark) => mark.subject.code === subject.code,
      );

      const arr = [];
      const marksArr = [];

      subjectMarksArray.map((mrk) => {
        const { name, mark, comment, student } = mrk;
        const topush = {
          name,
          mark,
          comment,
          studentName: student.name + ' ' + student.surname,
        };
        arr.push(topush);
        marksArr.push(mark);
      });

      // subjectMarks.push(subjectMarksArray);
      subjectMarks.push(arr);
      markArray.push(marksArr);
    });

    let xAxesLabels = [];
    for (let i = 0; i < markArray.length; i++) {
      if (markArray[i].length > xAxesLabels.length) {
        xAxesLabels = [...markArray[i]];
      }
    }

    for (let j = 0; j < xAxesLabels.length; j++) {
      xAxesLabels[j] = j + 1;
    }

    return {
      subjects: subjectsArray,
      subjectsMarks: subjectMarks,
      marks: markArray,
      xAxes: xAxesLabels,
      // subjectMarks: subjMrksArr,
    };
  }

  async fetchMarksProgress(
    num: number,
    year: number,
    clas: string,
    examType: string,
    profile: TeachersEntity,
    termId?: number,
  ): Promise<any[]> {
    const marks = await this.getMarksbyClass(
      num,
      year,
      clas,
      examType,
      profile,
      termId,
    );

    // Group by subject code to avoid conflating similarly named subjects.
    const subjectCodes = Array.from(
      new Set<string>(marks.map((mark) => mark.subject.code)),
    );

    const marksProgress: MarksProgressModel[] = [];

    const clasEnrolment = await this.enrolmentService.getEnrolmentByClass(
      clas,
      num,
      year,
      termId,
    );

    subjectCodes.forEach((subjectCode) => {
      const marksForSubject = marks.filter(
        (mark) => mark.subject.code === subjectCode,
      );
      const marksProgressItem: MarksProgressModel = {
        subject: marks.find((mark) => mark.subject.code === subjectCode).subject,
        marksEntered: marksForSubject.length,
        totalStudents: clasEnrolment.length,
        progress: (marksForSubject.length / clasEnrolment.length) * 100,
        className: clas,
      };
      marksProgress.push(marksProgressItem);
    });

    // marksProgress.sort((a, b) => {
    //   if (a.subject.code < b.subject.code) {
    //     return -1;
    //   } else if (a > b) {
    //     return 1;
    //   }
    //   return 0;
    // });

    // console.log(marksProgress[1]);

    return marksProgress;
  }

  async getSubjectEntryDiagnostics(
    num: number,
    year: number,
    name: string,
    subjectCode: string,
    examType: string,
    profile: StudentsEntity | ParentsEntity | TeachersEntity,
    termId?: number,
  ): Promise<{
    filters: {
      num: number;
      year: number;
      termId: number | null;
      className: string;
      subjectCode: string;
      examType: string;
    };
    subject: { code: string; name: string };
    totals: {
      enrolled: number;
      entered: number;
      missing: number;
    };
    enteredStudents: Array<{
      markId: number;
      studentNumber: string;
      studentName: string;
      mark: number;
      comment: string;
      savedAt: Date;
    }>;
    missingStudents: Array<{
      studentNumber: string;
      studentName: string;
    }>;
  }> {
    switch (profile.role) {
      case ROLES.admin:
      case ROLES.dev:
        break;
      default: {
        throw new UnauthorizedException('You are not allowed');
      }
    }

    const subject = await this.getOneSubject(subjectCode);
    const enrolments = await this.enrolmentService.getEnrolmentByClass(
      name,
      num,
      year,
      termId,
    );

    const marks = await this.marksRepository.find({
      where: {
        num,
        year,
        name,
        examType,
        ...(termId ? { termId } : {}),
        subject: { code: subjectCode },
      },
      relations: ['student', 'subject'],
      order: { date: 'DESC' },
    });

    // Keep one canonical row per student (newest) to avoid duplicate inflation.
    const byStudent = new Map<string, MarksEntity>();
    marks.forEach((entry) => {
      const studentNumber = entry.student?.studentNumber;
      if (!studentNumber || byStudent.has(studentNumber)) {
        return;
      }
      byStudent.set(studentNumber, entry);
    });

    const enteredStudents = Array.from(byStudent.values()).map((entry) => ({
      markId: entry.id,
      studentNumber: entry.student.studentNumber,
      studentName: `${entry.student.name} ${entry.student.surname}`,
      mark: entry.mark,
      comment: entry.comment,
      savedAt: entry.date,
    }));

    const enrolledByStudent = new Map(
      enrolments
        .filter((enrol) => !!enrol.student?.studentNumber)
        .map((enrol) => [enrol.student.studentNumber, enrol.student] as const),
    );

    const missingStudents = Array.from(enrolledByStudent.entries())
      .filter(([studentNumber]) => !byStudent.has(studentNumber))
      .map(([studentNumber, student]) => ({
        studentNumber,
        studentName: `${student.name} ${student.surname}`,
      }));

    return {
      filters: {
        num,
        year,
        termId: termId ?? null,
        className: name,
        subjectCode,
        examType,
      },
      subject: {
        code: subject.code,
        name: subject.name,
      },
      totals: {
        enrolled: enrolments.length,
        entered: enteredStudents.length,
        missing: missingStudents.length,
      },
      enteredStudents,
      missingStudents,
    };
  }
}

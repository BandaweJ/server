import {
  BadRequestException,
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
import { CommentDto } from './dtos/comment.dto';
import { TeacherCommentEntity } from './entities/teacher-comments.entity';

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

    const { num, year, name, mark, comment, subject, student, id, examType } =
      createMarkDto;

    if (id) {
      //edited mark
      const found = await this.marksRepository.findOne({
        where: { id },
        relations: ['student', 'subject'],
      });

      if (found) {
        //update the mark and comment only
        found.mark = mark;
        found.comment = comment;

        const result = await this.marksRepository.update(id, {
          mark,
          comment,
        });

        if (result.affected) {
          return found;
        }
      }
    } else {
      //new mark
      const record = new MarksEntity();
      record.num = num;
      record.year = year;
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
          name,
          examType,
        },
        relations: ['subject', 'student'],
      });
    }

    return await this.marksRepository.find({
      where: {
        num,
        year,
        name,
      },
      relations: ['subject', 'student'],
    });
  }

  async getSubjectMarksInClass(
    num: number,
    year: number,
    name: string,
    subjectCode: string,
    examType: string,
    profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ): Promise<MarksEntity[]> {
    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student: {
        throw new UnauthorizedException('You are not authorised');
      }
    }

    const subject = await this.getOneSubject(subjectCode);

    const classlist = await this.enrolmentService.getEnrolmentByClass(
      name,
      num,
      year,
    );

    let foundMarks: MarksEntity[] = [];

    if (examType)
      foundMarks = await this.marksRepository.find({
        where: {
          num,
          name,
          year,
          examType,
        },
        relations: ['subject', 'student'],
      });
    else
      foundMarks = await this.marksRepository.find({
        where: {
          num,
          name,
          year,
        },
        relations: ['subject', 'student'],
      });

    const subjectMarks = foundMarks.filter(
      (mark) => mark.subject.code === subjectCode,
    );

    const classSubjectMarks: MarksEntity[] = [];

    classlist.map((enrol) => {
      const mark = new MarksEntity();

      mark.num = num;
      mark.name = name;
      mark.year = year;
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
  ) {
    let marks: MarksEntity[] = [];

    if (examType)
      marks = await this.marksRepository.find({
        where: {
          num,
          name,
          year,
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

  async createComment(
    commentDto: CommentDto,
    profile: TeachersEntity,
  ): Promise<TeacherCommentEntity> {
    switch (profile.role) {
      case ROLES.student:
      case ROLES.parent:
        throw new UnauthorizedException(
          'You are not authorised to enter comments',
        );
    }

    const { comment, name, num, year, student, id, examType } = commentDto;

    // ....................

    if (id) {
      //edited comment
      const found = await this.teacherCommentRepository.findOne({
        where: { id },
        relations: ['student', 'teacher'],
      });

      if (found) {
        found.comment = comment;

        const result = await this.teacherCommentRepository.update(id, {
          comment,
        });

        if (result.affected) {
          return found;
        }
      }
    } else {
      //new comment
      let cmmnt: TeacherCommentEntity = new TeacherCommentEntity();

      cmmnt.comment = comment;
      cmmnt.name = name;
      cmmnt.num = num;
      cmmnt.year = year;
      cmmnt.teacher = profile;
      cmmnt.student = student;
      if (examType) {
        cmmnt.examType = examType;
      }

      return await this.teacherCommentRepository.save(cmmnt);
    }

    // .....................
  }

  // async fetchClassComments(
  //   name: string,
  //   num: number,
  //   year: number,
  //   profile: TeachersEntity,
  // ) {
  //   switch (profile.role) {
  //     case ROLES.student:
  //     case ROLES.parent:
  //       throw new UnauthorizedException(
  //         'You are not authorised to view comments',
  //       );
  //   }

  //   return await this.teacherCommentRepository.find({
  //     where: {
  //       name,
  //       num,
  //       year,
  //     },
  //     relations: ['teacher', 'student'],
  //   });
  // }

  async fetchClassComments(
    name: string,
    num: number,
    year: number,
    examType: string,
    profile: TeachersEntity,
  ): Promise<TeacherCommentEntity[]> {
    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student: {
        throw new UnauthorizedException('You are not authorised');
      }
    }

    // const subject = await this.getOneSubject(subjectCode);
    //get class list for the term
    const classlist = await this.enrolmentService.getEnrolmentByClass(
      name,
      num,
      year,
    );

    //get comments for this term and for this particular exam
    let foundComments: TeacherCommentEntity[] = [];
    if (examType)
      foundComments = await this.teacherCommentRepository.find({
        where: {
          num,
          name,
          year,
          examType,
        },
        relations: ['teacher', 'student'],
      });
    else
      foundComments = await this.teacherCommentRepository.find({
        where: {
          num,
          name,
          year,
        },
        relations: ['teacher', 'student'],
      });

    // const subjectMarks = foundMarks.filter(
    //   (mark) => mark.subject.code === subjectCode,
    // );

    //combine found comments with the class list
    const classComments: TeacherCommentEntity[] = [];

    classlist.map((enrol) => {
      const comment = new TeacherCommentEntity();

      comment.num = num;
      comment.name = name;
      comment.year = year;

      comment.student = enrol.student;

      classComments.push(comment);
    });

    classComments.map((cmmnt) => {
      foundComments.map((cmt) => {
        if (cmmnt.student.studentNumber === cmt.student.studentNumber) {
          cmmnt.comment = cmt.comment;
          cmmnt.teacher = cmt.teacher;
          cmmnt.id = cmt.id;
          // cmmnt.examtype = cmt.examtype;
        }
      });
    });

    // console.log(classSubjectMarks[0]);

    return classComments;
  }
}

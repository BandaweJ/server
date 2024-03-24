import {
  BadRequestException,
  Injectable,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClassEntity } from './entities/class.entity';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { CreateClassDto } from './dtos/create-class.dto';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { ROLES } from '../auth/models/roles.enum';

import { NotFoundException } from '@nestjs/common';
import { CreateTermDto } from './dtos/create-term.dto';
import { TermsEntity } from './entities/term.entity';

import { EnrolDto } from './dtos/enrol.dto';
import { EnrolEntity } from './entities/enrol.entity';
import { ResourceByIdService } from '../resource-by-id/resource-by-id.service';
import { EnrolStats } from './dtos/enrol-stats.dto';
import { MarkRegisterDto } from './dtos/mark-register.dto';
import { AttendanceEntity } from './entities/attendance.entity';

@Injectable()
export class EnrolmentService {
  constructor(
    @InjectRepository(ClassEntity)
    private classRepository: Repository<ClassEntity>,
    @InjectRepository(TermsEntity)
    private termRepository: Repository<TermsEntity>,
    @InjectRepository(EnrolEntity)
    private enrolmentRepository: Repository<EnrolEntity>,
    private resourceById: ResourceByIdService,

    @InjectRepository(AttendanceEntity)
    private attendanceRepository: Repository<AttendanceEntity>,
  ) {}

  async getAllClasses(): Promise<ClassEntity[]> {
    return await this.classRepository.find();
  }

  async getOneClass(name: string): Promise<ClassEntity> {
    const clas = await this.classRepository.findOne({ where: { name } });

    if (!clas) {
      throw new NotFoundException(`Class with name ${name} not found`);
    } else {
      return clas;
    }
  }

  async createClass(
    createClassDto: CreateClassDto,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ClassEntity> {
    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher: {
        throw new UnauthorizedException(
          'Only admins are allowe to create new classes',
        );
      }
    }

    try {
      return await this.classRepository.save({ ...createClassDto });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        throw new BadRequestException(
          `Class with name ${createClassDto.name} already exists`,
        );
      } else {
        throw new NotImplementedException('faled to create class');
      }
    }
  }

  async deleteClass(
    name: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher: {
        throw new UnauthorizedException(
          'Only admins are allowed to delete classes',
        );
      }
    }

    const clas = await this.getOneClass(name);

    const result = await this.classRepository.delete(clas.id);

    if (result.affected === 0)
      throw new NotImplementedException(`Class ${clas.name} not deleted`);
    // return result.affected;
    return { name };
  }

  async editClass(id: number, clas: CreateClassDto) {
    const cls = await this.classRepository.findOne({
      where: { id },
    });

    if (!cls) {
      throw new NotFoundException('Class not found');
    } else {
      return await this.classRepository.save({
        ...cls,
        ...clas,
      });
    }
  }

  async createTerm(
    createTermDto: CreateTermDto,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<TermsEntity> {
    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher: {
        throw new UnauthorizedException('Only admins can create a new term');
      }
    }
    return await this.termRepository.save(createTermDto);
  }

  async getAllTerms(): Promise<TermsEntity[]> {
    return await this.termRepository.find();
  }

  async getOneTerm(num: number, year: number): Promise<TermsEntity> {
    const term = await this.termRepository.findOne({
      where: {
        num,
        year,
      },
    });
    if (!term) {
      throw new NotFoundException(
        `Term with number: ${num} and year: ${year} not found`,
      );
    }
    return term;
  }

  async deleteTerm(
    num: number,
    year: number,
    profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ): Promise<number> {
    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher: {
        throw new UnauthorizedException('Only admins allowed to delete Terms');
        break;
      }
    }

    const term = await this.getOneTerm(num, year);

    const result = await this.termRepository.remove(term);

    return result && 1;
  }

  //Enrolmnt

  async enrolStudent(
    enrolDto: EnrolDto[],
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<EnrolEntity[]> {
    // const { studentNumber, name, num, year } = enrolDto;

    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student: {
        throw new UnauthorizedException(
          'Only members of staff can enrol students in class',
        );
      }
    }
    // //check if student is already enroled in any class for the same term

    return await this.enrolmentRepository.save(enrolDto);
  }

  async getAllEnrolments(
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<EnrolStats> {
    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student: {
        throw new UnauthorizedException(
          'Students and Parents cannot access enrolment records',
        );
      }
    }

    //object to return
    const result: EnrolStats = {
      clas: [],
      boys: [],
      girls: [],
    };

    //create date object with current date
    const today = new Date();
    //use the terms repository to find a term where current date lies between its startDate and endDate
    const currentTerm = await this.termRepository.findOne({
      where: {
        startDate: LessThan(today),
        endDate: MoreThan(today),
      },
    });
    //get enrolments for that term

    if (currentTerm) {
      const enrols = await this.enrolmentRepository.find({
        where: {
          num: currentTerm.num,
          year: currentTerm.year,
        },
        relations: ['student'],
      });

      const classesSet = new Set<string>();

      enrols.map((enrol) => {
        classesSet.add(enrol.name);
      });

      //initialise arrays
      result.clas = Array.from(classesSet.values());
      result.clas.forEach((val, i) => {
        result.boys[i] = 0;
        result.girls[i] = 0;
      });

      enrols.map((enrol) => {
        if (enrol.student.gender === 'Male') {
          result.boys[result.clas.indexOf(enrol.name)]++;
        } else result.girls[result.clas.indexOf(enrol.name)]++;
      });
    }

    //create set of classes

    return result;
  }

  async getOneEnrolment(
    studentNumber: string,
    num: number,
    year: number,
  ): Promise<EnrolEntity> {
    const enroledStudents = await this.enrolmentRepository.find({
      where: {
        // studentNumber,
        num,
        year,
      },
      relations: ['student'],
    });

    const enroledStudent = enroledStudents.filter(
      (enrol) => enrol.student.studentNumber === studentNumber,
    );

    if (enroledStudent.length === 0) {
      throw new NotFoundException(
        `Student ${studentNumber} not enroled in term ${num} ${year}`,
      );
    }

    return enroledStudent[0];
  }

  async getEnrolmentByClass(
    name: string,
    num: number,
    year: number,
  ): Promise<EnrolEntity[]> {
    return await this.enrolmentRepository.find({
      where: {
        name,
        num,
        year,
      },
      relations: ['student'],
    });
  }

  async getEnrolmentByTerm(num: number, year: number): Promise<EnrolEntity[]> {
    return await this.enrolmentRepository.find({
      where: {
        num,
        year,
      },
      relations: ['student'],
    });
  }

  async unenrolStudent(id: number) {
    const enrol = await this.enrolmentRepository.findOne({
      where: { id },
      relations: ['student'],
    });

    const result = await this.enrolmentRepository.delete(id);

    if (result.affected) {
      return enrol;
    } else {
      throw new NotImplementedException(`Enrolment not removed`, result.raw);
    }
  }

  async markRegister(enrol: MarkRegisterDto): Promise<MarkRegisterDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { student, name, num, year, present } = enrol;

    const attendance = await this.attendanceRepository.findOne({
      where: {
        year,
        num,
        name,
        date: today,
        student: {
          studentNumber: student.studentNumber,
        },
      },
    });

    if (attendance) {
      return await this.attendanceRepository.save({
        ...attendance,
        date: today,
        present,
      });
    } else
      return await this.attendanceRepository.save({
        ...enrol,
        date: today,
      });
  }

  async getTodayRegisterByClass(name, num, year) {
    const classList = await this.getEnrolmentByClass(name, num, year);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisDayAttendances: AttendanceEntity[] = [];

    const todayAttendances = await this.attendanceRepository.find({
      where: {
        name,
        num,
        year,
        date: today,
      },
      relations: ['student'],
    });

    // console.log('today att:', todayAttendances.length);

    classList.map((enrol) => {
      const attendance = new AttendanceEntity();

      attendance.name = name;
      attendance.num = num;
      attendance.year = year;
      attendance.date = today;
      attendance.student = enrol.student;

      thisDayAttendances.push(attendance);
    });

    // console.log('Class list len: ', thisDayAttendances.length);

    thisDayAttendances.map((att) => {
      todayAttendances.map((todayAtt) => {
        if (att.student.studentNumber === todayAtt.student.studentNumber) {
          att.id = todayAtt.id;
          att.present = todayAtt.present;
        }
      });
    });

    // console.log(todayAttendances);

    return thisDayAttendances;
  }

  async addTerm(term: CreateTermDto) {
    return await this.termRepository.save({
      ...term,
    });
  }

  async migrateClass(
    fromName: string,
    fromNum: number,
    fromYear: number,
    toName: string,
    toNum: number,
    toYear: number,
  ) {
    const currentClassEnrolments = await this.enrolmentRepository.find({
      select: ['name', 'num', 'year'],
      where: {
        name: fromName,
        num: fromNum,
        year: fromYear,
      },
      relations: ['student'],
    });

    if (currentClassEnrolments.length) {
      currentClassEnrolments.map((enrol) => {
        enrol.name = toName;
        enrol.num = toNum;
        enrol.year = toYear;
      });

      await this.enrolmentRepository.save([...currentClassEnrolments]);
      return { result: true };
    } else
      throw new NotImplementedException(
        'The class you chose appear to not have students enrolled in it',
      );
  }

  async editTerm(term: TermsEntity) {
    const { num, year } = term;
    const trm = await this.termRepository.findOne({
      where: { num, year },
    });

    if (!trm) {
      throw new NotFoundException('Term not found');
    } else {
      return await this.termRepository.save({ ...term });
    }
  }
}

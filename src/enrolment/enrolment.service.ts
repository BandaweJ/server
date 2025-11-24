/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClassEntity } from './entities/class.entity';
import {
  LessThan,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
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
import { AttendanceEntity } from '../attendance/entities/attendance.entity';
import { StudentsSummary } from './models/students-summary.model';
import { StudentsService } from 'src/profiles/students/students.service';
import { UpdateEnrolDto } from './dtos/update-enrol.dto';
// import { FinanceService } from 'src/finance/finance.service';

@Injectable()
export class EnrolmentService {
  private readonly logger = new Logger(EnrolmentService.name);

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

    private studentsService: StudentsService,
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
    this.logger.log('getAllTerms() - Starting to fetch terms from database');
    try {
      const terms = await this.termRepository.find();
      this.logger.log(`getAllTerms() - Successfully fetched ${terms.length} terms from database`);
      return terms;
    } catch (error) {
      this.logger.error('getAllTerms() - Error fetching terms:', error);
      this.logger.error('getAllTerms() - Error stack:', error.stack);
      throw error;
    }
  }

  async getCurrentTerm(): Promise<TermsEntity> {
    const today = new Date();

    return await this.termRepository.findOne({
      where: {
        startDate: LessThanOrEqual(today),
        endDate: MoreThanOrEqual(today),
      },
    });
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

  // getAllEnrols(): Promise<EnrolEntity[]>{
  //   return await this.enrolmentRepository.find()
  // }

  async updateEnrolment(
    updateEnrolDto: UpdateEnrolDto,
    profile: TeachersEntity,
  ) {
    const { student, name, num, year, residence } = updateEnrolDto;

    const enrol = await this.enrolmentRepository.findOne({
      where: {
        name,
        num,
        year,
        student: {
          studentNumber: student.studentNumber,
        },
      },
      relations: ['student'],
    });

    enrol.residence = residence;

    return await this.enrolmentRepository.save(enrol);
  }

  async enrolStudent(
    enrolDtos: EnrolDto[],
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

    const enrolEntities: EnrolEntity[] = [];

    for (const enrolDto of enrolDtos) {
      const { name, num, year, residence, student } = enrolDto;

      const enrolEntity = await this.enrolmentRepository.create({
        name,
        num,
        year,
        residence,
        student,
      });

      const existingEnrol = await this.enrolmentRepository.findOne({
        where: {
          name,
          num,
          year,
          student: {
            studentNumber: student.studentNumber,
          },
        },
      });

      if (!existingEnrol) {
        enrolEntities.push(enrolEntity);
      }
    }

    return await this.enrolmentRepository.save(enrolEntities);
  }

  async getNewComers() {
    return await this.studentsService.findNewComerStudentsQueryBuilder();
  }

  async getAllEnrolments(
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<EnrolStats> {
    if (!profile) {
      throw new UnauthorizedException('User profile not found');
    }

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
    const enroledStudent = await this.enrolmentRepository.findOne({
      where: {
        student: { studentNumber },
        num,
        year,
      },
      relations: ['student'],
    });

    if (!enroledStudent) {
      const student = await this.resourceById.getStudentByStudentNumber(
        studentNumber,
      );
      throw new NotFoundException(
        `Student (${studentNumber}) ${student.surname} ${student.name} not enroled in term ${num} ${year}`,
      );
    }

    return enroledStudent;
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

  async getTotalEnrolmentByTerm(
    num: number,
    year: number,
  ): Promise<StudentsSummary> {
    const enrols: EnrolEntity[] = await this.enrolmentRepository.find({
      where: {
        num,
        year,
      },
      relations: ['student'],
    });

    const summary: StudentsSummary = {
      total: 0,
      boarders: 0,
      dayScholars: 0,
      boys: 0,
      girls: 0,
    };

    summary.total = enrols.length;
    summary.boarders = enrols.filter(
      (enrol) => enrol.residence === 'Boarder',
    ).length;
    summary.dayScholars = enrols.filter(
      (enrol) => enrol.residence === 'Day',
    ).length;
    summary.boys = enrols.filter(
      (enrol) => enrol.student.gender === 'Male',
    ).length;
    summary.girls = enrols.filter(
      (enrol) => enrol.student.gender === 'Female',
    ).length;

    return summary;
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

  async getEnrolmentsByStudent(
    studentNumber: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<EnrolEntity[]> {
    const student = await this.studentsService.getStudent(
      studentNumber,
      profile,
    );
    if (!student) {
      // Handle the case where the student is not found
      return []; // or throw an error
    }

    return this.enrolmentRepository.find({
      where: { student: { studentNumber } },
      relations: ['student', 'fees'], // Include related entities
    });
  }

  async unenrolStudent(id: number) {
    const enrol = await this.enrolmentRepository.findOne({
      where: { id },
      // relations: ['student'],
    });

    const result = await this.enrolmentRepository.delete(id);

    if (result.affected) {
      return enrol;
    } else {
      throw new NotImplementedException(`Enrolment not removed`, result.raw);
    }
  }

  async addTerm(term: CreateTermDto) {
    return await this.termRepository.save({
      ...term,
    });
  }

  // src/enrolment/enrolment.service.ts

  async migrateClass(
    fromName: string,
    fromNum: number,
    fromYear: number,
    toName: string,
    toNum: number,
    toYear: number,
  ) {
    // Step 1: Get all students enrolled in the class we are migrating from.
    const sourceClassEnrolments = await this.enrolmentRepository.find({
      where: { name: fromName, num: fromNum, year: fromYear },
      relations: ['student'],
    });

    if (sourceClassEnrolments.length === 0) {
      throw new Error(
        'The class you chose appears to not have students enrolled in it',
      );
    }

    // Step 2: Get all students currently enrolled in ANY class for the destination term and year.
    const allEnrolmentsInDestinationTerm = await this.enrolmentRepository.find({
      where: { num: toNum, year: toYear },
      relations: ['student'],
    });

    // Step 3: Create a Set for efficient lookup of all student numbers already enrolled in the destination term.
    const studentsAlreadyEnrolledInTerm = new Set(
      allEnrolmentsInDestinationTerm.map(
        (enrol) => enrol.student.studentNumber,
      ),
    );

    // Step 4: Filter the source class enrolments to find students who are NOT
    // already in ANY class for the destination term.
    const studentsToMigrate = sourceClassEnrolments.filter(
      (enrol) =>
        !studentsAlreadyEnrolledInTerm.has(enrol.student.studentNumber),
    );

    // --- ADDED: Step 5: Deduplicate the list of students to migrate ---
    // Use a Map to ensure each student number appears only once.
    const uniqueStudentsToMigrate = new Map<string, EnrolEntity>();
    studentsToMigrate.forEach((enrol) => {
      uniqueStudentsToMigrate.set(enrol.student.studentNumber, enrol);
    });

    // Step 6: Map the filtered, unique list of students to new enrolment entities.
    const newClassEnrolment: EnrolEntity[] = Array.from(
      uniqueStudentsToMigrate.values(),
    ).map((enrol) => {
      const newEnrol = new EnrolEntity();
      newEnrol.name = toName;
      newEnrol.num = toNum;
      newEnrol.year = toYear;
      newEnrol.student = enrol.student;
      // Preserve the residence from the source enrolment
      newEnrol.residence = enrol.residence;
      return newEnrol;
    });

    if (newClassEnrolment.length === 0) {
      return {
        result: false,
        message:
          'All students from the source class are already enrolled in a class for the destination term.',
      };
    }

    // Step 7: Save the new enrolments to the database.
    await this.enrolmentRepository.save(newClassEnrolment);

    return {
      result: true,
      migratedCount: newClassEnrolment.length,
      message: `${newClassEnrolment.length} students have been successfully migrated.`,
    };
  }

  async editTerm(term: CreateTermDto) {
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

  /**
   * Finds the current enrollment for a given student based on the current date.
   * @param studentNumber The ID of the student.
   * @returns The current EnrolEntity or null if not found.
   */
  async getCurrentEnrollment(
    studentNumber: string,
  ): Promise<EnrolEntity | null> {
    const currentDate = new Date(); // Get today's date

    // 1. Find the current term
    const currentTerm = await this.termRepository.findOne({
      where: {
        startDate: LessThanOrEqual(currentDate), // Start date is less than or equal to today
        endDate: MoreThanOrEqual(currentDate), // End date is greater than or equal to today
      },
    });
    // console.log('current term: ', currentTerm);
    // Handle case where no current term is found (e.g., between terms)
    if (!currentTerm) {
      // console.log(
      //   `No active term found for date: ${currentDate.toISOString()}`,
      // );
      // You might want to throw an error or return null depending on your requirements
      // throw new NotFoundException('No active academic term found.');
      return null;
    }

    // console.log(
    //   `Current term found: Year=${currentTerm.year}, Num=${currentTerm.num}`,
    // );

    // 2. Find the enrollment for the student in the current term
    const currentEnrollment = await this.enrolmentRepository.findOne({
      where: {
        student: { studentNumber }, // Filter by the student's ID
        year: currentTerm.year, // Match the year from the current term
        num: currentTerm.num, // Match the term number from the current term
      },
      // Optionally load relations if you need them immediately
      relations: ['student'],
    });
    // console.log('currentEnrollment: ', currentEnrollment);

    // if (!currentEnrollment) {
    //   console.log(
    //     `No enrollment found for student ${studentId} in term Year=${currentTerm.year}, Num=${currentTerm.num}`,
    //   );
    // Return null if the student wasn't enrolled in the current term
    // return null;
    return currentEnrollment;
  }

  async isNewcomer(studentNumber: string): Promise<boolean> {
    try {
      const enrolCount = await this.enrolmentRepository.count({
        where: { student: { studentNumber } },
      });
      return enrolCount === 1;
    } catch (error) {
      // console.error('Error checking newcomer status:', error);
      // Handle the error appropriately, maybe return false or throw an exception
      return false;
    }
  }
}

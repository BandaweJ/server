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
  Not,
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
import { TermType } from './models/term-type.enum';

import { EnrolDto } from './dtos/enrol.dto';
import { EnrolEntity } from './entities/enrol.entity';
import { ResourceByIdService } from '../resource-by-id/resource-by-id.service';
import { EnrolStats } from './dtos/enrol-stats.dto';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';
import { StudentsSummary } from './models/students-summary.model';
import { StudentsService } from 'src/profiles/students/students.service';
import { UpdateEnrolDto } from './dtos/update-enrol.dto';
import { BillsEntity } from 'src/finance/entities/bills.entity';
// import { FinanceService } from 'src/finance/finance.service';
import { InvoiceStatus } from 'src/finance/models/invoice-status.enum';
import { ReceiptEntity } from 'src/payment/entities/payment.entity';
import {
  StudentEnrolmentDto,
  StudentEnrolmentStatusDto,
} from './dtos/student-enrolment-status.dto';

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
    @InjectRepository(BillsEntity)
    private billsRepository: Repository<BillsEntity>,
    @InjectRepository(ReceiptEntity)
    private receiptRepository: Repository<ReceiptEntity>,
    private resourceById: ResourceByIdService,

    @InjectRepository(AttendanceEntity)
    private attendanceRepository: Repository<AttendanceEntity>,

    private studentsService: StudentsService,
  ) {}

  async getAllClasses(): Promise<ClassEntity[]> {
    const classes = await this.classRepository.find();
    
    // Get student count for each class by querying enrolments
    for (const classItem of classes) {
      const studentCount = await this.enrolmentRepository.count({
        where: { name: classItem.name }
      });
      classItem.studentCount = studentCount;
    }
    
    return classes;
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
      case ROLES.teacher:
      case ROLES.auditor: {
        throw new UnauthorizedException('Only admins or dev can create a new term');
      }
    }
    const normalizedType = createTermDto.type || TermType.REGULAR;
    await this.assertTermDateRules(
      createTermDto.startDate,
      createTermDto.endDate,
      normalizedType,
      createTermDto.num,
      createTermDto.year,
    );

    return await this.termRepository.save({
      ...createTermDto,
      type: normalizedType,
      label: createTermDto.label?.trim() || null,
    });
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

  async getCurrentTerm(type?: TermType): Promise<TermsEntity> {
    const today = new Date();

    const whereClause: any = {
      startDate: LessThanOrEqual(today),
      endDate: MoreThanOrEqual(today),
    };
    if (type) whereClause.type = type;

    return await this.termRepository.findOne({
      where: whereClause,
      order: { year: 'DESC', num: 'DESC' },
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

  async getOneTermById(id: number): Promise<TermsEntity> {
    const term = await this.termRepository.findOne({ where: { id } });
    if (!term) {
      throw new NotFoundException(`Term with id ${id} not found`);
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

  /**
   * Updates an enrolment (e.g. class name when student moves, or residence).
   * When id is provided, finds by id (so class name can be changed). Otherwise finds by name, num, year, student.
   * Invoices reference this enrolment by enrolId; they do not store class/residence denormalized,
   * so once the enrolment row is saved, any invoice loaded with its enrol relation will show the updated data.
   */
  async updateEnrolment(
    updateEnrolDto: UpdateEnrolDto,
    _profile: TeachersEntity,
  ): Promise<EnrolEntity> {
    const { id, student, name, num, year, residence, termId } = updateEnrolDto as UpdateEnrolDto & { termId?: number };

    let enrol: EnrolEntity | null = null;

    if (id != null) {
      enrol = await this.enrolmentRepository.findOne({
        where: { id },
        relations: ['student'],
      });
    }

    if (!enrol && student?.studentNumber && name != null && num != null && year != null) {
      enrol = await this.enrolmentRepository.findOne({
        where: {
          name,
          num,
          year,
          student: { studentNumber: student.studentNumber },
        },
        relations: ['student'],
      });
    }

    if (!enrol) {
      throw new NotFoundException(
        id != null
          ? `Enrolment with id ${id} not found`
          : 'Enrolment not found for the given student, class and term',
      );
    }

    if (name !== undefined) enrol.name = name;
    if (residence !== undefined) enrol.residence = residence;
    if (termId !== undefined && termId !== null) {
      const term = await this.getOneTermById(termId);
      enrol.termId = term.id;
      enrol.num = term.num;
      enrol.year = term.year;
      enrol.term = term;
    }

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
      const { name, num, year, residence, student, termId } = enrolDto as EnrolDto & { termId?: number };
      let resolvedNum = num;
      let resolvedYear = year;
      let resolvedTermId: number | null = termId ?? null;
      let resolvedTerm: TermsEntity | null = null;

      if (termId != null) {
        resolvedTerm = await this.getOneTermById(termId);
        resolvedNum = resolvedTerm.num;
        resolvedYear = resolvedTerm.year;
        resolvedTermId = resolvedTerm.id;
      } else if (num != null && year != null) {
        const foundTerm = await this.termRepository.findOne({ where: { num, year } });
        if (foundTerm) {
          resolvedTerm = foundTerm;
          resolvedTermId = foundTerm.id;
        }
      }

      const enrolEntity = await this.enrolmentRepository.create({
        name,
        num: resolvedNum,
        year: resolvedYear,
        termId: resolvedTermId,
        term: resolvedTerm,
        residence,
        student,
      });

      const existingEnrol = await this.enrolmentRepository.findOne({
        where: {
          name,
          num: resolvedNum,
          year: resolvedYear,
          termId: resolvedTermId,
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

    // Find the "current" term using the same inclusive logic as getCurrentTerm()
    const today = new Date();
    const currentTerm = await this.termRepository.findOne({
      where: {
        startDate: LessThanOrEqual(today),
        endDate: MoreThanOrEqual(today),
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
    termId?: number,
  ): Promise<EnrolEntity> {
    const enroledStudent = await this.enrolmentRepository.findOne({
      where: {
        student: { studentNumber },
        ...(termId ? { termId } : { num, year }),
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
    termId?: number,
  ): Promise<EnrolEntity[]> {
    return await this.enrolmentRepository.find({
      where: {
        name,
        ...(termId ? { termId } : { num, year }),
      },
      relations: ['student'],
    });
  }

  async getTotalEnrolmentByTerm(
    num: number,
    year: number,
    termId?: number,
  ): Promise<StudentsSummary> {
    const enrols: EnrolEntity[] = await this.enrolmentRepository.find({
      where: {
        ...(termId ? { termId } : { num, year }),
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

  async getEnrolmentByTerm(
    num: number,
    year: number,
    termId?: number,
  ): Promise<EnrolEntity[]> {
    return await this.enrolmentRepository.find({
      where: {
        ...(termId ? { termId } : { num, year }),
      },
      relations: ['student'],
    });
  }

  async getEnrolmentsByStudent(
    studentNumber: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<EnrolEntity[]> {
    // For dev role we trust the request context and skip role-based student lookup
    if (profile.role !== ROLES.dev) {
      const student = await this.studentsService.getStudent(
        studentNumber,
        profile,
      );
      if (!student) {
        // Handle the case where the student is not found
        return []; // or throw an error
      }
    }

    return this.enrolmentRepository.find({
      where: { student: { studentNumber } },
      relations: ['student'],
    });
  }

  async unenrolStudent(id: number) {
    const enrol = await this.enrolmentRepository.findOne({
      where: { id },
    });

    if (!enrol) {
      throw new NotFoundException(`Enrolment with id ${id} not found`);
    }

    // We cannot delete an enrolment row while bills still reference it (FK constraint).
    // So we only allow unenrolment if *all* linked bills belong to voided invoices,
    // then we detach those bills from the enrolment before deleting the enrolment.
    const bills = await this.billsRepository.find({
      where: { enrol: { id } },
      relations: ['invoice'],
    });

    const isBillVoided = (b: BillsEntity): boolean => {
      // Prefer explicit flag, but also treat status=Voided as voided (older data)
      if (b.invoice?.isVoided === true) return true;
      if ((b.invoice?.status as InvoiceStatus | undefined) === InvoiceStatus.Voided)
        return true;
      // Bills with no invoice should not permanently block unenrolment (legacy/orphan rows)
      return b.invoice == null;
    };

    const nonVoidedBills = bills.filter((b) => !isBillVoided(b));

    if (nonVoidedBills.length > 0) {
      throw new BadRequestException(
        `Cannot unenrol: this enrolment has ${nonVoidedBills.length} bill(s) linked to it. Remove or void the related invoice(s) first, then try again.`,
      );
    }

    // Detach bills that were linked to voided invoices so FK no longer blocks deletion
    if (bills.length > 0) {
      const voidedBills = bills.filter((b) => isBillVoided(b));
      if (voidedBills.length > 0) {
        voidedBills.forEach((b) => {
          b.enrol = null;
        });
        await this.billsRepository.save(voidedBills);
      }
    }

    // Receipts also reference enrolment; relink them based on allocations (B2).
    const receipts = await this.receiptRepository.find({
      where: { enrol: { id } },
      relations: [
        'student',
        'allocations',
        'allocations.invoice',
        'allocations.invoice.enrol',
      ],
    });

    const receiptsThatCannotBeRelinked: ReceiptEntity[] = [];

    for (const receipt of receipts) {
      const allocations = receipt.allocations ?? [];
      let targetEnrol: EnrolEntity | null = null;

      if (allocations.length > 0) {
        const lastAllocation = [...allocations].sort((a, b) => {
          const ad = a.allocationDate ? new Date(a.allocationDate).getTime() : 0;
          const bd = b.allocationDate ? new Date(b.allocationDate).getTime() : 0;
          if (ad !== bd) return ad - bd;
          return (a.id ?? 0) - (b.id ?? 0);
        })[allocations.length - 1];

        targetEnrol = (lastAllocation?.invoice?.enrol as EnrolEntity | undefined) ?? null;
      } else {
        // No allocations (pure credit). Link to most recent enrolment other than the one being deleted.
        const studentNumber = receipt.student?.studentNumber;
        if (studentNumber) {
          targetEnrol =
            (await this.enrolmentRepository.findOne({
              where: { student: { studentNumber }, id: Not(id) },
              order: { year: 'DESC', num: 'DESC', id: 'DESC' },
            })) ?? null;
        }
      }

      // If we can't find a different enrolment to link to, we must block deletion (FK would fail).
      if (!targetEnrol || targetEnrol.id === id) {
        receiptsThatCannotBeRelinked.push(receipt);
        continue;
      }

      receipt.enrol = targetEnrol;
    }

    if (receiptsThatCannotBeRelinked.length > 0) {
      throw new BadRequestException(
        `Cannot unenrol: this enrolment has ${receiptsThatCannotBeRelinked.length} receipt(s) linked to it that cannot be relinked. Void or reallocate those receipts first, then try again.`,
      );
    }

    if (receipts.length > 0) {
      await this.receiptRepository.save(receipts);
    }

    const result = await this.enrolmentRepository.delete(id);

    if (result.affected) {
      return enrol;
    }
    throw new NotImplementedException(`Enrolment not removed`, result.raw);
  }

  async addTerm(term: CreateTermDto) {
    const normalizedType = term.type || TermType.REGULAR;
    await this.assertTermDateRules(
      term.startDate,
      term.endDate,
      normalizedType,
      term.num,
      term.year,
    );
    return await this.termRepository.save({
      ...term,
      type: normalizedType,
      label: term.label?.trim() || null,
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
    fromTermId: number,
    toTermId: number,
  ) {
    const sourceTerm = await this.getOneTermById(fromTermId);
    const destinationTerm = await this.getOneTermById(toTermId);

    const resolvedFromNum = sourceTerm.num;
    const resolvedFromYear = sourceTerm.year;
    const resolvedFromTermId = sourceTerm.id;

    const resolvedToNum = destinationTerm.num;
    const resolvedToYear = destinationTerm.year;
    const resolvedToTermId = destinationTerm.id;
    const resolvedToTerm: TermsEntity = destinationTerm;

    // Guard against mismatched path params and term ids.
    if (fromNum !== resolvedFromNum || fromYear !== resolvedFromYear) {
      throw new BadRequestException(
        `Source term mismatch: fromTermId ${fromTermId} is term ${resolvedFromNum}/${resolvedFromYear}, not ${fromNum}/${fromYear}`,
      );
    }
    if (toNum !== resolvedToNum || toYear !== resolvedToYear) {
      throw new BadRequestException(
        `Destination term mismatch: toTermId ${toTermId} is term ${resolvedToNum}/${resolvedToYear}, not ${toNum}/${toYear}`,
      );
    }

    // Step 1: Get all students enrolled in the class we are migrating from.
    const sourceClassEnrolments = await this.enrolmentRepository.find({
      where: {
        name: fromName,
        termId: resolvedFromTermId,
      },
      relations: ['student'],
    });

    if (sourceClassEnrolments.length === 0) {
      throw new BadRequestException(
        `No students found in source class ${fromName} for term ${resolvedFromNum}/${resolvedFromYear} (termId ${resolvedFromTermId})`,
      );
    }

    // Step 2: Get all students currently enrolled in ANY class for the destination term and year.
    const allEnrolmentsInDestinationTerm = await this.enrolmentRepository.find({
      where: { termId: resolvedToTermId },
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
      newEnrol.num = resolvedToNum;
      newEnrol.year = resolvedToYear;
      newEnrol.termId = resolvedToTermId;
      newEnrol.term = resolvedToTerm;
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
      const normalizedType = term.type || trm.type || TermType.REGULAR;
      await this.assertTermDateRules(
        term.startDate,
        term.endDate,
        normalizedType,
        num,
        year,
      );
      return await this.termRepository.save({
        ...trm,
        ...term,
        type: normalizedType,
        label: term.label?.trim() || null,
      });
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
      return false;
    }
  }

  async getStudentEnrolmentStatus(
    studentNumber: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<StudentEnrolmentStatusDto> {
    const enrols = await this.getEnrolmentsByStudent(studentNumber, profile);

    if (!enrols || enrols.length === 0) {
      return {
        currentEnrolment: null,
        lastEnrolment: null,
        isCurrentlyEnrolled: false,
        enrolments: [],
      };
    }

    const enrolmentDtos = enrols.map((e) => StudentEnrolmentDto.fromEntity(e));

    const sorted = [...enrolmentDtos].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      if (b.num !== a.num) return b.num - a.num;
      return b.id - a.id;
    });
    const lastEnrolment = sorted[0];

    const currentEnrolEntity = await this.getCurrentEnrollment(studentNumber);
    const currentEnrolment = currentEnrolEntity
      ? StudentEnrolmentDto.fromEntity(currentEnrolEntity)
      : null;

    return {
      currentEnrolment,
      lastEnrolment,
      isCurrentlyEnrolled: !!currentEnrolment,
      enrolments: enrolmentDtos,
    };
  }

  private async assertTermDateRules(
    startDate: Date,
    endDate: Date,
    type: TermType,
    num: number,
    year: number,
  ): Promise<void> {
    if (!startDate || !endDate) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      throw new BadRequestException('Term end date must be after start date');
    }

    // Enforce strict non-overlap for regular terms.
    if (type !== TermType.REGULAR) return;

    const regularTerms = await this.termRepository.find({
      where: { type: TermType.REGULAR },
    });

    const hasOverlap = regularTerms.some((term) => {
      if (term.num === num && term.year === year) return false;
      const termStart = new Date(term.startDate);
      const termEnd = new Date(term.endDate);
      return start <= termEnd && end >= termStart;
    });

    if (hasOverlap) {
      throw new BadRequestException(
        'Regular term dates overlap an existing regular term',
      );
    }
  }
}

import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ContinuousAssessmentEntity } from '../entities/continuous-assessment.entity';
import { CreateContinuousAssessmentDto } from '../dtos/create-continuous-assessment.dto';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { SubjectsEntity } from 'src/marks/entities/subjects.entity';
import { NotificationService } from 'src/notifications/services/notification.service';
import { ROLES } from 'src/auth/models/roles.enum';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { ClassEntity } from 'src/enrolment/entities/class.entity';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { TermsEntity } from 'src/enrolment/entities/term.entity';

interface ContinuousAssessmentFilters {
  startDate?: Date;
  endDate?: Date;
  subjectCode?: string;
  assessmentType?: string;
}

export interface ClassRosterEntry {
  studentId: string;
  studentNumber: string;
  studentName: string;
  score?: number;
  maxScore?: number;
  assessmentDate?: Date;
  assessmentType?: string;
  topicOrSkill?: string;
  entryId?: string;
}

@Injectable()
export class ContinuousAssessmentService {
  private readonly logger = new Logger(ContinuousAssessmentService.name);

  constructor(
    @InjectRepository(ContinuousAssessmentEntity)
    private readonly caRepository: Repository<ContinuousAssessmentEntity>,
    @InjectRepository(StudentsEntity)
    private readonly studentsRepository: Repository<StudentsEntity>,
    @InjectRepository(TeachersEntity)
    private readonly teachersRepository: Repository<TeachersEntity>,
    @InjectRepository(SubjectsEntity)
    private readonly subjectsRepository: Repository<SubjectsEntity>,
    @InjectRepository(AccountsEntity)
    private readonly accountsRepository: Repository<AccountsEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
    @InjectRepository(EnrolEntity)
    private readonly enrolmentRepository: Repository<EnrolEntity>,
    @InjectRepository(TermsEntity)
    private readonly termsRepository: Repository<TermsEntity>,
    private readonly notificationService: NotificationService,
  ) {}

  async createAssessment(
    dto: CreateContinuousAssessmentDto,
    user: any,
  ): Promise<ContinuousAssessmentEntity> {
    const { studentId, classId, subjectCode, topicOrSkill, assessmentDate, assessmentType, score, maxScore } = dto;

    const account = await this.accountsRepository.findOne({ where: { id: user.accountId } });
    if (!account) {
      throw new ForbiddenException('Account not found');
    }

    if (![ROLES.teacher, ROLES.hod, ROLES.admin, ROLES.director].includes(account.role as ROLES)) {
      throw new ForbiddenException('You are not allowed to record assessments');
    }

    const student = await this.studentsRepository.findOne({
      where: { studentNumber: studentId },
      relations: ['parent'],
    });
    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    const teacher = await this.teachersRepository.findOne({
      where: { id: user.id },
    });

    let subject: SubjectsEntity | undefined;
    if (subjectCode) {
      subject = await this.subjectsRepository.findOne({ where: { code: subjectCode } });
    }

    const { startOfDay, endOfDay } = this.getAssessmentDayRange(new Date(assessmentDate));
    const existing = await this.caRepository.findOne({
      where: {
        studentId: student.studentNumber,
        classId,
        topicOrSkill,
        assessmentDate: Between(startOfDay, endOfDay),
      },
    });

    if (existing) {
      existing.score = score;
      existing.maxScore = maxScore;
      existing.assessmentType = assessmentType || existing.assessmentType;
      existing.subjectCode = subject?.code;
      existing.subject = subject;
      return this.caRepository.save(existing);
    }

    const assessment = this.caRepository.create({
      studentId: student.studentNumber,
      student,
      teacherId: teacher?.id,
      teacher,
      classId,
      subjectCode: subject?.code,
      subject,
      topicOrSkill,
      assessmentDate: startOfDay,
      assessmentType: assessmentType || 'exercise',
      score,
      maxScore,
    });

    const saved = await this.caRepository.save(assessment);

    try {
      await this.notificationService.sendContinuousAssessmentNotification({
        studentName: `${student.name} ${student.surname}`.trim(),
        studentNumber: student.studentNumber,
        parentEmail: student.parent?.email,
        studentEmail: student.email,
        topicOrSkill,
        assessmentDate: saved.assessmentDate,
        score,
        maxScore,
        assessmentType: saved.assessmentType,
      });
    } catch (error) {
      this.logger.warn('Failed to send continuous assessment notification', error);
    }

    return saved;
  }

  async getClassAssessments(
    classId: number,
    filters: ContinuousAssessmentFilters = {},
  ): Promise<ContinuousAssessmentEntity[]> {
    const where: any = { classId };

    if (filters.startDate && filters.endDate) {
      where.assessmentDate = Between(filters.startDate, filters.endDate);
    }

    if (filters.subjectCode) {
      where.subjectCode = filters.subjectCode;
    }

    if (filters.assessmentType) {
      where.assessmentType = filters.assessmentType;
    }

    return this.caRepository.find({
      where,
      relations: ['student', 'teacher', 'subject'],
      order: { assessmentDate: 'DESC' },
    });
  }

  async getClassRoster(
    classId: number,
    assessmentDate: Date,
    topicOrSkill: string,
    subjectCode?: string,
    assessmentType?: string,
  ): Promise<ClassRosterEntry[]> {
    const classEntity = await this.classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      throw new NotFoundException('Class not found');
    }

    const term = await this.getCurrentTerm();
    const enrolWhere: any = { name: classEntity.name };
    if (term) {
      enrolWhere.year = term.year;
      enrolWhere.num = term.num;
    } else {
      enrolWhere.year = new Date().getFullYear();
    }

    const enrolments = await this.enrolmentRepository.find({
      where: enrolWhere,
      relations: ['student'],
    });

    const students = enrolments
      .map((enrol) => enrol.student)
      .filter((student): student is StudentsEntity => !!student)
      .sort((a, b) => a.surname.localeCompare(b.surname));

    const studentIds = students.map((student) => student.studentNumber);
    if (studentIds.length === 0) {
      return [];
    }

    const { startOfDay, endOfDay } = this.getAssessmentDayRange(assessmentDate);

    const existingEntries = await this.caRepository.find({
      where: {
        classId,
        studentId: In(studentIds),
        assessmentDate: Between(startOfDay, endOfDay),
        topicOrSkill,
        ...(subjectCode ? { subjectCode } : {}),
        ...(assessmentType ? { assessmentType } : {}),
      },
    });

    return students.map((student) => {
      const entry = existingEntries.find((e) => e.studentId === student.studentNumber);
      return {
        studentId: student.studentNumber,
        studentNumber: student.studentNumber,
        studentName: `${student.name} ${student.surname}`.trim(),
        score: entry?.score,
        maxScore: entry?.maxScore,
        assessmentDate: entry?.assessmentDate,
        assessmentType: entry?.assessmentType,
        topicOrSkill: entry?.topicOrSkill,
        entryId: entry?.id,
      };
    });
  }

  async getStudentAssessments(
    studentId: string,
    filters: ContinuousAssessmentFilters = {},
  ): Promise<ContinuousAssessmentEntity[]> {
    const where: any = { studentId };

    if (filters.startDate && filters.endDate) {
      where.assessmentDate = Between(filters.startDate, filters.endDate);
    }

    if (filters.subjectCode) {
      where.subjectCode = filters.subjectCode;
    }

    if (filters.assessmentType) {
      where.assessmentType = filters.assessmentType;
    }

    return this.caRepository.find({
      where,
      relations: ['teacher', 'subject'],
      order: { assessmentDate: 'DESC' },
    });
  }

  async getStudentAnalytics(studentId: string) {
    const entries = await this.caRepository.find({
      where: { studentId },
      relations: ['subject'],
      order: { assessmentDate: 'DESC' },
    });

    if (entries.length === 0) {
      return {
        averageScore: 0,
        totalEntries: 0,
        subjectAverages: [],
        recentAssessments: [],
      };
    }

    const totalScores = entries.reduce((sum, entry) => sum + entry.score, 0);
    const averageScore = totalScores / entries.length;

    const subjectMap = new Map<string, { total: number; count: number }>();
    entries.forEach(entry => {
      const subjectName = entry.subject?.name || 'General';
      const current = subjectMap.get(subjectName) || { total: 0, count: 0 };
      current.total += entry.score;
      current.count += 1;
      subjectMap.set(subjectName, current);
    });

    const subjectAverages = Array.from(subjectMap.entries()).map(([subject, data]) => ({
      subject,
      average: data.total / data.count,
    }));

    return {
      averageScore,
      totalEntries: entries.length,
      subjectAverages,
      recentAssessments: entries.slice(0, 5),
    };
  }

  private getAssessmentDayRange(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return { startOfDay, endOfDay };
  }

  private async getCurrentTerm(): Promise<TermsEntity | null> {
    const today = new Date();
    const term = await this.termsRepository.findOne({
      where: {
        startDate: LessThanOrEqual(today),
        endDate: MoreThanOrEqual(today),
      },
    });
    return term ?? null;
  }
}


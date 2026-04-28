/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { InvoiceEntity } from 'src/payment/entities/invoice.entity';
import { ReceiptEntity } from 'src/payment/entities/payment.entity';
import { ReportsEntity } from 'src/reports/entities/report.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { FinancialAuditLogEntity } from 'src/payment/entities/financial-audit-log.entity';
import { EnrolmentService } from 'src/enrolment/enrolment.service';

export interface EnrollmentAnalytics {
  totalStudents: number;
  activeEnrollments: number;
  enrollmentsByTerm: Array<{ term: string; count: number }>;
  enrollmentsByClass: Array<{ className: string; count: number }>;
  newStudentsThisYear: number;
  studentsByGender: Array<{ gender: string; count: number }>;
}

export interface FinancialAnalytics {
  totalRevenue: number;
  totalOutstanding: number;
  totalInvoiced: number;
  revenueByMonth: Array<{ month: string; amount: number }>;
  paymentsByMethod: Array<{ method: string; amount: number; count: number }>;
  outstandingByClass: Array<{ className: string; amount: number }>;
  collectionRate: number;
}

export interface AcademicAnalytics {
  totalReports: number;
  averagePerformance: number;
  passRate: number;
  topPerformingClasses: Array<{ className: string; average: number }>;
  subjectPerformance: Array<{ subject: string; average: number }>;
  reportsByTerm: Array<{ term: string; count: number }>;
}

export interface UserActivityAnalytics {
  totalUsers: number;
  usersByRole: Array<{ role: string; count: number }>;
  activeUsers: number;
  recentActivity: Array<{ action: string; count: number; date: string }>;
}

export interface SystemAnalytics {
  totalAuditLogs: number;
  auditLogsByAction: Array<{ action: string; count: number }>;
  auditLogsByEntity: Array<{ entityType: string; count: number }>;
  systemHealth: {
    databaseConnected: boolean;
    totalRecords: number;
  };
}

export interface AnalyticsSummary {
  enrollment: EnrollmentAnalytics;
  financial: FinancialAnalytics;
  academic: AcademicAnalytics;
  userActivity: UserActivityAnalytics;
  system: SystemAnalytics;
  generatedAt: Date;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(StudentsEntity)
    private studentsRepository: Repository<StudentsEntity>,
    @InjectRepository(EnrolEntity)
    private enrolRepository: Repository<EnrolEntity>,
    @InjectRepository(InvoiceEntity)
    private invoiceRepository: Repository<InvoiceEntity>,
    @InjectRepository(ReceiptEntity)
    private receiptRepository: Repository<ReceiptEntity>,
    @InjectRepository(ReportsEntity)
    private reportsRepository: Repository<ReportsEntity>,
    @InjectRepository(AccountsEntity)
    private accountsRepository: Repository<AccountsEntity>,
    @InjectRepository(TeachersEntity)
    private teachersRepository: Repository<TeachersEntity>,
    @InjectRepository(ParentsEntity)
    private parentsRepository: Repository<ParentsEntity>,
    @InjectRepository(FinancialAuditLogEntity)
    private auditLogRepository: Repository<FinancialAuditLogEntity>,
    private enrolmentService: EnrolmentService,
  ) {}

  async getAnalyticsSummary(
    startDate?: Date,
    endDate?: Date,
    termNum?: number,
    termYear?: number,
  ): Promise<AnalyticsSummary> {
    // Get current term if not specified
    let currentTermNum = termNum;
    let currentTermYear = termYear;
    
    if (!currentTermNum || !currentTermYear) {
      try {
        const currentTerm = await this.enrolmentService.getCurrentTerm();
        if (currentTerm) {
          currentTermNum = currentTerm.num;
          currentTermYear = currentTerm.year;
        }
      } catch (error) {
        this.logger.warn('Could not get current term, using all data');
      }
    }

    const [enrollment, financial, academic, userActivity, system] =
      await Promise.all([
        this.getEnrollmentAnalytics(currentTermNum, currentTermYear),
        this.getFinancialAnalytics(startDate, endDate, currentTermNum, currentTermYear),
        this.getAcademicAnalytics(currentTermNum, currentTermYear),
        this.getUserActivityAnalytics(),
        this.getSystemAnalytics(),
      ]);

    return {
      enrollment,
      financial,
      academic,
      userActivity,
      system,
      generatedAt: new Date(),
    };
  }

  async getEnrollmentAnalytics(
    termNum?: number,
    termYear?: number,
  ): Promise<EnrollmentAnalytics> {
    const totalStudents = await this.studentsRepository.count();
    
    // Use provided term or current year
    const filterYear = termYear || new Date().getFullYear();
    const whereClause: any = { year: filterYear };
    if (termNum) {
      whereClause.num = termNum;
    }

    // Active enrollments (filtered by term if provided)
    const activeEnrollments = await this.enrolRepository.count({
      where: whereClause,
    });

    // Enrollments by term
    const enrolmentsByTermRaw = await this.enrolRepository
      .createQueryBuilder('enrol')
      .select('enrol.num', 'num')
      .addSelect('enrol.year', 'year')
      .addSelect('COUNT(*)', 'count')
      .groupBy('enrol.num')
      .addGroupBy('enrol.year')
      .orderBy('enrol.year', 'DESC')
      .addOrderBy('enrol.num', 'DESC')
      .getRawMany();

    const enrollmentsByTerm = enrolmentsByTermRaw.map((e) => ({
      term: `Term ${e.num} ${e.year}`,
      count: parseInt(e.count, 10),
    }));

    // Enrollments by class
    const enrolmentsByClassQuery = this.enrolRepository
      .createQueryBuilder('enrol')
      .select('enrol.name', 'className')
      .addSelect('COUNT(*)', 'count')
      .where('enrol.year = :year', { year: filterYear })
      .groupBy('enrol.name')
      .orderBy('COUNT(*)', 'DESC');
    
    if (termNum) {
      enrolmentsByClassQuery.andWhere('enrol.num = :num', { num: termNum });
    }
    
    const enrolmentsByClass = await enrolmentsByClassQuery.getRawMany();

    // New students this year (or in the selected term year)
    const yearForNewStudents = termYear || new Date().getFullYear();
    const newStudentsThisYear = await this.studentsRepository.count({
      where: {
        dateOfJoining: Between(
          new Date(yearForNewStudents, 0, 1),
          new Date(yearForNewStudents, 11, 31),
        ),
      },
    });

    // Students by gender
    const studentsByGender = await this.studentsRepository
      .createQueryBuilder('student')
      .select('student.gender', 'gender')
      .addSelect('COUNT(*)', 'count')
      .groupBy('student.gender')
      .getRawMany();

    return {
      totalStudents,
      activeEnrollments,
      enrollmentsByTerm,
      enrollmentsByClass: enrolmentsByClass.map((e) => ({
        className: e.className,
        count: parseInt(e.count, 10),
      })),
      newStudentsThisYear,
      studentsByGender: studentsByGender.map((s) => ({
        gender: s.gender,
        count: parseInt(s.count, 10),
      })),
    };
  }

  async getFinancialAnalytics(
    startDate?: Date,
    endDate?: Date,
    termNum?: number,
    termYear?: number,
  ): Promise<FinancialAnalytics> {
    const queryBuilder = this.receiptRepository
      .createQueryBuilder('receipt')
      .leftJoin('receipt.enrol', 'enrol')
      .where('receipt.isVoided = false');

    if (termNum && termYear) {
      queryBuilder.andWhere('enrol.num = :termNum', { termNum })
        .andWhere('enrol.year = :termYear', { termYear });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('receipt.paymentDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const receipts = await queryBuilder.getMany();
    
    const invoiceQueryBuilder = this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoin('invoice.enrol', 'enrol')
      .where('invoice.isVoided = false');
    
    if (termNum && termYear) {
      invoiceQueryBuilder.andWhere('enrol.num = :termNum', { termNum })
        .andWhere('enrol.year = :termYear', { termYear });
    }
    
    const invoices = await invoiceQueryBuilder.getMany();

    const totalRevenue = receipts.reduce(
      (sum, r) => sum + Number(r.amountPaid),
      0,
    );

    const totalOutstanding = invoices.reduce(
      (sum, i) => sum + Number(i.balance),
      0,
    );

    const totalInvoiced = invoices.reduce(
      (sum, i) => sum + Number(i.totalBill),
      0,
    );

    // Revenue by month
    const revenueByMonth = receipts.reduce((acc, receipt) => {
      const month = new Date(receipt.paymentDate).toLocaleString('default', {
        month: 'short',
        year: 'numeric',
      });
      const existing = acc.find((r) => r.month === month);
      if (existing) {
        existing.amount += Number(receipt.amountPaid);
      } else {
        acc.push({ month, amount: Number(receipt.amountPaid) });
      }
      return acc;
    }, [] as Array<{ month: string; amount: number }>);

    // Payments by method
    const paymentsByMethod = receipts.reduce((acc, receipt) => {
      const method = receipt.paymentMethod;
      const existing = acc.find((p) => p.method === method);
      if (existing) {
        existing.amount += Number(receipt.amountPaid);
        existing.count += 1;
      } else {
        acc.push({
          method,
          amount: Number(receipt.amountPaid),
          count: 1,
        });
      }
      return acc;
    }, [] as Array<{ method: string; amount: number; count: number }>);

    // Outstanding by class (simplified - would need to join with enrol)
    const outstandingByClass: Array<{ className: string; amount: number }> = [];

    const collectionRate =
      totalInvoiced > 0 ? (totalRevenue / totalInvoiced) * 100 : 0;

    return {
      totalRevenue,
      totalOutstanding,
      totalInvoiced,
      revenueByMonth: revenueByMonth.sort((a, b) =>
        a.month.localeCompare(b.month),
      ),
      paymentsByMethod,
      outstandingByClass,
      collectionRate: Math.round(collectionRate * 100) / 100,
    };
  }

  async getAcademicAnalytics(
    termNum?: number,
    termYear?: number,
  ): Promise<AcademicAnalytics> {
    const whereClause: any = {};
    if (termNum) {
      whereClause.num = termNum;
    }
    if (termYear) {
      whereClause.year = termYear;
    }

    const totalReports = await this.reportsRepository.count({
      where: whereClause,
    });

    const reports = await this.reportsRepository.find({
      where: whereClause,
    });

    if (reports.length === 0) {
      return {
        totalReports: 0,
        averagePerformance: 0,
        passRate: 0,
        topPerformingClasses: [],
        subjectPerformance: [],
        reportsByTerm: [],
      };
    }

    const totalAverage =
      reports.reduce(
        (sum, r) => sum + (r.report?.percentageAverge || 0),
        0,
      ) / reports.length;

    const passedCount = reports.filter(
      (r) => (r.report?.percentageAverge || 0) >= 50,
    ).length;
    const passRate = (passedCount / reports.length) * 100;

    // Reports by term (filtered if term specified)
    const reportsByTermQuery = this.reportsRepository
      .createQueryBuilder('report')
      .select('report.num', 'num')
      .addSelect('report.year', 'year')
      .addSelect('COUNT(*)', 'count')
      .groupBy('report.num')
      .addGroupBy('report.year')
      .orderBy('report.year', 'DESC')
      .addOrderBy('report.num', 'DESC');
    
    if (termNum) {
      reportsByTermQuery.andWhere('report.num = :termNum', { termNum });
    }
    if (termYear) {
      reportsByTermQuery.andWhere('report.year = :termYear', { termYear });
    }
    
    const reportsByTermRaw = await reportsByTermQuery.getRawMany();

    const reportsByTerm = reportsByTermRaw.map((r) => ({
      term: `Term ${r.num} ${r.year}`,
      count: parseInt(r.count, 10),
    }));

    return {
      totalReports,
      averagePerformance: Math.round(totalAverage * 100) / 100,
      passRate: Math.round(passRate * 100) / 100,
      topPerformingClasses: [],
      subjectPerformance: [],
      reportsByTerm,
    };
  }

  async getUserActivityAnalytics(): Promise<UserActivityAnalytics> {
    const totalUsers = await this.accountsRepository.count();

    const usersByRole = await this.accountsRepository
      .createQueryBuilder('account')
      .select('account.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('account.role')
      .getRawMany();

    // Active users (logged in within last 30 days - simplified)
    const activeUsers = totalUsers; // Would need activity tracking

    return {
      totalUsers,
      usersByRole: usersByRole.map((u) => ({
        role: u.role,
        count: parseInt(u.count, 10),
      })),
      activeUsers,
      recentActivity: [],
    };
  }

  async getSystemAnalytics(): Promise<SystemAnalytics> {
    const totalAuditLogs = await this.auditLogRepository.count();

    const auditLogsByAction = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('audit.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.action')
      .getRawMany();

    const auditLogsByEntity = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('audit.entityType', 'entityType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.entityType')
      .getRawMany();

    return {
      totalAuditLogs,
      auditLogsByAction: auditLogsByAction.map((a) => ({
        action: a.action,
        count: parseInt(a.count, 10),
      })),
      auditLogsByEntity: auditLogsByEntity.map((e) => ({
        entityType: e.entityType,
        count: parseInt(e.count, 10),
      })),
      systemHealth: {
        databaseConnected: true,
        totalRecords: totalAuditLogs,
      },
    };
  }
}


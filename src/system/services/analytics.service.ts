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
import { MarksEntity } from 'src/marks/entities/marks.entity';

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
  dataQuality: DataQualityAnalytics;
  predictions: PredictionsAnalytics;
  metricsCatalog: MetricCatalogResponse;
  generatedAt: Date;
}

export interface MetricDefinition {
  id: string;
  name: string;
  category: 'academic' | 'finance' | 'operations' | 'system';
  ownerRole: string;
  description: string;
  formula: string;
  interpretation: string;
}

export interface MetricCatalogResponse {
  version: string;
  generatedAt: Date;
  metrics: MetricDefinition[];
}

export interface DataQualityAnalytics {
  totals: {
    marksWithoutTermId: number;
    enrolmentWithoutTermId: number;
    duplicateMarkGroups: number;
    duplicateMarkRows: number;
    reportWithoutTermId: number;
  };
  duplicateMarkSamples: Array<{
    num: number;
    year: number;
    termId: number | null;
    className: string;
    examType: string;
    subjectCode: string;
    studentNumber: string;
    duplicateCount: number;
  }>;
  marksCoverageBySubject: Array<{
    subjectCode: string;
    subjectName: string;
    enteredCount: number;
  }>;
}

export interface PredictionsAnalytics {
  atRiskStudents: Array<{
    studentNumber: string;
    average: number;
    riskLevel: 'high' | 'medium' | 'low';
    explanation: string;
  }>;
  feeDefaultRisks: Array<{
    studentNumber: string;
    invoiceNumber: string;
    balance: number;
    overdueDays: number;
    riskLevel: 'high' | 'medium' | 'low';
  }>;
  executiveForecast: {
    expectedPassRate: number;
    passRateConfidenceLow: number;
    passRateConfidenceHigh: number;
    expectedCollectionRate: number;
    collectionConfidenceLow: number;
    collectionConfidenceHigh: number;
    expectedEnrollment: number;
    enrollmentConfidenceLow: number;
    enrollmentConfidenceHigh: number;
  };
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
    @InjectRepository(MarksEntity)
    private marksRepository: Repository<MarksEntity>,
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

    const [enrollment, financial, academic, userActivity, system, dataQuality, predictions, metricsCatalog] =
      await Promise.all([
        this.getEnrollmentAnalytics(currentTermNum, currentTermYear),
        this.getFinancialAnalytics(startDate, endDate, currentTermNum, currentTermYear),
        this.getAcademicAnalytics(currentTermNum, currentTermYear),
        this.getUserActivityAnalytics(),
        this.getSystemAnalytics(),
        this.getDataQualityAnalytics(currentTermNum, currentTermYear),
        this.getPredictionsAnalytics(currentTermNum, currentTermYear),
        this.getMetricCatalog(),
      ]);

    return {
      enrollment,
      financial,
      academic,
      userActivity,
      system,
      dataQuality,
      predictions,
      metricsCatalog,
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

  async getMetricCatalog(): Promise<MetricCatalogResponse> {
    const metrics: MetricDefinition[] = [
      {
        id: 'academic.pass_rate',
        name: 'Pass Rate',
        category: 'academic',
        ownerRole: 'teacher',
        description: 'Percentage of reports with average mark >= 50.',
        formula: '(passed reports / total reports) * 100',
        interpretation: 'Higher is better; values below 70% indicate instructional risk.',
      },
      {
        id: 'academic.avg_performance',
        name: 'Average Performance',
        category: 'academic',
        ownerRole: 'teacher',
        description: 'Mean report average across selected scope.',
        formula: 'SUM(report.percentageAverge) / COUNT(reports)',
        interpretation: 'Tracks aggregate learner attainment over time.',
      },
      {
        id: 'finance.collection_rate',
        name: 'Collection Rate',
        category: 'finance',
        ownerRole: 'auditor',
        description: 'Collected receipts as a percentage of invoiced amount.',
        formula: '(total receipts / total invoiced) * 100',
        interpretation: 'Lower values indicate liquidity and arrears pressure.',
      },
      {
        id: 'operations.marks_completion',
        name: 'Marks Completion',
        category: 'operations',
        ownerRole: 'admin',
        description: 'How much marks capture is completed per class/subject context.',
        formula: '(entered marks / expected enrolment rows) * 100',
        interpretation: 'Used for reporting readiness and SLA tracking.',
      },
      {
        id: 'system.duplicate_mark_rows',
        name: 'Duplicate Mark Rows',
        category: 'system',
        ownerRole: 'dev',
        description: 'Duplicate rows sharing same learner, subject, class and exam context.',
        formula: 'SUM(duplicateCount - 1) across duplicate mark groups',
        interpretation: 'Non-zero means data hygiene regression requiring cleanup.',
      },
    ];

    return {
      version: '1.0.0',
      generatedAt: new Date(),
      metrics,
    };
  }

  async getDataQualityAnalytics(
    termNum?: number,
    termYear?: number,
  ): Promise<DataQualityAnalytics> {
    const termFilter: Record<string, number> = {};
    if (typeof termNum === 'number') {
      termFilter.num = termNum;
    }
    if (typeof termYear === 'number') {
      termFilter.year = termYear;
    }

    const marksWithoutTermId = await this.marksRepository.count({
      where: { termId: null, ...termFilter },
    });
    const enrolmentWithoutTermId = await this.enrolRepository.count({
      where: { termId: null, ...termFilter },
    });
    const reportWithoutTermId = await this.reportsRepository.count({
      where: { termId: null, ...termFilter },
    });

    const duplicateQuery = this.marksRepository
      .createQueryBuilder('m')
      .select('m.num', 'num')
      .addSelect('m.year', 'year')
      .addSelect('m.termId', 'termId')
      .addSelect('m.name', 'className')
      .addSelect('COALESCE(m.examType, \'\')', 'examType')
      .addSelect('subject.code', 'subjectCode')
      .addSelect('student.studentNumber', 'studentNumber')
      .addSelect('COUNT(*)', 'duplicateCount')
      .leftJoin('m.subject', 'subject')
      .leftJoin('m.student', 'student')
      .groupBy('m.num')
      .addGroupBy('m.year')
      .addGroupBy('m.termId')
      .addGroupBy('m.name')
      .addGroupBy('m.examType')
      .addGroupBy('subject.code')
      .addGroupBy('student.studentNumber')
      .having('COUNT(*) > 1')
      .orderBy('COUNT(*)', 'DESC');

    if (typeof termNum === 'number') {
      duplicateQuery.andWhere('m.num = :termNum', { termNum });
    }
    if (typeof termYear === 'number') {
      duplicateQuery.andWhere('m.year = :termYear', { termYear });
    }

    const duplicateRaw = await duplicateQuery.getRawMany();
    const duplicateMarkGroups = duplicateRaw.length;
    const duplicateMarkRows = duplicateRaw.reduce(
      (sum, row) => sum + Math.max(0, parseInt(row.duplicateCount, 10) - 1),
      0,
    );

    const coverageQuery = this.marksRepository
      .createQueryBuilder('m')
      .select('subject.code', 'subjectCode')
      .addSelect('subject.name', 'subjectName')
      .addSelect('COUNT(*)', 'enteredCount')
      .leftJoin('m.subject', 'subject')
      .groupBy('subject.code')
      .addGroupBy('subject.name')
      .orderBy('COUNT(*)', 'DESC');

    if (typeof termNum === 'number') {
      coverageQuery.andWhere('m.num = :termNum', { termNum });
    }
    if (typeof termYear === 'number') {
      coverageQuery.andWhere('m.year = :termYear', { termYear });
    }

    const marksCoverageBySubjectRaw = await coverageQuery.getRawMany();

    return {
      totals: {
        marksWithoutTermId,
        enrolmentWithoutTermId,
        duplicateMarkGroups,
        duplicateMarkRows,
        reportWithoutTermId,
      },
      duplicateMarkSamples: duplicateRaw.slice(0, 20).map((row) => ({
        num: parseInt(row.num, 10),
        year: parseInt(row.year, 10),
        termId: row.termId == null ? null : parseInt(row.termId, 10),
        className: row.className,
        examType: row.examType || '',
        subjectCode: row.subjectCode,
        studentNumber: row.studentNumber,
        duplicateCount: parseInt(row.duplicateCount, 10),
      })),
      marksCoverageBySubject: marksCoverageBySubjectRaw.map((row) => ({
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        enteredCount: parseInt(row.enteredCount, 10),
      })),
    };
  }

  async getPredictionsAnalytics(
    termNum?: number,
    termYear?: number,
  ): Promise<PredictionsAnalytics> {
    const reportWhere: Record<string, number> = {};
    if (typeof termNum === 'number') reportWhere.num = termNum;
    if (typeof termYear === 'number') reportWhere.year = termYear;

    const reports = await this.reportsRepository.find({ where: reportWhere });
    const atRiskStudents = reports
      .map((r) => ({
        studentNumber: r.studentNumber,
        average: Number(r.report?.percentageAverge ?? 0),
      }))
      .filter((r) => !isNaN(r.average))
      .map((r) => ({
        ...r,
        riskLevel:
          (r.average < 45 ? 'high' : r.average < 55 ? 'medium' : 'low') as
            | 'high'
            | 'medium'
            | 'low',
        explanation:
          r.average < 45
            ? 'Current average is significantly below pass threshold.'
            : r.average < 55
              ? 'Current average is marginal; intervention recommended.'
              : 'Performance currently stable.',
      }))
      .sort((a, b) => a.average - b.average)
      .slice(0, 20);

    const invoiceQuery = this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .where('invoice.isVoided = false');

    if (typeof termNum === 'number' && typeof termYear === 'number') {
      invoiceQuery
        .leftJoin('invoice.enrol', 'enrol')
        .andWhere('enrol.num = :termNum', { termNum })
        .andWhere('enrol.year = :termYear', { termYear });
    }

    const invoices = await invoiceQuery.getMany();
    const now = new Date();
    const feeDefaultRisks = invoices
      .filter((invoice) => Number(invoice.balance) > 0)
      .map((invoice) => {
        const due = invoice.invoiceDueDate ? new Date(invoice.invoiceDueDate) : now;
        const overdueDays = Math.max(
          0,
          Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)),
        );
        const balance = Number(invoice.balance);
        const highRisk = overdueDays >= 60 || balance >= 500;
        const mediumRisk = overdueDays >= 30 || balance >= 200;
        return {
          studentNumber: invoice.student?.studentNumber ?? 'Unknown',
          invoiceNumber: invoice.invoiceNumber,
          balance,
          overdueDays,
          riskLevel: (highRisk
            ? 'high'
            : mediumRisk
              ? 'medium'
              : 'low') as 'high' | 'medium' | 'low',
        };
      })
      .sort((a, b) => b.overdueDays - a.overdueDays || b.balance - a.balance)
      .slice(0, 20);

    const reportRows = await this.reportsRepository.find({
      order: { year: 'DESC', num: 'DESC' },
      take: 600,
    });
    const groupedPass = new Map<string, { total: number; passed: number }>();
    reportRows.forEach((row) => {
      const key = `${row.year}-${row.num}`;
      const avg = Number(row.report?.percentageAverge ?? 0);
      if (!groupedPass.has(key)) {
        groupedPass.set(key, { total: 0, passed: 0 });
      }
      const bucket = groupedPass.get(key)!;
      bucket.total += 1;
      if (avg >= 50) {
        bucket.passed += 1;
      }
    });
    const recentBuckets = Array.from(groupedPass.values()).slice(0, 3);
    const expectedPassRate =
      recentBuckets.length > 0
        ? recentBuckets.reduce((sum, b) => sum + (b.total > 0 ? (b.passed / b.total) * 100 : 0), 0) /
          recentBuckets.length
        : 0;

    const expectedCollectionRate = await (async () => {
      const financial = await this.getFinancialAnalytics(undefined, undefined, termNum, termYear);
      return financial.collectionRate;
    })();

    const recentEnrolments = await this.enrolRepository
      .createQueryBuilder('enrol')
      .select('enrol.year', 'year')
      .addSelect('enrol.num', 'num')
      .addSelect('COUNT(*)', 'count')
      .groupBy('enrol.year')
      .addGroupBy('enrol.num')
      .orderBy('enrol.year', 'DESC')
      .addOrderBy('enrol.num', 'DESC')
      .limit(3)
      .getRawMany();
    const expectedEnrollment =
      recentEnrolments.length > 0
        ? recentEnrolments.reduce((sum, row) => sum + Number(row.count || 0), 0) /
          recentEnrolments.length
        : 0;

    return {
      atRiskStudents,
      feeDefaultRisks,
      executiveForecast: {
        expectedPassRate: Math.round(expectedPassRate * 100) / 100,
        passRateConfidenceLow: Math.max(0, Math.round((expectedPassRate - 5) * 100) / 100),
        passRateConfidenceHigh: Math.min(100, Math.round((expectedPassRate + 5) * 100) / 100),
        expectedCollectionRate: Math.round(expectedCollectionRate * 100) / 100,
        collectionConfidenceLow: Math.max(
          0,
          Math.round((expectedCollectionRate - 6) * 100) / 100,
        ),
        collectionConfidenceHigh: Math.min(
          100,
          Math.round((expectedCollectionRate + 6) * 100) / 100,
        ),
        expectedEnrollment: Math.round(expectedEnrollment),
        enrollmentConfidenceLow: Math.max(0, Math.round(expectedEnrollment * 0.92)),
        enrollmentConfidenceHigh: Math.round(expectedEnrollment * 1.08),
      },
    };
  }
}


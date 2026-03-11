/* eslint-disable prettier/prettier */
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ParentsService } from 'src/profiles/parents/parents.service';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { ROLES } from 'src/auth/models/roles.enum';
import { DashboardService } from './dashboard.service';
import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { PaymentService } from 'src/payment/payment.service';
import { CreditService } from 'src/payment/services/credit.service';
import {
  ChildSummaryDto,
  ParentDashboardSummaryDto,
} from './dtos/parent-dashboard-summary.dto';

@Injectable()
export class ParentDashboardService {
  constructor(
    private parentsService: ParentsService,
    private dashboardService: DashboardService,
    private enrolmentService: EnrolmentService,
    private paymentService: PaymentService,
    private creditService: CreditService,
  ) {}

  async getChildrenSummary(
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentDashboardSummaryDto> {
    const allowedRoles = [ROLES.parent, ROLES.teacher];
    if (!allowedRoles.includes(profile.role as ROLES)) {
      throw new ForbiddenException(
        'Only parents and teachers with linked children can access this summary.',
      );
    }

    const children = await this.parentsService.getLinkedChildrenForProfile(
      profile,
    );
    const parentName =
      profile instanceof ParentsEntity
        ? `${profile.title ?? ''} ${profile.surname ?? ''}`.trim() ||
          profile.email
        : profile instanceof TeachersEntity
          ? `${(profile as TeachersEntity).name ?? ''} ${(profile as TeachersEntity).surname ?? ''}`.trim() ||
            (profile as any).email
          : '';
    const parentId =
      profile instanceof ParentsEntity
        ? profile.email
        : (profile as any).email ?? '';

    const childSummaries: ChildSummaryDto[] = await Promise.all(
      children.map((c) => this.buildChildSummary(c)),
    );

    return {
      parentId,
      parentName: parentName || parentId,
      children: childSummaries,
    };
  }

  private async buildChildSummary(child: {
    studentNumber: string;
    name: string;
    surname: string;
  }): Promise<ChildSummaryDto> {
    const studentNumber = child.studentNumber;
    const [dashboardSummary, enrolment, receipts, creditBalance] =
      await Promise.all([
        this.dashboardService.getStudentDashboardSummary(studentNumber),
        this.enrolmentService.getCurrentEnrollment(studentNumber),
        this.paymentService.getPaymentsByStudent(studentNumber),
        this.creditService.getStudentCreditBalance(studentNumber),
      ]);

    const lastReceipt = receipts?.length
      ? receipts[0]
      : null;

    return {
      studentNumber,
      name: child.name,
      surname: child.surname,
      profile: {
        studentNumber,
        name: child.name,
        surname: child.surname,
      },
      enrolment: enrolment
        ? {
            className: enrolment.name ?? '',
            term: enrolment.num ?? 0,
            year: enrolment.year ?? 0,
            residence: String(enrolment.residence ?? ''),
          }
        : null,
      academics: {
        numberOfReportCards:
          dashboardSummary.academicSummary?.numberOfReportCards ?? 0,
        bestPosition: dashboardSummary.academicSummary?.bestPosition ?? undefined,
        worstPosition: dashboardSummary.academicSummary?.worstPosition ?? undefined,
      },
      finance: {
        amountOwed: dashboardSummary.financialSummary?.amountOwed ?? 0,
        totalBilled: dashboardSummary.financialSummary?.totalBilled ?? 0,
        totalPaid: dashboardSummary.financialSummary?.totalPaid ?? 0,
        creditBalance: creditBalance ?? 0,
        lastReceipt: lastReceipt
          ? {
              date:
                (lastReceipt.paymentDate as Date)?.toISOString?.() ??
                String(lastReceipt.paymentDate),
              amount: Number(lastReceipt.amountPaid ?? 0),
              receiptNumber: lastReceipt.receiptNumber ?? '',
            }
          : undefined,
      },
    };
  }
}

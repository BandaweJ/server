import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentService } from './payment.service';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { CreditService } from './services/credit.service';
import { InvoiceService } from './services/invoice.service';
import { ReceiptService } from './services/receipt.service';
import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';

describe('PaymentService - reconcileClassTerm', () => {
  let service: PaymentService;
  let enrolmentService: { getEnrolmentByClass: jest.Mock };
  let invoiceService: { reconcileStudentFinancesForStudent: jest.Mock };

  beforeEach(async () => {
    enrolmentService = {
      getEnrolmentByClass: jest.fn(),
    };
    invoiceService = {
      reconcileStudentFinancesForStudent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: getRepositoryToken(AccountsEntity),
          useValue: {} as Partial<Repository<AccountsEntity>>,
        },
        {
          provide: getRepositoryToken(TeachersEntity),
          useValue: {} as Partial<Repository<TeachersEntity>>,
        },
        { provide: CreditService, useValue: {} },
        { provide: ReceiptService, useValue: {} },
        { provide: EnrolmentService, useValue: enrolmentService },
        { provide: InvoiceService, useValue: invoiceService },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  it('aggregates per-student results (success + failure) and deduplicates studentNumbers', async () => {
    const className = 'Form 1A';
    const num = 1;
    const year = 2026;

    const enrols = [
      {
        student: { studentNumber: 'S1', surname: 'Doe', name: 'Jane' },
      },
      {
        student: { studentNumber: 'S2', surname: 'Smith', name: 'John' },
      },
      {
        student: { studentNumber: 'S1', surname: 'Doe', name: 'Jane' }, // duplicate
      },
    ] as unknown as EnrolEntity[];

    enrolmentService.getEnrolmentByClass.mockResolvedValue(enrols);
    invoiceService.reconcileStudentFinancesForStudent.mockImplementation(
      async (studentNumber: string) => {
        if (studentNumber === 'S2') {
          throw new Error('boom');
        }
        return {
          success: true,
          message: 'ok',
          studentNumber,
          summary: {
            invoicesProcessed: 1,
            invoicesCorrected: 0,
            receiptsProcessed: 2,
            voidedInvoicesUnlinked: 0,
            creditApplied: false,
            creditAmount: 0,
            creditAppliedToInvoice: undefined,
            invoicesWithBalance: 0,
            totalCreditBalance: 0,
          },
        };
      },
    );

    const report = await service.reconcileClassTerm(className, num, year);

    expect(report.className).toBe(className);
    expect(report.termNum).toBe(num);
    expect(report.year).toBe(year);
    expect(report.totalStudents).toBe(2);
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(1);

    const s1 = report.results.find((r) => r.studentNumber === 'S1');
    const s2 = report.results.find((r) => r.studentNumber === 'S2');

    expect(s1).toBeDefined();
    expect(s1!.success).toBe(true);
    expect(s1!.studentName).toBe('Doe Jane');
    expect(s1!.reconciliationSummary?.receiptsProcessed).toBe(2);

    expect(s2).toBeDefined();
    expect(s2!.success).toBe(false);
    expect(s2!.error).toBe('boom');
  });
});


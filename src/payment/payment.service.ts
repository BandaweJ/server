/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  And,
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { PaymentEntity } from './entities/payment.entity';
import { StudentsService } from '../profiles/students/students.service';
import { EnrolmentService } from '../enrolment/enrolment.service';
import { InjectRepository } from '@nestjs/typeorm';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { CreatePaymentDto } from './dtos/createPayment.dto';
import { ROLES } from 'src/auth/models/roles.enum';
import { FinanceService } from 'src/finance/finance.service';
import { Invoice } from './models/invoice.model';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    // private readonly studentsService: StudentsService,
    private readonly enrolmentService: EnrolmentService,
    private readonly financeService: FinanceService,
    private studentsService: StudentsService,
  ) {}

  async createPayment(
    createPaymentDto: CreatePaymentDto,

    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<PaymentEntity> {
    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.student:
      case ROLES.teacher:
        throw new UnauthorizedException('You are not allowed to define fees');
    }

    const { student, amount, description, receiptBookNumber, paymentMethod } =
      createPaymentDto;

    const payment = this.paymentRepository.create({
      student,
      amount,
      description,
      receiptBookNumber,
      paymentMethod,
    });
    return this.paymentRepository.save(payment);
  }

  async getNotApprovedPayments(): Promise<PaymentEntity[]> {
    return await this.paymentRepository.find({
      where: {
        approved: false,
      },
    });
  }

  async getPaymentsByStudent(studentNumber: string): Promise<PaymentEntity[]> {
    //   const student = await this.studentsService.getStudent(studentNumber, profile);

    return await this.paymentRepository.find({
      where: {
        student: { studentNumber },
      },
      relations: ['student'],
    });
  }

  async getPaymentByReceiptNumber(
    receiptNumber: number,
  ): Promise<PaymentEntity> {
    return await this.paymentRepository.findOne({
      where: { receiptNumber },
    });
  }

  async getPaymentsInTerm(num: number, year: number): Promise<PaymentEntity[]> {
    const term = await this.enrolmentService.getOneTerm(num, year);

    if (!term) {
      return []; // Return an empty array if term is not found
    }

    return await this.paymentRepository.find({
      where: {
        paymentDate: And(
          MoreThanOrEqual(term.startDate),
          LessThanOrEqual(term.endDate),
        ),
      },
    });
  }

  async getPaymentsByYear(year: number): Promise<PaymentEntity[]> {
    const startDate = new Date(year, 0, 1); // January 1st of the year
    const endDate = new Date(year + 1, 0, 1); // January 1st of the next year (exclusive)

    return await this.paymentRepository.find({
      where: {
        paymentDate: Between(startDate, endDate),
      },
    });
  }

  async generateInvoice(
    studentNumber: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<any> {
    const payments = await this.getPaymentsByStudent(studentNumber);
    const bills = await this.financeService.getStudentBills(studentNumber);
    const student = await this.studentsService.getStudent(
      studentNumber,
      profile,
    );

    const totalPayments = payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const totalBill = bills.reduce(
      (sum, bill) => sum + Number(bill.fees.amount),
      0,
    );

    const balanceBfwd = await this.financeService.findStudentBalance(
      studentNumber,
    );

    const invoice: Invoice = {
      balanceBfwd,
      student,
      bills,
      payments,
      balance: totalBill - totalPayments,
    };

    return invoice;
  }

  async updatePayment(
    receiptNumber: number,
    approved: boolean,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    switch (profile.role) {
      case ROLES.admin:
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher: {
        throw new UnauthorizedException(
          'You are not allowed to approve payments',
        );
      }
    }

    return await this.paymentRepository.update(
      { receiptNumber: receiptNumber }, // Where clause: find the payment by receiptNumber
      { approved: approved }, // What to update: set approved to the provided value
    );
  }
}

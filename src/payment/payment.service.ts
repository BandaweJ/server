/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PaymentEntity } from './entities/payment.entity';
import { StudentsService } from '../profiles/students/students.service';
import { EnrolmentService } from '../enrolment/enrolment.service';
import { InjectRepository } from '@nestjs/typeorm';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { profile } from 'console';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { CreatePaymentDto } from './dtos/createPayment.dto';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    private readonly studentsService: StudentsService,
    private readonly enrolmentService: EnrolmentService,
  ) {}

  async createPayment(
    createPaymentDto: CreatePaymentDto,

    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<PaymentEntity> {
    const { studentNumber, amount, description } = createPaymentDto;
    const student = await this.studentsService.getStudent(
      studentNumber,
      profile,
    );

    const payment = this.paymentRepository.create({
      student,
      amount,
      description,
    });
    return this.paymentRepository.save(payment);
  }

  async getPaymentsByStudent(studentNumber: string): Promise<PaymentEntity[]> {
    //   const student = await this.studentsService.getStudent(studentNumber, profile);

    return this.paymentRepository.find({
      where: { student: { studentNumber } },
    });
  }

  async calculateOutstandingBalance(
    studentNumber: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<number> {
    const enrolments = await this.enrolmentService.getEnrolmentsByStudent(
      studentNumber,
      profile,
    );
    const payments = await this.getPaymentsByStudent(studentNumber);

    let totalFees = 0;
    enrolments.forEach((enrolment) => {
      totalFees += enrolment.fees.amount;
    });

    let totalPayments = 0;
    payments.forEach((payment) => {
      totalPayments += payment.amount;
    });

    return totalFees - totalPayments;
  }

  async generateInvoice(
    studentNumber: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<any> {
    const enrolments = await this.enrolmentService.getEnrolmentsByStudent(
      studentNumber,
      profile,
    );
    const payments = await this.getPaymentsByStudent(studentNumber);
    const balance = await this.calculateOutstandingBalance(
      studentNumber,
      profile,
    );

    return {
      studentNumber,
      enrolments,
      payments,
      balance,
    };
  }
}

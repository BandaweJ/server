/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreatePaymentDto } from './dtos/createPayment.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { PaymentService } from './payment.service';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';

@Controller('payment')
@UseGuards(AuthGuard())
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post()
  createPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.paymentService.createPayment(createPaymentDto, profile);
  }

  @Get('/:studentNumber')
  getPaymentsByStudent(@Param('studentNumber') studentNumber: string) {
    return this.paymentService.getPaymentsByStudent(studentNumber);
  }

  @Get('balance/:studentNumber')
  calculateOutstandingBalance(
    @Param('studentNumber') studentNumber: string,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.paymentService.calculateOutstandingBalance(
      studentNumber,
      profile,
    );
  }

  @Get('invoice/:studentNumber')
  generateInvoice(
    @Param('studentNumber') studentNumber: string,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.paymentService.generateInvoice(studentNumber, profile);
  }
}

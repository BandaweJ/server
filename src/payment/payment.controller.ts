/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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

  @Get()
  getNotApprovedPayments() {
    return this.paymentService.getNotApprovedPayments();
  }

  @Get('invoice/:studentNumber')
  generateInvoice(
    @Param('studentNumber') studentNumber: string,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.paymentService.generateInvoice(studentNumber);
  }

  @Get('receipt/:receiptNumber')
  getPaymentByReceiptNumber(
    @Param('receiptNumber', ParseIntPipe) receiptNumber: number,
  ) {
    return this.paymentService.getPaymentByReceiptNumber(receiptNumber);
  }

  @Get('/:num/:year')
  getPaymentsInTerm(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.paymentService.getPaymentsInTerm(num, year);
  }

  @Get('/:year')
  getPaymentsInYear(@Param('year', ParseIntPipe) year: number) {
    return this.paymentService.getPaymentsByYear(year);
  }

  @Patch('/:receiptNumber/:approved')
  updatePayment(
    @Param('receiptNumber', ParseIntPipe) receiptNumber: number,
    @Param('approved') approved: boolean,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.paymentService.updatePayment(receiptNumber, approved, profile);
  }
}

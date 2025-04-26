/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateFeesDto } from './dtos/fees.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { FinanceService } from './finance.service';
import { CreateBalancesDto } from './dtos/balances.dto';
import { CreateBillDto } from './dtos/bills.dto';

@Controller('finance')
@UseGuards(AuthGuard())
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  @Get('fees')
  getAllFees() {
    return this.financeService.getAllFees();
  }

  @Post('fees')
  createFees(
    @Body() createFeesDto: CreateFeesDto,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.financeService.createFees(createFeesDto, profile);
  }

  @Post('fees/balance')
  createFeesBalance(
    @Body() createBalanceDto: CreateBalancesDto,
    @GetUser() profile: TeachersEntity,
  ) {
    // console.log('create balance');
    return this.financeService.createBalance(createBalanceDto, profile);
  }

  @Patch('fees/:id')
  updateFees(
    @Param('id', ParseIntPipe) id: number,
    @Body() createFeesDto: CreateFeesDto,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.financeService.updateFees(id, createFeesDto, profile);
  }

  @Delete('fees/:id')
  deleteFees(@Param('id', ParseIntPipe) id: number) {
    return this.financeService.deleteFees(id);
  }

  @Get('fees/:id')
  getFeesById(@Param('id', ParseIntPipe) id: number) {
    return this.financeService.findOneFee(id);
  }

  @Post('billing')
  createBills(@Body() bills: CreateBillDto[]) {
    return this.financeService.createBills(bills);
  }

  @Delete('billing/:id')
  removeBill(@Param('id', ParseIntPipe) id: number) {
    return this.financeService.removeBill(id);
  }

  @Get('billing')
  getAllBills() {
    return this.financeService.getAllBills();
  }

  @Get('/billing/:id')
  getBillById(@Param('id', ParseIntPipe) id: number) {
    return this.financeService.getBillById(id);
  }

  @Get('biiling/:studentNumber')
  getStudentBills(@Param('studentNumber') studentNumber: string) {
    return this.financeService.getStudentBills(studentNumber);
  }

  @Get('billing/:num/:year')
  getBillsByEnrolment(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.financeService.getBillsByEnrolment(num, year);
  }

  @Get('billing/:year')
  getBillsByYear(@Param('year', ParseIntPipe) year: number) {
    return this.financeService.getBillsByYear;
  }

  @Get('billing/total/:num/:year')
  getTotalBillByTerm(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.financeService.getTotalBillByTerm(num, year);
  }

  @Get('billing/total/:year')
  getTotalBillByYear(@Param('year', ParseIntPipe) year: number) {
    return this.financeService.getTotalBillsByYear(year);
  }

  @Get('billing/tobill/:num/:year')
  getStudentsNotBilledForTerm(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.financeService.findStudentsNotBilledForTerm(num, year);
  }

  // @Post('balance')
  // createBalance(
  //   @Body() createBalance: CreateBalancesDto,
  // ): Promise<BalancesEntity> {
  //   return this.financeService.createBalance(createBalance);
  // }
}

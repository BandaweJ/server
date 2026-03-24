import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateFeesDto } from './dtos/fees.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { FinanceService } from './finance.service';
import { CreateBalancesDto } from './dtos/balances.dto';
import { CreateBillDto } from './dtos/bills.dto';
import { ParentStudentAccessGuard } from 'src/auth/guards/parent-student-access.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { HasPermissions } from 'src/auth/decorators/has-permissions.decorator';
import { PERMISSIONS } from 'src/auth/models/permissions.constants';

@Controller('finance')
@UseGuards(JwtAuthGuard, PermissionsGuard, ParentStudentAccessGuard)
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  @Get('fees')
  @HasPermissions(PERMISSIONS.FINANCE.VIEW)
  getAllFees() {
    return this.financeService.getAllFees();
  }

  @Post('fees')
  @HasPermissions(PERMISSIONS.FINANCE.MANAGE_FEES)
  createFees(
    @Body() createFeesDto: CreateFeesDto,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.financeService.createFees(createFeesDto, profile);
  }

  @Post('fees/balance')
  @HasPermissions(PERMISSIONS.FINANCE.MANAGE_FEES)
  createFeesBalance(
    @Body() createBalanceDto: CreateBalancesDto,
    @GetUser() profile: TeachersEntity,
  ) {
    // console.log('create balance');
    return this.financeService.createBalance(createBalanceDto, profile);
  }

  @Patch('fees/:id')
  @HasPermissions(PERMISSIONS.FINANCE.EDIT)
  updateFees(
    @Param('id', ParseIntPipe) id: number,
    @Body() createFeesDto: CreateFeesDto,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.financeService.updateFees(id, createFeesDto, profile);
  }

  @Delete('fees/:id')
  @HasPermissions(PERMISSIONS.FINANCE.DELETE)
  deleteFees(@Param('id', ParseIntPipe) id: number) {
    return this.financeService.deleteFees(id);
  }

  @Get('fees/:id')
  @HasPermissions(PERMISSIONS.FINANCE.VIEW)
  getFeesById(@Param('id', ParseIntPipe) id: number) {
    return this.financeService.findOneFee(id);
  }

  @Post('billing')
  @HasPermissions(PERMISSIONS.FINANCE.CREATE)
  createBills(@Body() bills: CreateBillDto[]) {
    return this.financeService.createBills(bills);
  }

  @Delete('billing/:id')
  @HasPermissions(PERMISSIONS.FINANCE.DELETE)
  removeBill(@Param('id', ParseIntPipe) id: number) {
    return this.financeService.removeBill(id);
  }

  @Get('billing')
  @HasPermissions(PERMISSIONS.FINANCE.VIEW)
  getAllBills() {
    return this.financeService.getAllBills();
  }

  @Get('/billing/:id')
  @HasPermissions(PERMISSIONS.FINANCE.VIEW)
  getBillById(@Param('id', ParseIntPipe) id: number) {
    return this.financeService.getBillById(id);
  }

  @Get('biiling/:studentNumber')
  @HasPermissions(PERMISSIONS.FINANCE.VIEW)
  getStudentBills(@Param('studentNumber') studentNumber: string) {
    return this.financeService.getStudentBills(studentNumber);
  }

  @Get('billing/:num/:year')
  @HasPermissions(PERMISSIONS.FINANCE.VIEW)
  getBillsByEnrolment(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
    @Query('termId') termId?: string,
  ) {
    return this.financeService.getBillsByEnrolment(
      num,
      year,
      termId ? parseInt(termId, 10) : undefined,
    );
  }

  @Get('billing/:year')
  @HasPermissions(PERMISSIONS.FINANCE.VIEW)
  getBillsByYear(@Param('year', ParseIntPipe) year: number) {
    return this.financeService.getBillsByYear;
  }

  @Get('billing/total/:num/:year')
  @HasPermissions(PERMISSIONS.FINANCE.VIEW)
  getTotalBillByTerm(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
    @Query('termId') termId?: string,
  ) {
    return this.financeService.getTotalBillByTerm(
      num,
      year,
      termId ? parseInt(termId, 10) : undefined,
    );
  }

  @Get('billing/total/:year')
  @HasPermissions(PERMISSIONS.FINANCE.VIEW)
  getTotalBillByYear(@Param('year', ParseIntPipe) year: number) {
    return this.financeService.getTotalBillsByYear(year);
  }

  @Get('billing/tobill/:num/:year')
  @HasPermissions(PERMISSIONS.FINANCE.VIEW)
  getStudentsNotBilledForTerm(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
    @Query('termId') termId?: string,
  ) {
    return this.financeService.findStudentsNotBilledForTerm(
      num,
      year,
      termId ? parseInt(termId, 10) : undefined,
    );
  }

  // @Post('balance')
  // createBalance(
  //   @Body() createBalance: CreateBalancesDto,
  // ): Promise<BalancesEntity> {
  //   return this.financeService.createBalance(createBalance);
  // }
}

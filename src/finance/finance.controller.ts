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
import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { CreateFeesDto } from './dtos/fees.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { FinanceService } from './finance.service';

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
    return this.financeService.delete(id);
  }
}

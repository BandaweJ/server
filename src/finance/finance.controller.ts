/* eslint-disable prettier/prettier */
import { Controller, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EnrolmentService } from 'src/enrolment/enrolment.service';

@Controller('finance')
@UseGuards(AuthGuard())
export class FinanceController {
  constructor(private enrolmentService: EnrolmentService) {}
}

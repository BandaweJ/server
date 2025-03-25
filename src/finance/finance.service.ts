/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { EnrolmentService } from 'src/enrolment/enrolment.service';

/* eslint-disable prettier/prettier */
@Injectable()
export class FinanceService {
  constructor(private enrolmentService: EnrolmentService) {}
}

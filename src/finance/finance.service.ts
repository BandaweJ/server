/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { FeesEntity } from './entities/fees.entity';
import { Repository } from 'typeorm';
import { Residence } from 'src/enrolment/models/residence.model';

/* eslint-disable prettier/prettier */
@Injectable()
export class FinanceService {
  constructor(
    // private enrolmentService: EnrolmentService,

    @InjectRepository(FeesEntity)
    private feesRepository: Repository<FeesEntity>,
  ) {}

  async getFeeByResidence(
    residence: Residence,
    num: number,
    year: number,
  ): Promise<FeesEntity | undefined> {
    return await this.feesRepository.findOne({
      where: { residence, num, year },
    });
  }
}

/* eslint-disable prettier/prettier */
import { Injectable, NotAcceptableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { FeesEntity } from './entities/fees.entity';
import { Repository } from 'typeorm';
import { Residence } from 'src/enrolment/models/residence.model';
import { CreateFeesDto } from './dtos/fees.dto';
import { profile } from 'console';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';

/* eslint-disable prettier/prettier */
@Injectable()
export class FinanceService {
  constructor(
    // private enrolmentService: EnrolmentService,

    @InjectRepository(FeesEntity)
    private feesRepository: Repository<FeesEntity>,
  ) {}

  async getAllFees(): Promise<FeesEntity[]> {
    return await this.feesRepository.find();
  }

  async createFees(createFeesDto: CreateFeesDto, profile: TeachersEntity) {
    const { num, year, residence, amount, description } = createFeesDto;

    const fee = await this.feesRepository.findOne({
      where: {
        num,
        year,
        residence,
      },
    });

    if (fee) {
      throw new NotAcceptableException(
        `Fees for Term ${num} ${year} for residence ${residence} already exists`,
      );
    }

    const feeToSave = new FeesEntity();

    feeToSave.amount = amount;
    feeToSave.num = num;
    feeToSave.year = year;
    feeToSave.residence = residence;
    feeToSave.description = description;

    return await this.feesRepository.save(feeToSave);
  }

  async getFeeByResidence(
    residence: Residence,
    num: number,
    year: number,
  ): Promise<FeesEntity | undefined> {
    return await this.feesRepository.findOne({
      where: { residence, num, year },
    });
  }

  async updateFees(
    id: number,
    createFeesDto: CreateFeesDto,
    profile: TeachersEntity,
  ) {
    const { num, residence, year } = createFeesDto;
    const fee = await this.feesRepository.findOne({ where: { id } });

    if (!fee) {
      throw new NotAcceptableException(
        `Fees for Term ${num} ${year} for residence ${residence} does not exist`,
      );
    }

    return await this.feesRepository.save({
      ...fee,
      ...createFeesDto,
    });
  }
}

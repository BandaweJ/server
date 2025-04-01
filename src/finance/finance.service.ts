/* eslint-disable prettier/prettier */
import {
  ConflictException,
  Injectable,
  NotAcceptableException,
  NotFoundException,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
// import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { FeesEntity } from './entities/fees.entity';
import { Repository } from 'typeorm';

import { CreateFeesDto } from './dtos/fees.dto';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { BillsEntity } from './entities/bills.entity';
import { ROLES } from 'src/auth/models/roles.enum';
import { FeesNames } from './models/fees-names.enum';

/* eslint-disable prettier/prettier */
@Injectable()
export class FinanceService {
  constructor(
    // private enrolmentService: EnrolmentService,

    @InjectRepository(FeesEntity)
    private feesRepository: Repository<FeesEntity>,
    @InjectRepository(BillsEntity)
    private billsRepository: Repository<BillsEntity>, // private enrolmentService: EnrolmentService,
  ) {}

  async getAllFees(): Promise<FeesEntity[]> {
    return await this.feesRepository.find();
  }

  async findOneFee(id: number): Promise<FeesEntity | undefined> {
    return this.feesRepository.findOne({ where: { id } });
  }

  async createFees(createFeesDto: CreateFeesDto, profile: TeachersEntity) {
    switch (profile.role) {
      case ROLES.teacher:
      case ROLES.student:
      case ROLES.parent:
      case ROLES.hod: {
        throw new UnauthorizedException('You are not allowed to manage fees');
      }
    }
    const { amount, description, name } = createFeesDto;

    const fee = await this.getFeeByName(name);

    if (fee) {
      throw new NotAcceptableException(
        `Fees for ${name} already exists. Edit it to change`,
      );
    }

    const feeToSave = new FeesEntity();

    feeToSave.amount = amount;
    feeToSave.description = description;
    feeToSave.name = name;

    return await this.feesRepository.save(feeToSave);
  }

  async getFeeByName(name: FeesNames): Promise<FeesEntity | undefined> {
    return await this.feesRepository.findOne({
      where: { name },
    });
  }

  async updateFees(
    id: number,
    createFeesDto: CreateFeesDto,
    profile: TeachersEntity,
  ) {
    switch (profile.role) {
      case ROLES.parent:
      case ROLES.hod:
      case ROLES.student:
      case ROLES.teacher: {
        throw new UnauthorizedException(
          'You are not authorised to change fees',
        );
      }
    }
    const { name } = createFeesDto;
    const fee = await this.findOneFee(id);

    if (!fee) {
      throw new NotAcceptableException(`Fees for for ${name} does not exist`);
    }

    return await this.feesRepository.save({
      id,
      ...fee,
      ...createFeesDto,
    });
  }

  async deleteFees(id: number): Promise<number> {
    const fee = await this.findOneFee(id);
    if (!fee) {
      throw new NotFoundException(`Fees with ID ${id} not found`);
    }

    try {
      const result = await this.feesRepository.delete(id);
      if (result.affected === 0) {
        throw new NotFoundException(`Fees with ID ${id} not found`);
      } else return result.affected;
    } catch (e) {
      throw new NotImplementedException('Fees was not deleted');
    }
  }

  async getAllBills(): Promise<BillsEntity[]> {
    return await this.billsRepository.find();
  }

  async getBillById(id: number): Promise<BillsEntity> {
    return await this.billsRepository.findOne({
      where: {
        id,
      },
      relations: ['student', 'fees', 'enrol'],
    });
  }

  async getStudentBills(studentNumber: string): Promise<BillsEntity[]> {
    return await this.billsRepository.find({
      where: {
        student: { studentNumber },
      },
      relations: ['enrol', 'fees'],
    });
  }

  async getBillsByFeesName(name: FeesNames): Promise<BillsEntity[]> {
    return await this.billsRepository.find({
      where: {
        fees: {
          name,
        },
      },
    });
  }

  async getBillsByEnrolment(num: number, year: number): Promise<BillsEntity[]> {
    return await this.billsRepository.find({
      where: {
        enrol: {
          num,
          year,
        },
      },
      relations: ['fees'],
    });
  }

  async getBillsByYear(year: number): Promise<BillsEntity[]> {
    return await this.billsRepository.find({
      where: {
        enrol: {
          year,
        },
      },
      relations: ['fees'],
    });
  }

  async getTotalBillByTerm(num: number, year: number): Promise<number> {
    const termBills = await this.getBillsByEnrolment(num, year);

    if (!termBills || termBills.length === 0) {
      return 0; // Return 0 if there are no bills for the term.
    }

    const totalBill = termBills.reduce((sum, bill) => {
      if (bill.fees && bill.fees.amount) {
        return sum + Number(bill.fees.amount); // Convert to number
      }
      return sum; // If fee or amount is missing, don't add anything.
    }, 0);

    return totalBill;
  }

  async getTotalBillsByYear(year: number): Promise<number> {
    const yearBills = await this.getBillsByYear(year);

    if (!yearBills || yearBills.length === 0) {
      return 0;
    }

    const totalBill = yearBills.reduce((sum, bill) => {
      if (bill.fees && bill.fees.amount) {
        return sum + Number(bill.fees.amount);
      }
      return sum;
    }, 0);

    return totalBill;
  }

  // async getStudentsNotBilledForTerm(num: number, year: number) {
  //   return await this.enrolmentService.findStudentsNotBilledForTermQueryBuilder(
  //     num,
  //     year,
  //   );
  // }
}

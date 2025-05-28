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
import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { BalancesEntity } from './entities/balances.entity';
import { CreateBalancesDto } from './dtos/balances.dto';
// import { profile } from 'console';
import { CreateBillDto } from './dtos/bills.dto';

/* eslint-disable prettier/prettier */
@Injectable()
export class FinanceService {
  constructor(
    private enrolmentService: EnrolmentService,

    @InjectRepository(BalancesEntity)
    private balancesRepository: Repository<BalancesEntity>,

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

  async createBills(bills: CreateBillDto[]): Promise<BillsEntity[]> {
    const savedBills: BillsEntity[] = [];

    for (const billDto of bills) {
      // Check if a bill with the same student, fees, and enrolment already exists
      const existingBill = await this.billsRepository.findOne({
        where: {
          student: { studentNumber: billDto.student.studentNumber },
          fees: { id: billDto.fees.id },
          enrol: { id: billDto.enrol.id },
        },
      });

      if (!existingBill) {
        // If no duplicate exists, create and save the new bill
        const newBill = this.billsRepository.create();
        newBill.student = billDto.student;
        newBill.enrol = billDto.enrol;
        newBill.fees = billDto.fees;

        const savedBill = await this.billsRepository.save(newBill);
        savedBills.push(savedBill);
      }
    }

    return savedBills;
  }

  async removeBill(id: number): Promise<BillsEntity> {
    const bill = await this.billsRepository.findOne({
      where: { id },
      relations: ['fees'],
    });

    if (!bill) {
      throw new NotFoundException(`Bill with ID ${id} not found`);
    } else {
      const result = await this.billsRepository.delete(id);
      if (result.affected === 0) {
        throw new NotFoundException(`Bill with ID ${id} not found`);
      } else return bill;
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

  async getStudentBillsByTerm(
    studentNumber: string,
    num: number,
    year: number,
  ) {
    return await this.billsRepository.find({
      where: {
        student: { studentNumber },
        enrol: {
          num,
          year,
        },
      },
      relations: ['fees', 'enrol', 'student'],
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

  async findStudentsNotBilledForTerm(
    num: number,
    year: number,
  ): Promise<EnrolEntity[]> {
    // 1. Find all enrolments for the given term.
    const enrolments = await this.enrolmentService.getEnrolmentByTerm(
      num,
      year,
    );

    //2. Get all bills for the term
    const bills = await this.billsRepository.find({
      where: { enrol: { num, year } },
      relations: ['enrol', 'student'],
    });

    // Extract student IDs from bills
    const billedStudentIds = bills.map((bill) => bill.student.studentNumber);

    // Filter enrolments to find students not in bills
    const studentsNotBilled = enrolments
      .filter(
        (enrol) => !billedStudentIds.includes(enrol.student.studentNumber),
      )
      .map((enrol) => enrol);

    //remove duplicate students
    const uniqueStudentsNotBilled = studentsNotBilled.filter(
      (enrol, index, self) =>
        index ===
        self.findIndex(
          (s) => s.student.studentNumber === enrol.student.studentNumber,
        ),
    );
    return uniqueStudentsNotBilled;
  }

  async findStudentBalance(studentNumber: string): Promise<BalancesEntity> {
    const balance = await this.balancesRepository.findOne({
      where: {
        studentNumber,
      },
    });

    if (!balance) {
      const b = await this.balancesRepository.create();
      b.amount = 0;
      b.studentNumber = studentNumber;
      return await this.balancesRepository.save(b);
    }
    return balance;
  }

  async createBalance(
    createBalanceDto: CreateBalancesDto,
    profile: TeachersEntity,
  ): Promise<BalancesEntity> {
    const { studentNumber } = createBalanceDto;

    const savedBalance = await this.balancesRepository.findOne({
      where: {
        studentNumber,
      },
    });

    if (savedBalance) {
      // throw new NotImplementedException(
      //   'Balance for this student was already set',
      // );
      return await this.balancesRepository.save({
        ...savedBalance,
        ...createBalanceDto,
      });
    }

    return await this.balancesRepository.save({
      ...createBalanceDto,
    });
  }

  async updateBalance(
    studentNumber: string,
    amount: number,
  ): Promise<BalancesEntity> {
    const savedBalance = await this.balancesRepository.findOne({
      where: {
        studentNumber,
      },
    });
    if (!savedBalance) {
      throw new NotFoundException('Balance for this student was not found');
    }

    savedBalance.amount = amount;

    return await this.balancesRepository.save({
      ...savedBalance,
    });
  }

  async deleteBalance(balanceBfwd: BalancesEntity) {
    if (balanceBfwd && balanceBfwd.id) {
      // Ensure balanceBfwd exists and has an ID
      try {
        await this.balancesRepository.remove(balanceBfwd);
        
      } catch (deleteError) {
        // Log the error but don't re-throw, as the invoice was already saved.
        // You might want a compensation mechanism or an alert here.
        console.error(
          `Failed to remove BalancesEntity with ID ${balanceBfwd.id}:`,
          deleteError.message,
        );
      }
    }
  }
}

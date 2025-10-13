/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { CreateStudentDto } from '../dtos/createStudents.dto';
import { StudentsEntity } from '../entities/students.entity';
import { UpdateStudentDto } from '../dtos/updateStudent.dto';
import { ResourceByIdService } from 'src/resource-by-id/resource-by-id.service';
import { TeachersEntity } from '../entities/teachers.entity';
import { ParentsEntity } from '../entities/parents.entity';
import { ROLES } from '../../auth/models/roles.enum';
import { UnauthorizedException } from '@nestjs/common';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentsEntity)
    private studentsRepository: Repository<StudentsEntity>,
    private resourceById: ResourceByIdService,
  ) {}

  async getStudent(
    studentNumber: string,
    profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ): Promise<StudentsEntity> {
    switch (profile.role) {
      case ROLES.admin:
      case ROLES.hod:
      case ROLES.teacher:
      case ROLES.reception: {
        return await this.resourceById.getStudentByStudentNumber(studentNumber);
        break;
      }
      case ROLES.parent: {
        const student = await this.resourceById.getStudentByStudentNumber(
          studentNumber,
        );
        if (student.parent == profile) {
          return student;
        } else {
          throw new UnauthorizedException(
            'Parents can only access records of their children',
          );
        }
        break;
      }
      case ROLES.student: {
        const student = await this.resourceById.getStudentByStudentNumber(
          studentNumber,
        );
        if ('studentNumber' in profile) {
          if (profile.studentNumber === student.studentNumber) {
            return student;
          } else {
            throw new UnauthorizedException(
              'you can only access your own record',
            );
          }
        }
      }
    }
  }

  async getAllStudents(
    profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ): Promise<StudentsEntity[]> {
    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student: {
        throw new UnauthorizedException(
          'You are not allowed to retrieve list of all students',
        );
      }
    }
    return await this.studentsRepository.find();
  }

  async createStudent(
    createStudentDto: CreateStudentDto,
    profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ): Promise<StudentsEntity> {
    // A more explicit way to handle roles
    if (profile.role !== ROLES.admin && profile.role !== ROLES.reception) {
      throw new UnauthorizedException('Only admins can add new students');
    }

    // Step 1: Check for an existing student with the same name and surname
    const existingStudent = await this.studentsRepository.findOne({
      where: {
        name: createStudentDto.name,
        surname: createStudentDto.surname,
      },
    });

    if (existingStudent) {
      throw new BadRequestException(
        `A student with the name '${createStudentDto.name}' and surname '${createStudentDto.surname}' already exists.`,
      );
    }

    // Step 2: Proceed with the original logic if no duplicate is found
    const newStudentNumber = await this.nextStudentNumber();

    try {
      return await this.studentsRepository.save({
        ...createStudentDto,
        studentNumber: newStudentNumber,
      });
    } catch (err) {
      // Keep the original check for the unique idnumber database error
      if (err.code === 'ER_DUP_ENTRY') {
        throw new BadRequestException(
          `Student with same ID Number already exists`,
        );
      } else {
        throw new NotImplementedException('Failed to save student' + err);
      }
    }
  }

  async deleteStudent(
    studentNumber: string,
  ): Promise<{ studentNumber: string }> {
    const student = await this.studentsRepository.findOne({
      where: {
        studentNumber,
      },
    });

    if (!student) {
      throw new NotFoundException(
        `Student with StudentNumer ${studentNumber} not found`,
      );
    }

    const result = await this.studentsRepository.delete(studentNumber);

    if (!result.affected)
      throw new NotImplementedException(
        `Student with StudentNumer ${studentNumber} not deleted`,
      );
    // return result.affected;
    return { studentNumber };
  }

  async updateStudent(
    studentNumber: string,
    updateStudentDto: UpdateStudentDto,
    profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ): Promise<StudentsEntity> {
    const student = await this.getStudent(studentNumber, profile);

    return await this.studentsRepository.save({
      ...student,
      ...updateStudentDto,
    });
  }

  private async nextStudentNumber(): Promise<string> {
    /* Student Number format
     * LYYMMNNNC where
     * L is a single character representing the school name eg S for Sandon Academy
     * YY is the current year
     * MM is the current month
     * NNN is a sequential number
     * C is the check digit
     */

    const schoolPrefix = 'S';
    const today = new Date();
    const YY = today.getFullYear().toString().substring(2);
    // Use padStart for safe two-digit month formatting
    const MM = (today.getMonth() + 1).toString().padStart(2, '0');

    // Step 1: Use a more efficient query to find the max student number for the current month.
    const searchPrefix = schoolPrefix + YY + MM;
    const lastStudent = await this.studentsRepository.findOne({
      where: {
        studentNumber: Like(`${searchPrefix}%`),
      },
      order: { studentNumber: 'DESC' },
    });

    let sequentialNumber: number;

    if (lastStudent) {
      // Step 2: Extract and safely increment the sequential number.
      // Use slice to get the last 3 digits, convert to a number, and increment.
      const lastNNN = parseInt(lastStudent.studentNumber.slice(-4, -1), 10);
      sequentialNumber = lastNNN + 1;
    } else {
      // Step 3: Start with 0 if no students exist for the current month.
      sequentialNumber = 0;
    }

    // Step 4: Pad the sequential number with leading zeros to 3 digits.
    const NNN = sequentialNumber.toString().padStart(3, '0');

    // Step 5: Assemble the student number parts.
    const rawStudentNumber = schoolPrefix + YY + MM + NNN;

    // Step 6: Calculate and append the check digit.
    const checkDigit = this.calculateCheckDigit(rawStudentNumber);

    return rawStudentNumber + checkDigit;
  }

  /**
   * Calculates a check digit using the Luhn algorithm (Mod 10).
   * @param rawStudentNumber The student number without the check digit, including the letter prefix.
   * @returns The calculated check digit (a single number).
   */
  private calculateCheckDigit(rawStudentNumber: string): number {
    let sum = 0;
    let isSecondDigit = false;

    // --- CORRECTION: Only use the numeric part of the student number for the calculation ---
    const numericPart = rawStudentNumber.substring(1);

    // Iterate through the digits of the numeric part from right to left
    for (let i = numericPart.length - 1; i >= 0; i--) {
      let digit = parseInt(numericPart.charAt(i), 10);

      if (isSecondDigit) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isSecondDigit = !isSecondDigit;
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    // console.log('check digit: ', checkDigit);

    return checkDigit;
  }

  async findNewComerStudentsQueryBuilder(): Promise<StudentsEntity[]> {
    return await this.studentsRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.enrols', 'enrol')
      .groupBy('student.id')
      .having('COUNT(enrol.id) = 1')
      .getMany();
  }

  // In StudentsService
  async getStudentByStudentNumberWithExemption(
    studentNumber: string,
  ): Promise<StudentsEntity | null> {
    return this.studentsRepository.findOne({
      where: { studentNumber },
      relations: ['exemption'], // Ensure 'exemption' relation is loaded
    });
  }
}

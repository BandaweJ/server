/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentsService } from 'src/profiles/students/students.service';
import { PaymentService } from 'src/payment/payment.service';
import { ExemptionEntity } from './entities/exemptions.entity'; // Corrected import path for ExemptionType
import { CreateExemptionDto } from './dtos/createExemption.dto'; // Corrected import path for DTO
import { UpdateExemptionDto } from './dtos/updateExemption.dto';
import { ExemptionType } from './enums/exemptions-type.enum';

@Injectable()
export class ExemptionService {
  // Renamed from ExemptionsService for consistency
  constructor(
    @InjectRepository(ExemptionEntity)
    private readonly exemptionRepository: Repository<ExemptionEntity>,
    private readonly studentsService: StudentsService,
    private readonly paymentService: PaymentService,
  ) {}

  async saveExemption(
    createExemptionDto: CreateExemptionDto,
  ): Promise<ExemptionEntity> {
    const {
      studentNumber,
      type,
      fixedAmount,
      percentageAmount,
      description,
      isActive,
    } = createExemptionDto;

    const student =
      await this.studentsService.getStudentByStudentNumberWithExemption(
        studentNumber,
      );

    if (!student) {
      throw new NotFoundException(
        `Student with student number ${studentNumber} not found.`,
      );
    }

    // --- Corrected Input Validation based on ExemptionType ---
    if (type === ExemptionType.PERCENTAGE) {
      if (percentageAmount === undefined || percentageAmount === null) {
        throw new BadRequestException(
          'Percentage amount is required for PERCENTAGE exemption type.',
        );
      }
      if (percentageAmount < 0 || percentageAmount > 100) {
        throw new BadRequestException(
          'Percentage amount must be between 0 and 100.',
        );
      }
      // Ensure fixedAmount is null for PERCENTAGE type
      createExemptionDto.fixedAmount = null;
    } else if (type === ExemptionType.FIXED_AMOUNT) {
      // Only FIXED_AMOUNT here
      if (fixedAmount === undefined || fixedAmount === null) {
        throw new BadRequestException(
          'Fixed amount is required for FIXED_AMOUNT exemption type.',
        );
      }
      if (fixedAmount < 0) {
        throw new BadRequestException('Fixed amount cannot be negative.');
      }
      // Ensure percentageAmount is null for FIXED_AMOUNT type
      createExemptionDto.percentageAmount = null;
    } else if (type === ExemptionType.STAFF_SIBLING) {
      // Handle STAFF_SIBLING separately
      // For STAFF_SIBLING, no specific fixedAmount or percentageAmount is stored
      // on the ExemptionEntity itself. Its presence signals the dynamic rule.
      // Ensure both fields are null in the entity.
      createExemptionDto.fixedAmount = null;
      createExemptionDto.percentageAmount = null;
    } else {
      throw new BadRequestException('Invalid exemption type provided.');
    }
    // --- End Input Validation ---

    let exemption: ExemptionEntity;

    if (student.exemption) {
      // If an exemption already exists for this student, update it
      exemption = student.exemption;
      exemption.type = type;
      // Assign the (potentially null) values from the DTO after validation logic
      exemption.fixedAmount = createExemptionDto.fixedAmount;
      exemption.percentageAmount = createExemptionDto.percentageAmount;
      exemption.description =
        description !== undefined ? description : exemption.description;
      exemption.isActive =
        isActive !== undefined ? isActive : exemption.isActive;
    } else {
      // Otherwise, create a new exemption
      exemption = this.exemptionRepository.create({
        student: student,
        type,
        fixedAmount: createExemptionDto.fixedAmount, // Assign the (potentially null) values
        percentageAmount: createExemptionDto.percentageAmount, // Assign the (potentially null) values
        description,
        isActive: isActive !== undefined ? isActive : true,
      });
    }

    const savedExemption = await this.exemptionRepository.save(exemption);

    // Apply the exemption to any existing invoices for this student
    await this.paymentService.applyExemptionToExistingInvoices(studentNumber);

    return savedExemption;
  }

  async getExemptionByStudentNumber(
    studentNumber: string,
  ): Promise<ExemptionEntity | null> {
    const student =
      await this.studentsService.getStudentByStudentNumberWithExemption(
        studentNumber,
      );
    return student?.exemption || null;
  }

  async deactivateExemption(studentNumber: string): Promise<ExemptionEntity> {
    const student =
      await this.studentsService.getStudentByStudentNumberWithExemption(
        studentNumber,
      );
    if (!student || !student.exemption) {
      throw new NotFoundException(
        `Exemption for student ${studentNumber} not found.`,
      );
    }
    student.exemption.isActive = false;
    const deactivatedExemption = await this.exemptionRepository.save(
      student.exemption,
    );
    // As clarified, no need to affect previous invoices when deactivating.
    return deactivatedExemption;
  }

  /**
   * Get all exemptions with optional filters
   */
  async getAllExemptions(
    studentNumber?: string,
    type?: ExemptionType,
    isActive?: boolean,
  ): Promise<ExemptionEntity[]> {
    const queryBuilder = this.exemptionRepository
      .createQueryBuilder('exemption')
      .leftJoinAndSelect('exemption.student', 'student')
      .orderBy('exemption.createdAt', 'DESC');

    if (studentNumber) {
      queryBuilder.andWhere('student.studentNumber = :studentNumber', {
        studentNumber,
      });
    }

    if (type) {
      queryBuilder.andWhere('exemption.type = :type', { type });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('exemption.isActive = :isActive', { isActive });
    }

    return queryBuilder.getMany();
  }

  /**
   * Get exemption by ID
   */
  async getExemptionById(id: number): Promise<ExemptionEntity> {
    const exemption = await this.exemptionRepository.findOne({
      where: { id },
      relations: ['student'],
    });

    if (!exemption) {
      throw new NotFoundException(`Exemption with ID ${id} not found.`);
    }

    return exemption;
  }

  /**
   * Update exemption by ID
   */
  async updateExemption(
    id: number,
    updateExemptionDto: UpdateExemptionDto,
  ): Promise<ExemptionEntity> {
    const exemption = await this.exemptionRepository.findOne({
      where: { id },
      relations: ['student'],
    });

    if (!exemption) {
      throw new NotFoundException(`Exemption with ID ${id} not found.`);
    }

    const { type, fixedAmount, percentageAmount, description, isActive } =
      updateExemptionDto;

    // Validate and update type if provided
    if (type !== undefined) {
      exemption.type = type;
    }

    // Validate and update amounts based on type
    const exemptionType = type || exemption.type;

    if (exemptionType === ExemptionType.PERCENTAGE) {
      if (percentageAmount !== undefined) {
        if (percentageAmount < 0 || percentageAmount > 100) {
          throw new BadRequestException(
            'Percentage amount must be between 0 and 100.',
          );
        }
        exemption.percentageAmount = percentageAmount;
      }
      exemption.fixedAmount = null;
    } else if (exemptionType === ExemptionType.FIXED_AMOUNT) {
      if (fixedAmount !== undefined) {
        if (fixedAmount < 0) {
          throw new BadRequestException('Fixed amount cannot be negative.');
        }
        exemption.fixedAmount = fixedAmount;
      }
      exemption.percentageAmount = null;
    } else if (exemptionType === ExemptionType.STAFF_SIBLING) {
      exemption.fixedAmount = null;
      exemption.percentageAmount = null;
    }

    // Update other fields if provided
    if (description !== undefined) {
      exemption.description = description;
    }

    if (isActive !== undefined) {
      exemption.isActive = isActive;
    }

    const updatedExemption = await this.exemptionRepository.save(exemption);

    // Apply the exemption to any existing invoices for this student
    await this.paymentService.applyExemptionToExistingInvoices(
      exemption.student.studentNumber,
    );

    return updatedExemption;
  }

  /**
   * Delete exemption by ID
   */
  async deleteExemption(id: number): Promise<void> {
    const exemption = await this.exemptionRepository.findOne({
      where: { id },
      relations: ['student'],
    });

    if (!exemption) {
      throw new NotFoundException(`Exemption with ID ${id} not found.`);
    }

    await this.exemptionRepository.remove(exemption);
  }
}

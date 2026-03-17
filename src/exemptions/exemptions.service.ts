import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StudentsService } from 'src/profiles/students/students.service';
import { PaymentService } from 'src/payment/payment.service';
import { ExemptionEntity } from './entities/exemptions.entity'; // Corrected import path for ExemptionType
import { CreateExemptionDto } from './dtos/createExemption.dto'; // Corrected import path for DTO
import { UpdateExemptionDto } from './dtos/updateExemption.dto';
import { ExemptionType } from './enums/exemptions-type.enum';
import { InvoiceEntity } from 'src/payment/entities/invoice.entity';
import { BillsEntity } from 'src/finance/entities/bills.entity';
import { FeesNames } from 'src/finance/models/fees-names.enum';
import { InvoiceService } from 'src/payment/services/invoice.service';

@Injectable()
export class ExemptionService {
  // Renamed from ExemptionsService for consistency
  constructor(
    @InjectRepository(ExemptionEntity)
    private readonly exemptionRepository: Repository<ExemptionEntity>,
    private readonly studentsService: StudentsService,
    private readonly paymentService: PaymentService,
    private readonly dataSource: DataSource,
    private readonly invoiceService: InvoiceService,
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
  async deleteExemption(id: number): Promise<{ id: number }> {
    const exemption = await this.exemptionRepository.findOne({
      where: { id },
      relations: ['student'],
    });

    if (!exemption) {
      throw new NotFoundException(`Exemption with ID ${id} not found.`);
    }

    const studentNumber = exemption.student?.studentNumber;

    // 1) Deactivate exemption (audit/history), 2) unlink from invoices + remove exemption bills,
    // 3) recompute invoice totals/balances without exemption, all atomically.
    await this.dataSource.transaction(async (em) => {
      // Soft-delete / deactivate
      exemption.isActive = false;
      await em.save(ExemptionEntity, exemption);

      const invoiceRepo = em.getRepository(InvoiceEntity);
      const billsRepo = em.getRepository(BillsEntity);

      const invoices = await invoiceRepo.find({
        where: { exemption: { id: exemption.id } },
        relations: ['bills', 'bills.fees', 'balanceBfwd'],
      });

      if (invoices.length === 0) {
        return;
      }

      const invoiceIds: number[] = [];

      for (const inv of invoices) {
        invoiceIds.push(inv.id);

        // Remove exemption bill rows (negative discount line item)
        const exemptionBills = (inv.bills ?? []).filter(
          (b) => b.fees?.name === FeesNames.exemption,
        );
        if (exemptionBills.length > 0) {
          await billsRepo.remove(exemptionBills);
        }

        const remainingBills = (inv.bills ?? []).filter(
          (b) => b.fees?.name !== FeesNames.exemption,
        );

        inv.bills = remainingBills;
        inv.exemption = null;
        inv.exemptedAmount = 0;

        const billsTotal = remainingBills.reduce(
          (sum, b) => sum + Number(b.fees?.amount ?? 0),
          0,
        );
        const balanceBfwdAmount = Number(inv.balanceBfwd?.amount ?? 0);
        inv.totalBill = Math.max(0, Math.round((billsTotal + balanceBfwdAmount) * 100) / 100);

        await invoiceRepo.save(inv);
      }

      // Recompute balance/status from totalBill - amountPaidOnInvoice
      // (single source of truth already implemented in InvoiceService).
      await this.invoiceService.recomputeAndPersistInvoiceBalances(invoiceIds, em);
    });

    // Run reconciliation after totals are updated to repair allocations/credits.
    if (studentNumber) {
      await this.paymentService.reconcileStudentFinances(studentNumber);
    }

    return { id };
  }
}

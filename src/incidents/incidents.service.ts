import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { RoomEntity } from 'src/inventory/entities/room.entity';
import { InventoryItemEntity } from 'src/inventory/entities/inventory-item.entity';
import { TextbookCopyEntity } from 'src/library/entities/textbook-copy.entity';
import { EnrolmentService } from 'src/enrolment/enrolment.service';
import { InvoiceChargeEntity } from 'src/payment/entities/invoice-charge.entity';
import { InvoiceChargeStatus } from 'src/payment/models/invoice-charge-status.enum';
import { ROLES } from 'src/auth/models/roles.enum';
import { ChargeableIncidentEntity } from './entities/chargeable-incident.entity';
import { CreateIncidentDto } from './dtos/create-incident.dto';
import { IncidentStatus } from './models/incident-status.enum';

type AuthProfile = TeachersEntity & { role: ROLES; accountId?: string };

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(ChargeableIncidentEntity)
    private readonly incidentsRepo: Repository<ChargeableIncidentEntity>,
    @InjectRepository(TeachersEntity)
    private readonly teachersRepo: Repository<TeachersEntity>,
    @InjectRepository(StudentsEntity)
    private readonly studentsRepo: Repository<StudentsEntity>,
    @InjectRepository(RoomEntity)
    private readonly roomsRepo: Repository<RoomEntity>,
    @InjectRepository(InventoryItemEntity)
    private readonly inventoryItemsRepo: Repository<InventoryItemEntity>,
    @InjectRepository(TextbookCopyEntity)
    private readonly textbookCopiesRepo: Repository<TextbookCopyEntity>,
    @InjectRepository(InvoiceChargeEntity)
    private readonly invoiceChargesRepo: Repository<InvoiceChargeEntity>,
    private readonly enrolmentService: EnrolmentService,
  ) {}

  private async getTeacher(profile: AuthProfile): Promise<TeachersEntity> {
    const teacher = await this.teachersRepo.findOne({ where: { id: profile.id } });
    if (!teacher) throw new BadRequestException('Teacher profile not found');
    return teacher;
  }

  async create(profile: AuthProfile, dto: CreateIncidentDto): Promise<ChargeableIncidentEntity> {
    // teacher or hod can report
    if (![ROLES.teacher, ROLES.hod, ROLES.seniorTeacher].includes(profile.role)) {
      throw new ForbiddenException('Not allowed to report incidents');
    }

    const teacher = await this.getTeacher(profile);
    if (!teacher.departmentId) {
      throw new BadRequestException(
        'Teacher is not assigned to a department. Please update their department first.',
      );
    }

    if (dto.studentNumber) {
      const student = await this.studentsRepo.findOne({
        where: { studentNumber: dto.studentNumber },
      });
      if (!student) throw new BadRequestException('Student not found');
    }

    if (dto.roomId) {
      const room = await this.roomsRepo.findOne({ where: { id: dto.roomId } });
      if (!room) throw new BadRequestException('Room not found');
      if (room.departmentId !== teacher.departmentId) {
        throw new ForbiddenException('Room is not in your department');
      }
    }

    if (dto.inventoryItemId) {
      const item = await this.inventoryItemsRepo.findOne({
        where: { id: dto.inventoryItemId },
      });
      if (!item) throw new BadRequestException('Inventory item not found');
      if (item.departmentId !== teacher.departmentId) {
        throw new ForbiddenException('Inventory item is not in your department');
      }
    }

    if (dto.textbookCopyId) {
      const copy = await this.textbookCopiesRepo.findOne({
        where: { id: dto.textbookCopyId },
      });
      if (!copy) throw new BadRequestException('Textbook copy not found');
      if (copy.departmentId !== teacher.departmentId) {
        throw new ForbiddenException('Textbook copy is not in your department');
      }
    }

    const incident = this.incidentsRepo.create({
      type: dto.type,
      departmentId: teacher.departmentId,
      roomId: dto.roomId ?? null,
      reportedByTeacherId: teacher.id,
      studentNumber: dto.studentNumber ?? null,
      description: dto.description.trim(),
      replacementCost: dto.replacementCost,
      status: IncidentStatus.Submitted,
      textbookCopyId: dto.textbookCopyId ?? null,
      inventoryItemId: dto.inventoryItemId ?? null,
    });

    return this.incidentsRepo.save(incident);
  }

  async getMine(profile: AuthProfile): Promise<ChargeableIncidentEntity[]> {
    const teacher = await this.getTeacher(profile);
    const qb = this.incidentsRepo
      .createQueryBuilder('inc')
      .leftJoinAndSelect('inc.department', 'department')
      .leftJoinAndSelect('inc.room', 'room')
      .leftJoinAndSelect('inc.reportedBy', 'reportedBy')
      .leftJoinAndSelect('inc.student', 'student')
      .orderBy('inc.createdAt', 'DESC');

    if (profile.role === ROLES.hod) {
      if (!teacher.departmentId) throw new ForbiddenException('No department assigned');
      qb.where('inc.departmentId = :deptId', { deptId: teacher.departmentId });
    } else {
      qb.where('inc.reportedByTeacherId = :tid', { tid: teacher.id });
    }

    return qb.getMany();
  }

  async getPendingApproval(profile: AuthProfile): Promise<ChargeableIncidentEntity[]> {
    const teacher = await this.getTeacher(profile);
    const qb = this.incidentsRepo
      .createQueryBuilder('inc')
      .leftJoinAndSelect('inc.department', 'department')
      .leftJoinAndSelect('inc.room', 'room')
      .leftJoinAndSelect('inc.reportedBy', 'reportedBy')
      .leftJoinAndSelect('inc.student', 'student')
      .orderBy('inc.createdAt', 'DESC');

    if (profile.role === ROLES.hod) {
      if (!teacher.departmentId) throw new ForbiddenException('No department assigned');
      qb.where('inc.departmentId = :deptId', { deptId: teacher.departmentId }).andWhere(
        'inc.status = :s',
        { s: IncidentStatus.Submitted },
      );
    } else if (profile.role === ROLES.deputy) {
      qb.where('inc.status = :s', { s: IncidentStatus.HodConfirmed });
    } else if (profile.role === ROLES.head) {
      qb.where('inc.status = :s', { s: IncidentStatus.DeputySigned });
    } else if (profile.role === ROLES.auditor || profile.role === ROLES.director) {
      qb.where('inc.status = :s', { s: IncidentStatus.HeadSigned });
    } else if (profile.role === ROLES.admin || profile.role === ROLES.dev) {
      qb.where('inc.status IN (:...statuses)', {
        statuses: [
          IncidentStatus.Submitted,
          IncidentStatus.HodConfirmed,
          IncidentStatus.DeputySigned,
          IncidentStatus.HeadSigned,
        ],
      });
    } else {
      return [];
    }

    return qb.getMany();
  }

  private async getByIdOrThrow(id: string): Promise<ChargeableIncidentEntity> {
    const incident = await this.incidentsRepo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async confirmHod(profile: AuthProfile, id: string): Promise<ChargeableIncidentEntity> {
    if (profile.role !== ROLES.hod && profile.role !== ROLES.dev && profile.role !== ROLES.admin) {
      throw new ForbiddenException('Only HOD can confirm incidents');
    }
    const teacher = await this.getTeacher(profile);
    const incident = await this.getByIdOrThrow(id);
    if (incident.status !== IncidentStatus.Submitted) return incident;
    if (profile.role === ROLES.hod) {
      if (!teacher.departmentId || incident.departmentId !== teacher.departmentId) {
        throw new ForbiddenException('Can only confirm incidents for your department');
      }
    }

    incident.hodConfirmedAt = new Date();
    incident.hodConfirmedById = teacher.id;
    incident.status = IncidentStatus.HodConfirmed;
    return this.incidentsRepo.save(incident);
  }

  async signDeputy(profile: AuthProfile, id: string): Promise<ChargeableIncidentEntity> {
    if (profile.role !== ROLES.deputy && profile.role !== ROLES.dev && profile.role !== ROLES.admin) {
      throw new ForbiddenException('Only deputy can sign incidents at this stage');
    }
    const teacher = await this.getTeacher(profile);
    const incident = await this.getByIdOrThrow(id);
    if (incident.status !== IncidentStatus.HodConfirmed) {
      throw new BadRequestException(`Cannot sign when status is "${incident.status}"`);
    }
    incident.deputySignedAt = new Date();
    incident.deputySignedById = teacher.id;
    incident.status = IncidentStatus.DeputySigned;
    return this.incidentsRepo.save(incident);
  }

  async signHead(profile: AuthProfile, id: string): Promise<ChargeableIncidentEntity> {
    if (profile.role !== ROLES.head && profile.role !== ROLES.dev && profile.role !== ROLES.admin) {
      throw new ForbiddenException('Only head can sign incidents at this stage');
    }
    const teacher = await this.getTeacher(profile);
    const incident = await this.getByIdOrThrow(id);
    if (incident.status !== IncidentStatus.DeputySigned) {
      throw new BadRequestException(`Cannot sign when status is "${incident.status}"`);
    }
    incident.headSignedAt = new Date();
    incident.headSignedById = teacher.id;
    incident.status = IncidentStatus.HeadSigned;
    return this.incidentsRepo.save(incident);
  }

  async accept(profile: AuthProfile, id: string): Promise<ChargeableIncidentEntity> {
    if (
      ![ROLES.auditor, ROLES.director, ROLES.dev, ROLES.admin].includes(profile.role)
    ) {
      throw new ForbiddenException('Only auditor or director can accept incidents');
    }
    const teacher = await this.getTeacher(profile);
    const incident = await this.getByIdOrThrow(id);
    if (incident.status !== IncidentStatus.HeadSigned) {
      throw new BadRequestException(`Cannot accept when status is "${incident.status}"`);
    }
    incident.acceptedAt = new Date();
    incident.acceptedById = teacher.id;
    incident.status = IncidentStatus.Accepted;
    const saved = await this.incidentsRepo.save(incident);

    // Create a pending variable-amount charge for the student's current enrolment
    // (only when the incident is linked to a student).
    if (saved.studentNumber) {
      const currentEnrol = await this.enrolmentService.getCurrentEnrollment(
        saved.studentNumber,
      );
      if (currentEnrol?.id) {
        const existing = await this.invoiceChargesRepo.findOne({
          where: {
            sourceType: 'incident',
            sourceId: saved.id,
            studentNumber: saved.studentNumber,
            enrolId: currentEnrol.id,
            status: InvoiceChargeStatus.PendingInvoicing,
            isVoided: false,
          },
        });

        if (!existing) {
          const charge = this.invoiceChargesRepo.create({
            studentNumber: saved.studentNumber,
            enrolId: currentEnrol.id,
            amount: saved.replacementCost,
            description: saved.description,
            sourceType: 'incident',
            sourceId: saved.id,
            status: InvoiceChargeStatus.PendingInvoicing,
            isVoided: false,
          });
          await this.invoiceChargesRepo.save(charge);
        }
      }
    }

    return saved;
  }

  async reject(profile: AuthProfile, id: string, reason: string): Promise<ChargeableIncidentEntity> {
    if (
      ![ROLES.auditor, ROLES.director, ROLES.dev, ROLES.admin].includes(profile.role)
    ) {
      throw new ForbiddenException('Only auditor or director can reject incidents');
    }
    const teacher = await this.getTeacher(profile);
    const incident = await this.getByIdOrThrow(id);
    if (incident.status === IncidentStatus.Accepted) {
      throw new BadRequestException('Cannot reject an already accepted incident');
    }
    if (incident.status === IncidentStatus.Rejected) return incident;

    incident.rejectedAt = new Date();
    incident.rejectedById = teacher.id;
    incident.rejectionReason = (reason || '').trim();
    incident.status = IncidentStatus.Rejected;
    return this.incidentsRepo.save(incident);
  }
}


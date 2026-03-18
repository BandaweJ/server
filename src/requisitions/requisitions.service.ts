import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequisitionEntity } from './entities/requisition.entity';
import { RequisitionItemEntity } from './entities/requisition-item.entity';
import { DepartmentEntity } from 'src/profiles/entities/department.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { CreateRequisitionDto } from './dtos/create-requisition.dto';
import { RequisitionStatus } from './models/requisition-status.enum';
import { ROLES } from 'src/auth/models/roles.enum';

@Injectable()
export class RequisitionsService {
  private readonly logger = new Logger(RequisitionsService.name);

  constructor(
    @InjectRepository(RequisitionEntity)
    private readonly requisitionsRepository: Repository<RequisitionEntity>,
    @InjectRepository(RequisitionItemEntity)
    private readonly requisitionItemsRepository: Repository<RequisitionItemEntity>,
    @InjectRepository(DepartmentEntity)
    private readonly departmentsRepository: Repository<DepartmentEntity>,
    @InjectRepository(TeachersEntity)
    private readonly teachersRepository: Repository<TeachersEntity>,
  ) {}

  private ensureCreatorRole(profile: TeachersEntity & { role: ROLES }) {
    const allowed = [
      ROLES.hod,
      ROLES.seniorTeacher,
      ROLES.deputy,
      ROLES.head,
    ];
    if (!allowed.includes(profile.role)) {
      throw new ForbiddenException('Not allowed to create requisitions');
    }
  }

  async createRequisition(
    dto: CreateRequisitionDto,
    profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity> {
    this.ensureCreatorRole(profile);

    const teacher = await this.teachersRepository.findOne({
      where: { id: profile.id },
      relations: ['department'],
    });

    if (!teacher) {
      throw new BadRequestException('Teacher profile not found');
    }

    if (!teacher.department) {
      throw new BadRequestException(
        'Teacher is not assigned to a department. Please update their department first.',
      );
    }

    const requisition = new RequisitionEntity();
    requisition.title = dto.title;
    requisition.description = dto.description;
    requisition.department = teacher.department;
    requisition.createdBy = teacher;
    requisition.status = RequisitionStatus.InReviewDeputy;

    const items = dto.items.map((itemDto) => {
      const item = new RequisitionItemEntity();
      item.description = itemDto.description;
      item.quantity = itemDto.quantity;
      item.intendedUse = itemDto.intendedUse;
      item.requisition = requisition;
      return item;
    });

    requisition.items = items;

    this.logger.log('Creating requisition', {
      teacherId: teacher.id,
      departmentId: teacher.department.id,
      title: dto.title,
      items: dto.items.length,
    });

    return this.requisitionsRepository.save(requisition);
  }

  async getMyRequisitions(
    profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity[]> {
    const teacher = await this.teachersRepository.findOne({
      where: { id: profile.id },
      relations: ['department'],
    });
    if (!teacher) {
      throw new BadRequestException('Teacher profile not found');
    }

    const qb = this.requisitionsRepository
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.department', 'department')
      .leftJoinAndSelect('req.createdBy', 'createdBy')
      .leftJoinAndSelect('req.items', 'items')
      .orderBy('req.createdAt', 'DESC');

    const isDeptScoped =
      profile.role === ROLES.hod || profile.role === ROLES.seniorTeacher;

    if (isDeptScoped) {
      qb.where('req.departmentId = :deptId', {
        deptId: (teacher.department as DepartmentEntity).id,
      });
    } else {
      qb.where('req.createdById = :teacherId', { teacherId: teacher.id });
    }

    return qb.getMany();
  }

  async getPendingReceiving(
    profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity[]> {
    // Receiving is a department operational workflow; only HOD (department scoped) is expected to action it.
    if (profile.role !== ROLES.hod) {
      throw new ForbiddenException('Only HOD can view pending receiving list');
    }

    const teacher = await this.teachersRepository.findOne({
      where: { id: profile.id },
      relations: ['department'],
    });
    if (!teacher) {
      throw new BadRequestException('Teacher profile not found');
    }
    if (!teacher.department) {
      throw new BadRequestException(
        'Teacher is not assigned to a department. Please update their department first.',
      );
    }

    // Authorised requisitions that are not fully received.
    // We treat "pending receiving" as any requisition with at least one line where receivedQuantity < quantity.
    return this.requisitionsRepository
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.department', 'department')
      .leftJoinAndSelect('req.createdBy', 'createdBy')
      .leftJoinAndSelect('req.items', 'items')
      .where('req.departmentId = :deptId', {
        deptId: (teacher.department as DepartmentEntity).id,
      })
      .andWhere('req.status = :status', { status: RequisitionStatus.Authorized })
      .andWhere(
        `EXISTS (
          SELECT 1
          FROM requisition_items ri
          WHERE ri."requisitionId" = req.id
            AND COALESCE(ri."receivedQuantity", 0) < COALESCE(ri."quantity", 0)
        )`,
      )
      .orderBy('req.createdAt', 'DESC')
      .getMany();
  }

  async getAllRequisitions(): Promise<RequisitionEntity[]> {
    return this.requisitionsRepository.find({
      relations: [
        'department',
        'createdBy',
        'items',
        'deputySignedBy',
        'headSignedBy',
        'authorisedBy',
        'receivedBy',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async getRequisitionById(id: string): Promise<RequisitionEntity> {
    const requisition = await this.requisitionsRepository.findOne({
      where: { id },
      relations: [
        'department',
        'createdBy',
        'items',
        'deputySignedBy',
        'headSignedBy',
        'authorisedBy',
        'receivedBy',
      ],
    });
    if (!requisition) {
      throw new BadRequestException('Requisition not found');
    }
    return requisition;
  }

  async signAsDeputy(
    id: string,
    profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity> {
    if (profile.role !== ROLES.deputy) {
      throw new ForbiddenException('Only deputies can sign as deputy');
    }

    const requisition = await this.requisitionsRepository.findOne({
      where: { id },
      relations: ['department', 'createdBy', 'items'],
    });
    if (!requisition) {
      throw new BadRequestException('Requisition not found');
    }

    if (
      requisition.status !== RequisitionStatus.InReviewDeputy &&
      requisition.status !== RequisitionStatus.Submitted
    ) {
      throw new BadRequestException(
        `Cannot sign as deputy when requisition is "${requisition.status}"`,
      );
    }

    if (requisition.deputySignedAt) {
      return requisition;
    }

    const deputy = await this.teachersRepository.findOne({
      where: { id: profile.id },
    });
    if (!deputy) {
      throw new BadRequestException('Deputy profile not found');
    }

    requisition.deputySignedBy = deputy;
    requisition.deputySignedAt = new Date();
    requisition.status = RequisitionStatus.InReviewHead;

    return this.requisitionsRepository.save(requisition);
  }

  async signAsHead(
    id: string,
    profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity> {
    if (profile.role !== ROLES.head) {
      throw new ForbiddenException('Only the head can sign at this stage');
    }

    const requisition = await this.requisitionsRepository.findOne({
      where: { id },
      relations: ['department', 'createdBy', 'items'],
    });
    if (!requisition) {
      throw new BadRequestException('Requisition not found');
    }

    if (requisition.status !== RequisitionStatus.InReviewHead) {
      throw new BadRequestException(
        `Cannot sign as head when requisition is "${requisition.status}"`,
      );
    }

    if (requisition.headSignedAt) {
      return requisition;
    }

    const head = await this.teachersRepository.findOne({
      where: { id: profile.id },
    });
    if (!head) {
      throw new BadRequestException('Head profile not found');
    }

    requisition.headSignedBy = head;
    requisition.headSignedAt = new Date();
    requisition.status = RequisitionStatus.AwaitingAuthorization;

    return this.requisitionsRepository.save(requisition);
  }

  async authorise(
    id: string,
    profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity> {
    if (![ROLES.auditor, ROLES.director].includes(profile.role)) {
      throw new ForbiddenException('Only auditor or director can authorise');
    }

    const requisition = await this.requisitionsRepository.findOne({
      where: { id },
      relations: ['department', 'createdBy', 'items'],
    });
    if (!requisition) {
      throw new BadRequestException('Requisition not found');
    }

    if (requisition.status !== RequisitionStatus.AwaitingAuthorization) {
      throw new BadRequestException(
        `Cannot authorise when requisition is "${requisition.status}"`,
      );
    }

    if (requisition.authorisedAt) {
      return requisition;
    }

    const authoriser = await this.teachersRepository.findOne({
      where: { id: profile.id },
    });
    if (!authoriser) {
      throw new BadRequestException('Authoriser profile not found');
    }

    requisition.authorisedBy = authoriser;
    requisition.authorisedAt = new Date();
    requisition.status = RequisitionStatus.Authorized;

    return this.requisitionsRepository.save(requisition);
  }

  async reject(
    id: string,
    profile: TeachersEntity & { role: ROLES },
    reason: string,
  ): Promise<RequisitionEntity> {
    if (![ROLES.auditor, ROLES.director].includes(profile.role)) {
      throw new ForbiddenException('Only auditor or director can reject');
    }

    const requisition = await this.requisitionsRepository.findOne({
      where: { id },
      relations: [
        'department',
        'createdBy',
        'items',
        'deputySignedBy',
        'headSignedBy',
        'authorisedBy',
      ],
    });
    if (!requisition) {
      throw new BadRequestException('Requisition not found');
    }

    if (requisition.status !== RequisitionStatus.AwaitingAuthorization) {
      throw new BadRequestException(
        `Cannot reject when requisition is "${requisition.status}"`,
      );
    }

    if (requisition.authorisedAt) {
      return requisition;
    }

    const authoriser = await this.teachersRepository.findOne({
      where: { id: profile.id },
    });
    if (!authoriser) {
      throw new BadRequestException('Authoriser profile not found');
    }

    requisition.authorisedBy = authoriser;
    requisition.authorisedAt = new Date();
    requisition.rejectionReason = (reason || '').trim();
    requisition.status = RequisitionStatus.Rejected;

    return this.requisitionsRepository.save(requisition);
  }
}


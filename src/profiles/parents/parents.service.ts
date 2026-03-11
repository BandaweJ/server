import {
  Injectable,
  NotImplementedException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ParentsEntity } from '../entities/parents.entity';
import { Repository } from 'typeorm';
import { CreateParentsDto } from '../dtos/createParents.dto';
import { UpdateParentDto } from '../dtos/updateParent.dto';
import { ResourceByIdService } from '../../resource-by-id/resource-by-id.service';
import { TeachersEntity } from '../entities/teachers.entity';
import { StudentsEntity } from '../entities/students.entity';
import { ROLES } from '../../auth/models/roles.enum';

@Injectable()
export class ParentsService {
  constructor(
    @InjectRepository(ParentsEntity)
    private parentsRepository: Repository<ParentsEntity>,
    @InjectRepository(StudentsEntity)
    private studentsRepository: Repository<StudentsEntity>,
    private resourceById: ResourceByIdService,
  ) {}

  /**
   * Returns linked children (studentNumber, name, surname) for the current user.
   * Used by parent dashboard: parent sees own linked students; teacher with same email as a parent sees that parent's linked students.
   */
  async getLinkedChildrenForProfile(
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<{ studentNumber: string; name: string; surname: string }[]> {
    if (profile.role === ROLES.parent && profile instanceof ParentsEntity) {
      const parent = await this.parentsRepository.findOne({
        where: { email: profile.email },
        relations: ['students'],
      });
      if (!parent?.students?.length) return [];
      return parent.students.map((s) => ({
        studentNumber: s.studentNumber,
        name: s.name ?? '',
        surname: s.surname ?? '',
      }));
    }
    if (profile.role === ROLES.teacher) {
      const email = (profile as TeachersEntity).email;
      if (!email) return [];
      const parent = await this.parentsRepository.findOne({
        where: { email },
        relations: ['students'],
      });
      if (!parent?.students?.length) return [];
      return parent.students.map((s) => ({
        studentNumber: s.studentNumber,
        name: s.name ?? '',
        surname: s.surname ?? '',
      }));
    }
    return [];
  }

  async getParent(
    email: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentsEntity> {
    switch (profile.role) {
      case ROLES.admin:
      case ROLES.director:
      case ROLES.auditor:
      case ROLES.hod:
      case ROLES.reception:
      case ROLES.teacher: {
        return await this.resourceById.getParentByEmail(email, true);
      }
      case ROLES.student: {
        const parent = await this.resourceById.getParentByEmail(email, true);
        if (profile instanceof StudentsEntity) {
          if (profile.parent?.email === parent.email) {
            return parent;
          }
          throw new UnauthorizedException('Can only access own parent');
        }
        throw new UnauthorizedException('Invalid profile');
      }
      case ROLES.parent: {
        if (profile instanceof ParentsEntity && profile.email === email) {
          return this.resourceById.getParentByEmail(email, true);
        }
        throw new UnauthorizedException('Only allowed to access your own record');
      }
      default:
        throw new UnauthorizedException('Access denied');
    }
  }

  async getAllParents(
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentsEntity[]> {
    if (profile.role === ROLES.parent || profile.role === ROLES.student) {
      throw new UnauthorizedException(
        'Only members of staff can access parent list',
      );
    }
    // Default staff view: show first N parents ordered by surname/email.
    return await this.parentsRepository.find({
      relations: ['students'],
      order: { surname: 'ASC', email: 'ASC' },
      take: 100,
    });
  }

  /**
   * Search parents by surname, email, or cell (case-insensitive), limited for performance.
   * Staff only (same as getAllParents).
   */
  async searchParents(
    query: string,
    limit: number,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentsEntity[]> {
    if (profile.role === ROLES.parent || profile.role === ROLES.student) {
      throw new UnauthorizedException(
        'Only members of staff can access parent list',
      );
    }

    const take = Math.max(1, Math.min(limit || 50, 200));
    const qb = this.parentsRepository
      .createQueryBuilder('parent')
      .leftJoinAndSelect('parent.students', 'student')
      .orderBy('parent.surname', 'ASC')
      .addOrderBy('parent.email', 'ASC')
      .take(take);

    const trimmed = (query || '').trim().toLowerCase();
    if (trimmed) {
      qb.where(
        'LOWER(parent.surname) LIKE :q OR LOWER(parent.email) LIKE :q OR LOWER(parent.cell) LIKE :q',
        { q: `%${trimmed}%` },
      );
    }

    return qb.getMany();
  }

  async createParent(
    createParentDto: CreateParentsDto,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentsEntity> {
    if (
      profile.role !== ROLES.admin &&
      profile.role !== ROLES.director &&
      profile.role !== ROLES.reception &&
      profile.role !== ROLES.dev
    ) {
      throw new UnauthorizedException(
        'Only admin, director, reception, or dev can add parents',
      );
    }
    return await this.parentsRepository.save(createParentDto as Partial<ParentsEntity>);
  }

  async deleteParent(
    email: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<number> {
    if (profile.role !== ROLES.admin && profile.role !== ROLES.director && profile.role !== ROLES.dev) {
      throw new UnauthorizedException('Only admin, director, or dev can delete parents');
    }
    const parent = await this.parentsRepository.findOne({
      where: { email },
      relations: ['students'],
    });
    if (parent?.students?.length) {
      for (const student of parent.students) {
        student.parent = null;
        await this.studentsRepository.save(student);
      }
    }
    const result = await this.parentsRepository.delete(email);
    if (!result.affected) {
      throw new NotImplementedException(
        `Parent with email ${email} not deleted`,
      );
    }
    return result.affected;
  }

  async updateParent(
    email: string,
    updateParentDto: UpdateParentDto,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentsEntity> {
    const parent = await this.getParent(email, profile);
    if (updateParentDto.email && updateParentDto.email !== email) {
      throw new BadRequestException(
        'Changing parent email is not allowed. Create a new parent record instead.',
      );
    }
    return await this.parentsRepository.save({
      ...parent,
      ...updateParentDto,
    });
  }

  /**
   * Set which students are linked to this parent. Replaces existing links.
   * Only staff (admin, director, reception) can update links.
   */
  async setLinkedStudents(
    parentEmail: string,
    studentNumbers: string[],
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentsEntity> {
    if (
      profile.role !== ROLES.admin &&
      profile.role !== ROLES.director &&
      profile.role !== ROLES.reception &&
      profile.role !== ROLES.dev
    ) {
      throw new UnauthorizedException(
        'Only admin, director, reception, or dev can link parents to students',
      );
    }
    const parent = await this.parentsRepository.findOne({
      where: { email: parentEmail },
      relations: ['students'],
    });
    if (!parent) {
      throw new BadRequestException(`Parent with email ${parentEmail} not found`);
    }
    const currentStudents = parent.students || [];
    const newSet = new Set(studentNumbers);

    for (const student of currentStudents) {
      if (!newSet.has(student.studentNumber)) {
        student.parent = null;
        await this.studentsRepository.save(student);
      }
    }
    for (const studentNumber of newSet) {
      const student = await this.studentsRepository.findOne({
        where: { studentNumber },
        relations: ['parent'],
      });
      if (!student) {
        throw new BadRequestException(
          `Student ${studentNumber} not found`,
        );
      }
      student.parent = parent;
      await this.studentsRepository.save(student);
    }
    return this.parentsRepository.findOne({
      where: { email: parentEmail },
      relations: ['students'],
    });
  }
}

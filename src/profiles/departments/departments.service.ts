import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentEntity } from '../entities/department.entity';
import { TeachersEntity } from '../entities/teachers.entity';
import { DepartmentSubjectEntity } from '../entities/department-subject.entity';
import { SubjectsEntity } from 'src/marks/entities/subjects.entity';
import { CreateDepartmentDto } from '../dtos/create-department.dto';
import { UpdateDepartmentDto } from '../dtos/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(DepartmentEntity)
    private readonly departmentsRepository: Repository<DepartmentEntity>,
    @InjectRepository(TeachersEntity)
    private readonly teachersRepository: Repository<TeachersEntity>,
    @InjectRepository(DepartmentSubjectEntity)
    private readonly departmentSubjectsRepository: Repository<DepartmentSubjectEntity>,
    @InjectRepository(SubjectsEntity)
    private readonly subjectsRepository: Repository<SubjectsEntity>,
  ) {}

  async findAll(): Promise<DepartmentEntity[]> {
    return this.departmentsRepository.find({
      relations: ['hod', 'teachers', 'subjectMappings', 'subjectMappings.subject'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<DepartmentEntity> {
    const dept = await this.departmentsRepository.findOne({
      where: { id },
      relations: ['hod', 'teachers', 'subjectMappings', 'subjectMappings.subject'],
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async create(dto: CreateDepartmentDto): Promise<DepartmentEntity> {
    const name = (dto.name || '').trim();
    if (!name) {
      throw new BadRequestException('Department name is required');
    }

    const existing = await this.departmentsRepository.findOne({
      where: { name },
    });
    if (existing) {
      throw new BadRequestException(`Department "${name}" already exists`);
    }

    const dept = this.departmentsRepository.create({
      name,
      description: dto.description?.trim() || null,
    });
    return this.departmentsRepository.save(dept);
  }

  async update(
    id: string,
    dto: UpdateDepartmentDto,
  ): Promise<DepartmentEntity> {
    const dept = await this.departmentsRepository.findOne({ where: { id } });
    if (!dept) {
      throw new NotFoundException('Department not found');
    }

    if (dto.name) {
      const name = dto.name.trim();
      const existing = await this.departmentsRepository.findOne({
        where: { name },
      });
      if (existing && existing.id !== id) {
        throw new BadRequestException(
          `Another department with name "${name}" already exists`,
        );
      }
      dept.name = name;
    }

    if (dto.description !== undefined) {
      dept.description = dto.description?.trim() || null;
    }

    return this.departmentsRepository.save(dept);
  }

  async setHod(departmentId: string, teacherId: string | null): Promise<DepartmentEntity> {
    const dept = await this.departmentsRepository.findOne({
      where: { id: departmentId },
      relations: ['teachers', 'hod', 'subjectMappings', 'subjectMappings.subject'],
    });
    if (!dept) throw new NotFoundException('Department not found');

    if (teacherId == null) {
      dept.hod = null;
      dept.hodId = null;
      return this.departmentsRepository.save(dept);
    }

    const teacher = await this.teachersRepository.findOne({
      where: { id: teacherId },
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    if (teacher.departmentId !== departmentId) {
      throw new BadRequestException(
        'Teacher must be assigned to the department before they can be set as HOD',
      );
    }

    dept.hodId = teacher.id;
    dept.hod = teacher;
    return this.departmentsRepository.save(dept);
  }

  async assignTeacher(departmentId: string, teacherId: string): Promise<DepartmentEntity> {
    const dept = await this.departmentsRepository.findOne({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException('Department not found');

    const teacher = await this.teachersRepository.findOne({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException('Teacher not found');

    if (teacher.departmentId === departmentId) {
      return this.findOne(departmentId);
    }

    teacher.departmentId = departmentId;
    await this.teachersRepository.save(teacher);
    return this.findOne(departmentId);
  }

  async removeTeacher(departmentId: string, teacherId: string): Promise<DepartmentEntity> {
    const dept = await this.departmentsRepository.findOne({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException('Department not found');

    const teacher = await this.teachersRepository.findOne({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException('Teacher not found');

    if (teacher.departmentId !== departmentId) {
      return this.findOne(departmentId);
    }

    // If removing the current HOD, clear hod first
    if (dept.hodId && dept.hodId === teacherId) {
      dept.hodId = null;
      dept.hod = null;
      await this.departmentsRepository.save(dept);
    }

    teacher.departmentId = null;
    await this.teachersRepository.save(teacher);
    return this.findOne(departmentId);
  }

  async addSubject(departmentId: string, subjectCode: string): Promise<DepartmentEntity> {
    const dept = await this.departmentsRepository.findOne({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException('Department not found');

    const code = (subjectCode || '').trim();
    if (!code) throw new BadRequestException('subjectCode is required');

    const subject = await this.subjectsRepository.findOne({ where: { code } });
    if (!subject) throw new NotFoundException('Subject not found');

    const existing = await this.departmentSubjectsRepository.findOne({
      where: { departmentId, subjectCode: code },
    });
    if (!existing) {
      const mapping = this.departmentSubjectsRepository.create({
        departmentId,
        subjectCode: code,
      });
      await this.departmentSubjectsRepository.save(mapping);
    }

    return this.findOne(departmentId);
  }

  async removeSubject(departmentId: string, subjectCode: string): Promise<DepartmentEntity> {
    const dept = await this.departmentsRepository.findOne({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException('Department not found');

    const code = (subjectCode || '').trim();
    if (!code) throw new BadRequestException('subjectCode is required');

    await this.departmentSubjectsRepository.delete({
      departmentId,
      subjectCode: code,
    });

    return this.findOne(departmentId);
  }

  async remove(id: string): Promise<void> {
    const result = await this.departmentsRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException('Department not found');
    }
  }
}


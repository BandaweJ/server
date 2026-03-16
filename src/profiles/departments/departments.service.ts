import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentEntity } from '../entities/department.entity';
import { CreateDepartmentDto } from '../dtos/create-department.dto';
import { UpdateDepartmentDto } from '../dtos/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(DepartmentEntity)
    private readonly departmentsRepository: Repository<DepartmentEntity>,
  ) {}

  async findAll(): Promise<DepartmentEntity[]> {
    return this.departmentsRepository.find({
      order: { name: 'ASC' },
    });
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

  async remove(id: string): Promise<void> {
    const result = await this.departmentsRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException('Department not found');
    }
  }
}


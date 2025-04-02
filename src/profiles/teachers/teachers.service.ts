/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTeacherDto } from '../dtos/createTeachers.dto';
import { TeachersEntity } from '../entities/teachers.entity';
import { UpdateTeacherDto } from '../dtos/updateTeacher.dto';
import { ResourceByIdService } from 'src/resource-by-id/resource-by-id.service';
import { UnauthorizedException } from '@nestjs/common';
import { ROLES } from '../../auth/models/roles.enum';

import { StudentsEntity } from '../entities/students.entity';
import { ParentsEntity } from '../entities/parents.entity';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(TeachersEntity)
    private teachersRespository: Repository<TeachersEntity>,
    private resourceById: ResourceByIdService,
  ) {}

  async getTeacher(
    id: string,
    profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ): Promise<TeachersEntity> {
    switch (profile.role) {
      case ROLES.student:
      case ROLES.parent:
        throw new UnauthorizedException(
          'Only staff members can access this resource',
        );
        break;
      case ROLES.admin:
      case ROLES.hod:
      case ROLES.teacher:
      case ROLES.reception:
        return await this.resourceById.getTeacherById(id);
    }
  }

  async getAllTeachers(
    profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ): Promise<TeachersEntity[]> {
    switch (profile.role) {
      case ROLES.student:
      case ROLES.parent:
        throw new UnauthorizedException(
          'Only staff members can access this resource',
        );
        break;
      case ROLES.admin:
      case ROLES.hod:
      case ROLES.teacher:
      case ROLES.reception:
        return await this.teachersRespository.find();
    }
  }

  async createTeacher(
    createTeacherDto: CreateTeacherDto,
    profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ): Promise<TeachersEntity> {
    if (profile.role !== ROLES.admin) {
      throw new UnauthorizedException('Only admins can create new teachers');
    }

    return await this.teachersRespository.save(createTeacherDto);
  }

  async deleteTeacher(
    id: string,
    profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ): Promise<{ id: string }> {
    if (profile.role !== ROLES.admin) {
      throw new UnauthorizedException(
        'Only admins are allowed to delete teachers',
      );
    }

    const result = await this.teachersRespository.delete(id);

    if (result.affected === 0)
      throw new NotImplementedException(`Teacher with I.D ${id} not deleted`);

    return { id };
  }

  async updateTeacher(
    id: string,
    updateTeacherDto: UpdateTeacherDto,
    profile: TeachersEntity,
  ): Promise<TeachersEntity> {
    // const teacher = await this.getTeacher(id, profile);
    const teacher = await this.teachersRespository.findOne({
      where: {
        id,
      },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    return await this.teachersRespository.save({
      ...teacher,
      ...updateTeacherDto,
    });

    // if (teacher.id === profile.id || profile.role === ROLES.admin) {

    // } else
    //   throw new BadRequestException(
    //     'Only admins or owner of account can make these changes',
    //   );
  }
}

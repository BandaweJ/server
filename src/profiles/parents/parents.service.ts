import {
  Injectable,
  NotImplementedException,
  UnauthorizedException,
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
    private resourceById: ResourceByIdService,
  ) {}

  async getParent(
    email: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentsEntity> {
    switch (profile.role) {
      case ROLES.admin:
      case ROLES.hod:
      case ROLES.reception:
      case ROLES.teacher: {
        return await this.resourceById.getParentByEmail(email);
        break;
      }
      case ROLES.student: {
        const parent = await this.resourceById.getParentByEmail(email);
        if (profile instanceof StudentsEntity) {
          if (profile.parent == parent) {
            return this.resourceById.getParentByEmail(email);
          } else {
            throw new UnauthorizedException('Can only access own parent');
          }
        }
        break;
      }
      case ROLES.parent: {
        if (profile instanceof ParentsEntity) {
          const parent = await this.resourceById.getParentByEmail(email);
          if (parent.email == profile.email) {
            return parent;
          } else {
            throw new UnauthorizedException(
              'Only allowed to access your own record',
            );
          }
        }
        break;
      }
    }
  }

  async getAllParents(
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentsEntity[]> {
    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student: {
        throw new UnauthorizedException(
          'Only members of staff can access parent list',
        );
        break;
      }
    }
    return await this.parentsRepository.find({
      order: { email: 'DESC' },
      take: 1,
    });
  }

  async createParent(
    createParentDto: CreateParentsDto,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentsEntity> {
    switch (profile.role) {
      case ROLES.teacher:
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.student:
      case ROLES.reception: {
        throw new UnauthorizedException('Only admins can add parents');
        break;
      }
    }
    return await this.parentsRepository.save(createParentDto);
  }

  async deleteParent(
    email: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<number> {
    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher: {
        throw new UnauthorizedException('Only admins can delete parents');
        break;
      }
    }
    const result = await this.parentsRepository.delete(email);

    if (!result.affected)
      throw new NotImplementedException(
        `Parent with email ${email} not deleted`,
      );

    return result.affected;
  }

  async updateParent(
    email: string,
    updateParentDto: UpdateParentDto,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentsEntity> {
    const parent = await this.getParent(email, profile);

    return await this.parentsRepository.save({
      ...parent,
      ...updateParentDto,
    });
  }
}

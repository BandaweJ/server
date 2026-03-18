import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { AuthGuard } from '@nestjs/passport';
import { DepartmentEntity } from '../entities/department.entity';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from '../entities/teachers.entity';
import { StudentsEntity } from '../entities/students.entity';
import { ParentsEntity } from '../entities/parents.entity';
import { ROLES } from 'src/auth/models/roles.enum';
import { CreateDepartmentDto } from '../dtos/create-department.dto';
import { UpdateDepartmentDto } from '../dtos/update-department.dto';

type Profile = TeachersEntity | StudentsEntity | ParentsEntity;

function canManageDepartments(profile: Profile): boolean {
  return (
    profile.role === ROLES.dev ||
    profile.role === ROLES.admin ||
    profile.role === ROLES.director
  );
}

@Controller('departments')
@UseGuards(AuthGuard())
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  async getAllDepartments(): Promise<DepartmentEntity[]> {
    return this.departmentsService.findAll();
  }

  @Get(':id')
  async getDepartment(@Param('id') id: string): Promise<DepartmentEntity> {
    return this.departmentsService.findOne(id);
  }

  @Post()
  async createDepartment(
    @Body() dto: CreateDepartmentDto,
    @GetUser() profile: Profile,
  ): Promise<DepartmentEntity> {
    if (!canManageDepartments(profile)) {
      throw new ForbiddenException(
        'Only dev, admin, or director can manage departments',
      );
    }
    return this.departmentsService.create(dto);
  }

  @Patch(':id')
  async updateDepartment(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @GetUser() profile: Profile,
  ): Promise<DepartmentEntity> {
    if (!canManageDepartments(profile)) {
      throw new ForbiddenException(
        'Only dev, admin, or director can manage departments',
      );
    }
    return this.departmentsService.update(id, dto);
  }

  @Delete(':id')
  async deleteDepartment(
    @Param('id') id: string,
    @GetUser() profile: Profile,
  ): Promise<{ success: true }> {
    if (!canManageDepartments(profile)) {
      throw new ForbiddenException(
        'Only dev, admin, or director can manage departments',
      );
    }
    await this.departmentsService.remove(id);
    return { success: true };
  }

  @Patch(':id/hod')
  async setHod(
    @Param('id') id: string,
    @Body() body: { teacherId?: string | null },
    @GetUser() profile: Profile,
  ): Promise<DepartmentEntity> {
    if (!canManageDepartments(profile)) {
      throw new ForbiddenException(
        'Only dev, admin, or director can manage departments',
      );
    }
    const teacherId =
      body.teacherId === undefined ? null : (body.teacherId as string | null);
    return this.departmentsService.setHod(id, teacherId);
  }

  @Post(':id/teachers')
  async assignTeacher(
    @Param('id') id: string,
    @Body() body: { teacherId: string },
    @GetUser() profile: Profile,
  ): Promise<DepartmentEntity> {
    if (!canManageDepartments(profile)) {
      throw new ForbiddenException(
        'Only dev, admin, or director can manage departments',
      );
    }
    return this.departmentsService.assignTeacher(id, body.teacherId);
  }

  @Delete(':id/teachers/:teacherId')
  async removeTeacher(
    @Param('id') id: string,
    @Param('teacherId') teacherId: string,
    @GetUser() profile: Profile,
  ): Promise<DepartmentEntity> {
    if (!canManageDepartments(profile)) {
      throw new ForbiddenException(
        'Only dev, admin, or director can manage departments',
      );
    }
    return this.departmentsService.removeTeacher(id, teacherId);
  }

  @Post(':id/subjects')
  async addSubject(
    @Param('id') id: string,
    @Body() body: { subjectCode: string },
    @GetUser() profile: Profile,
  ): Promise<DepartmentEntity> {
    if (!canManageDepartments(profile)) {
      throw new ForbiddenException(
        'Only dev, admin, or director can manage departments',
      );
    }
    return this.departmentsService.addSubject(id, body.subjectCode);
  }

  @Delete(':id/subjects/:subjectCode')
  async removeSubject(
    @Param('id') id: string,
    @Param('subjectCode') subjectCode: string,
    @GetUser() profile: Profile,
  ): Promise<DepartmentEntity> {
    if (!canManageDepartments(profile)) {
      throw new ForbiddenException(
        'Only dev, admin, or director can manage departments',
      );
    }
    return this.departmentsService.removeSubject(id, subjectCode);
  }
}


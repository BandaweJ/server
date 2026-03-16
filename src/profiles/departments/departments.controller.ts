import { Controller, Get, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { AuthGuard } from '@nestjs/passport';
import { DepartmentEntity } from '../entities/department.entity';

@Controller('departments')
@UseGuards(AuthGuard())
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  async getAllDepartments(): Promise<DepartmentEntity[]> {
    return this.departmentsService.findAll();
  }
}


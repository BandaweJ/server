import { TeachersController } from './teachers/teachers.controller';
import { TeachersService } from './teachers/teachers.service';
import { StudentsController } from './students/students.controller';
import { ParentsController } from './parents/parents.controller';
import { StudentsService } from './students/students.service';
import { ParentsService } from './parents/parents.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeachersEntity } from './entities/teachers.entity';
import { StudentsEntity } from './entities/students.entity';
import { ParentsEntity } from './entities/parents.entity';
import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { ResourceByIdModule } from '../resource-by-id/resource-by-id.module';
import { DepartmentEntity } from './entities/department.entity';
import { DepartmentsService } from './departments/departments.service';
import { DepartmentsController } from './departments/departments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TeachersEntity,
      StudentsEntity,
      ParentsEntity,
      DepartmentEntity,
    ]),
    AuthModule,
    ResourceByIdModule,
  ],
  controllers: [
    TeachersController,
    StudentsController,
    ParentsController,
    DepartmentsController,
  ],
  providers: [TeachersService, StudentsService, ParentsService, DepartmentsService],
  exports: [TeachersService, StudentsService, ParentsService, DepartmentsService],
})
export class ProfilesModule {}

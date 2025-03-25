/* eslint-disable prettier/prettier */
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

@Module({
  imports: [
    TypeOrmModule.forFeature([TeachersEntity, StudentsEntity, ParentsEntity]),
    AuthModule,
    ResourceByIdModule,
  ],
  controllers: [TeachersController, StudentsController, ParentsController],
  providers: [TeachersService, StudentsService, ParentsService],
  exports: [TeachersService, StudentsService, ParentsService],
})
export class ProfilesModule {}

import { Module } from '@nestjs/common';
import { ResourceByIdService } from './resource-by-id.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TeachersEntity, StudentsEntity, ParentsEntity]),
  ],
  providers: [ResourceByIdService],
  exports: [ResourceByIdService],
})
export class ResourceByIdModule {}

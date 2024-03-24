import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { Repository } from 'typeorm';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { TeachersEntity } from '../profiles/entities/teachers.entity';

@Injectable()
export class ResourceByIdService {
  constructor(
    @InjectRepository(ParentsEntity)
    private parentsRepository: Repository<ParentsEntity>,
    @InjectRepository(StudentsEntity)
    private studentsRepository: Repository<StudentsEntity>,
    @InjectRepository(TeachersEntity)
    private teachersRepository: Repository<TeachersEntity>,
  ) {}

  async getParentByEmail(email: string): Promise<ParentsEntity> {
    const found = await this.parentsRepository.findOne({
      where: { email },
    });

    if (!found) {
      throw new NotFoundException(`Parent with email '${email}' not found`);
    }

    return found;
  }

  async getStudentByStudentNumber(
    studentNumber: string,
  ): Promise<StudentsEntity> {
    const found = await this.studentsRepository.findOne({
      where: { studentNumber },
    });

    if (!found)
      throw new NotFoundException(
        `Student with StudentNumber ${studentNumber} not found`,
      );

    return found;
  }

  async getTeacherById(id: string): Promise<TeachersEntity> {
    const found = await this.teachersRepository.findOne({ where: { id } });

    if (!found) {
      throw new NotFoundException(`Teachers with I.D ${id} not found`);
    }

    return found;
  }
}

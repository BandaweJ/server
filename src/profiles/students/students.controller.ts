/* eslint-disable prettier/prettier */
import { StudentsService } from './students.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { UpdateStudentDto } from '../dtos/updateStudent.dto';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from '../entities/teachers.entity';
import { StudentsEntity } from '../entities/students.entity';
import { ParentsEntity } from '../entities/parents.entity';

@Controller('students')
@UseGuards(AuthGuard())
export class StudentsController {
  constructor(private studentsService: StudentsService) {}

  @Post()
  createStudent(
    @Body() createStudentDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.studentsService.createStudent(createStudentDto, profile);
  }

  @Get()
  getAllStudents(
    @GetUser() profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ) {
    return this.studentsService.getAllStudents(profile);
  }

  @Get(':studentNumber')
  getStudent(
    @Param('studentNumber') studentNumber: string,
    profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ) {
    return this.studentsService.getStudent(studentNumber, profile);
  }

  @Patch(':studentNumber')
  updateStudent(
    @Param('studentNumber') studentNumber: string,
    @Body() updateStudentDto: UpdateStudentDto,
    @GetUser() profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ) {
    return this.studentsService.updateStudent(
      studentNumber,
      updateStudentDto,
      profile,
    );
  }

  @Delete(':studentNumber')
  deleteStudent(@Param('studentNumber') studentnumber: string) {
    // console.log('here' + studentnumber);
    return this.studentsService.deleteStudent(studentnumber);
  }
}

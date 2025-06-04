/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from '../dtos/createTeachers.dto';
import { UpdateTeacherDto } from '../dtos/updateTeacher.dto';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from '../entities/teachers.entity';
import { ParentsEntity } from '../entities/parents.entity';
import { StudentsEntity } from '../entities/students.entity';

@Controller('teachers')
@UseGuards(AuthGuard())
export class TeachersController {
  constructor(private teachersService: TeachersService) {}

  @Get(':id')
  getTeacher(
    @Param('id') id: string,
    @GetUser() profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ) {
    return this.teachersService.getTeacher(id, profile);
  }

  @Get()
  getAllTeachers(
    @GetUser() profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ) {
    return this.teachersService.getAllTeachers(profile);
  }

  @Post()
  createTeacher(
    @Body() createTeacherDto: CreateTeacherDto,
    @GetUser() profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ) {
    return this.teachersService.createTeacher(createTeacherDto, profile);
  }

  @Delete(':id')
  deleteTeacher(
    @Param('id') id: string,
    @GetUser() profile: TeachersEntity | ParentsEntity | StudentsEntity,
  ) {
    return this.teachersService.deleteTeacher(id, profile);
  }

  @Patch(':id')
  updateTeacher(
    @Param('id') id: string,
    @Body() updateTeacherDto: UpdateTeacherDto,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.teachersService.updateTeacher(id, updateTeacherDto, profile);
  }
}

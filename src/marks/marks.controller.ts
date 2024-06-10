import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CreateSubjectDto } from './dtos/create-subject.dto';
import { MarksService } from './marks.service';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { CreateMarkDto } from './dtos/create-mark.dto';
import { UpdateMarkDto } from './dtos/update-mark.dto';
import { MarksEntity } from './entities/marks.entity';
import { AuthGuard } from '@nestjs/passport';
import { CommentDto } from './dtos/comment.dto';

@Controller('marks')
@UseGuards(AuthGuard())
export class MarksController {
  constructor(private marksService: MarksService) {}

  @Post('/subjects')
  createSubject(
    @Body() createSubjectDto: CreateSubjectDto,

    @GetUser() profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ) {
    // console.log(profile);
    return this.marksService.createSubject(createSubjectDto, profile);
  }

  @Get('/subjects')
  getAllSubjects() {
    return this.marksService.getAllSubjects();
  }

  @Get('/subjects/:code')
  getOneSubject(@Param('code') code: string) {
    return this.marksService.getOneSubject(code);
  }

  @Delete('subjects/:code')
  deleteSubject(
    @Param('code') code: string,
    @GetUser() profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ) {
    return this.marksService.deleteSubject(code, profile);
  }

  @Patch('/subjects')
  editSubject(@Body() subject: CreateSubjectDto) {
    return this.marksService.editSubject(subject);
  }

  @Post('/marks')
  createMark(
    @Body() createMarkDto: CreateMarkDto,
    @GetUser() profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ) {
    // console.log(createMarkDto);
    return this.marksService.createMark(createMarkDto, profile);
  }

  @Get('/marks')
  getAllMarks(
    @GetUser() profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ) {
    return this.marksService.getAllMarks(profile);
  }

  @Get('/marks/:num/:year/:name')
  getMarksByClass(
    @Param('num') num: number,
    @Param('year') year: number,
    @Param('name') name: string,
    @Param('examtype') examtype: string,
    @GetUser() profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ) {
    return this.marksService.getMarksbyClass(
      num,
      year,
      name,
      examtype,
      profile,
    );
  }

  @Get('/marks/:num/:year/:name/:subjectCode')
  getSubjectMarksInClass(
    @Param('num') num: number,
    @Param('year') year: number,
    @Param('name') name: string,
    @Param('subjectCode') subjectCode: string,
    @GetUser() profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ) {
    // console.log(num, name, year, subjectCode);
    return this.marksService.getSubjectMarksInClass(
      num,
      year,
      name,
      subjectCode,
      profile,
    );
  }

  /**
   * !TOFIX
   * Passing object to @Patch and @Delete
   *
   *
   */

  // @Patch('/marks')
  // updateMark(
  //   updateMarkDto: UpdateMarkDto,
  //   @GetUser() profile: StudentsEntity | ParentsEntity | TeachersEntity,
  // ) {
  //   return this.marksService.updateMark(updateMarkDto, profile);
  // }

  @Delete('/marks/:id')
  deleteMark(
    @Param('id') id: number,
    @GetUser() profile: StudentsEntity | ParentsEntity | TeachersEntity,
  ) {
    return this.marksService.deleteMark(id, profile);
  }

  @Get('/perf/:num/:year/:name/:examtype')
  getPerfomanceData(
    @Param('num') num: number,
    @Param('year') year: number,
    @Param('name') name: string,
    @Param('examtype') examtype: string,
  ) {
    // console.log(num, name, year);
    return this.marksService.getPerfomanceData(num, year, name, examtype);
  }

  @Post('/comments')
  createComment(
    @Body() commentDto: CommentDto,
    @GetUser() profile: TeachersEntity,
  ) {
    // console.log(commentDto);
    return this.marksService.createComment(commentDto, profile);
  }

  @Get('/comments/:name/:num/:year/:examtype')
  fetchClassComments(
    @Param('name') name: string,
    @Param('num') num: number,
    @Param('year') year: number,
    @Param('examtype') examtype: string,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.marksService.fetchClassComments(
      name,
      num,
      year,
      examtype,
      profile,
    );
  }
}

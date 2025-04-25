/* eslint-disable prettier/prettier */
import { TeachersEntity } from './../profiles/entities/teachers.entity';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { CreateClassDto } from './dtos/create-class.dto';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { EnrolmentService } from './enrolment.service';
import { EnrolDto } from './dtos/enrol.dto';
import { MarkRegisterDto } from './dtos/mark-register.dto';
import { CreateTermDto } from './dtos/create-term.dto';
import { UpdateEnrolDto } from './dtos/update-enrol.dto';

@Controller('enrolment')
@UseGuards(AuthGuard())
export class EnrolmentController {
  constructor(private enrolmentService: EnrolmentService) {}

  //classes

  @Get('class')
  getAllClasses() {
    return this.enrolmentService.getAllClasses();
  }

  @Get('class/:name')
  getOneClass(@Param('name') name: string) {
    return this.enrolmentService.getOneClass(name);
  }

  @Post('class')
  createClass(
    @Body() createClassDto: CreateClassDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.enrolmentService.createClass(createClassDto, profile);
  }

  @Patch('class/:id')
  editClass(@Param('id') id: number, @Body() clas: CreateClassDto) {
    // console.log(clas);
    return this.enrolmentService.editClass(id, clas);
  }

  @Delete('class/:name')
  deleteClass(
    @Param('name') name: string,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    // console.log(name);
    return this.enrolmentService.deleteClass(name, profile);
  }

  @Post('terms')
  createTerm(
    @Body() createTermDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.enrolmentService.createTerm(createTermDto, profile);
  }

  @Get('terms')
  getAllTerms() {
    return this.enrolmentService.getAllTerms();
  }

  @Get('terms/:num/:year')
  getOneTerm(@Param('num') num: number, @Param('year') year: number) {
    console.log('num : ', num, 'year : ', year);
    return this.enrolmentService.getOneTerm(num, year);
  }

  @Post('terms')
  addTerm(@Body() term: CreateTermDto) {
    return this.enrolmentService.addTerm(term);
  }

  @Patch('terms')
  editTerm(@Body() term: CreateTermDto) {
    return this.enrolmentService.editTerm(term);
  }

  @Get('enrol/migrate/:fromName/:fronNum/:fromYear/:toName/:toNum/:toYear')
  migrateClassEnrolment(
    @Param('fromName') fromName: string,
    @Param('fromNum') fronNum: number,
    @Param('fromYear') fromYear: number,
    @Param('toName') toName: string,
    @Param('toNum') toNum: number,
    @Param('toYear') toYear: number,
  ) {
    return this.enrolmentService.migrateClass(
      fromName,
      fronNum,
      fromYear,
      toName,
      toNum,
      toYear,
    );
  }

  @Delete('terms/:num/:year')
  deleteTerm(
    @Param('num') num: number,
    @Param('year') year: number,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.enrolmentService.deleteTerm(num, year, profile);
  }

  @Post('enrol')
  enrolStudent(
    @Body() enrolsDto: EnrolDto[],
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.enrolmentService.enrolStudent(enrolsDto, profile);
  }

  @Patch('enrol')
  updateEnrolment(
    @Body() updateEnrolDto: UpdateEnrolDto,
    @GetUser() profile: TeachersEntity,
  ) {
    return this.enrolmentService.updateEnrolment(updateEnrolDto, profile);
  }

  @Get('enrol/newcomers')
  getNewComers() {
    return this.enrolmentService.getNewComers();
  }

  @Get('enrol/newcomers/:studentNumber')
  checkIsNewComer(@Param('studentNumber') studentNumber: string) {
    return this.enrolmentService.isNewcomer(studentNumber);
  }

  @Get('enrol/:studentNumber')
  getCurrentEnrolment(@Param('studentNumber') studentNumber: string) {
    return this.enrolmentService.getCurrentEnrollment(studentNumber);
  }

  @Get('enrol')
  getAllEnrolments(
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.enrolmentService.getAllEnrolments(profile);
  }

  // @Get('enrol/:studentNumber/:num/:year')
  // getOneEnrolment(
  //   @Param('studentNumber') studentNumber: string,
  //   @Param('num') num: number,
  //   @Param('year') year: number,
  // ) {
  //   return this.enrolmentService.getOneEnrolment(studentNumber, num, year);
  // }

  @Get('enrol/:name/:num/:year')
  getEnrolmentByClass(
    @Param('name') name: string,
    @Param('num') num: number,
    @Param('year') year: number,
  ) {
    // console.log(name, num, year);
    return this.enrolmentService.getEnrolmentByClass(name, num, year);
  }

  @Get('enrol/:num/:year')
  getTotalEnrolmentByTerm(
    @Param('num') num: number,
    @Param('year') year: number,
  ) {
    return this.enrolmentService.getTotalEnrolmentByTerm(num, year);
  }

  @Get('enrol/:num/:year')
  getEnrolmentByTerm(@Param('num') num: number, @Param('year') year: number) {
    return this.enrolmentService.getEnrolmentByTerm(num, year);
  }

  @Delete('enrol/:id')
  unenrolStudent(@Param('id') id: number) {
    return this.enrolmentService.unenrolStudent(id);
  }

  @Post('enrol/register')
  markRegister(@Body() enrol: MarkRegisterDto) {
    return this.enrolmentService.markRegister(enrol);
  }

  @Get('enrol/register/:name/:num/:year')
  getTodayRegisterByClass(
    @Param('name') name: string,
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.enrolmentService.getTodayRegisterByClass(name, num, year);
  }
}

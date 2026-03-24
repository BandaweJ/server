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
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { CreateClassDto } from './dtos/create-class.dto';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { EnrolmentService } from './enrolment.service';
import { EnrolDto } from './dtos/enrol.dto';
import { CreateTermDto } from './dtos/create-term.dto';
import { UpdateEnrolDto } from './dtos/update-enrol.dto';
import { Logger } from '@nestjs/common';
import { ParentStudentAccessGuard } from 'src/auth/guards/parent-student-access.guard';
import { StudentEnrolmentStatusDto } from './dtos/student-enrolment-status.dto';
import { TermType } from './models/term-type.enum';

@Controller('enrolment')
@UseGuards(AuthGuard(), ParentStudentAccessGuard)
export class EnrolmentController {
  private readonly logger = new Logger(EnrolmentController.name);

  constructor(private enrolmentService: EnrolmentService) {
    this.logger.log('EnrolmentController initialized');
  }

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
    this.logger.log('GET /enrolment/terms - Request received');
    try {
      const result = this.enrolmentService.getAllTerms();
      this.logger.log('GET /enrolment/terms - Service call successful');
      return result;
    } catch (error) {
      this.logger.error('GET /enrolment/terms - Error in controller:', error);
      throw error;
    }
  }

  @Get('terms/id/:id')
  getOneTermById(@Param('id', ParseIntPipe) id: number) {
    return this.enrolmentService.getOneTermById(id);
  }

  @Get('terms/:num/:year')
  getOneTerm(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    console.log('num : ', num, 'year : ', year);
    return this.enrolmentService.getOneTerm(num, year);
  }

  @Get('terms/current')
  getCurrentTerm(@Query('type') type?: TermType) {
    return this.enrolmentService.getCurrentTerm(type);
  }

  @Post('terms')
  addTerm(@Body() term: CreateTermDto) {
    return this.enrolmentService.addTerm(term);
  }

  @Patch('terms')
  editTerm(@Body() term: CreateTermDto) {
    return this.enrolmentService.editTerm(term);
  }

  @Patch('terms/id/:id')
  editTermById(@Param('id', ParseIntPipe) id: number, @Body() term: CreateTermDto) {
    return this.enrolmentService.editTerm({ ...term, id });
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

  @Delete('terms/id/:id')
  deleteTermById(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.enrolmentService.deleteTermById(id, profile);
  }

  @Delete('terms/:num/:year')
  deleteTerm(
    @Param('num', ParseIntPipe) num: number,
    @Param('year', ParseIntPipe) year: number,
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

  @Get('enrol/student/:studentNumber/status')
  getStudentEnrolmentStatus(
    @Param('studentNumber') studentNumber: string,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<StudentEnrolmentStatusDto> {
    return this.enrolmentService.getStudentEnrolmentStatus(
      studentNumber,
      profile,
    );
  }

  @Get('enrol')
  getAllEnrolments(
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.enrolmentService.getAllEnrolments(profile);
  }

  @Get('enrol/:name/:num/:year')
  getEnrolmentByClass(
    @Param('name') name: string,
    @Param('num') num: number,
    @Param('year') year: number,
    @Query('termId') termId?: string,
  ) {
    // console.log(name, num, year);
    return this.enrolmentService.getEnrolmentByClass(
      name,
      num,
      year,
      termId ? parseInt(termId, 10) : undefined,
    );
  }

  @Get('enrol/summary/:num/:year')
  getTotalEnrolmentByTerm(
    @Param('num') num: number,
    @Param('year') year: number,
    @Query('termId') termId?: string,
  ) {
    console.log('num : ', num, 'year : ', year);
    return this.enrolmentService.getTotalEnrolmentByTerm(
      num,
      year,
      termId ? parseInt(termId, 10) : undefined,
    );
  }

  @Get('enrol/:num/:year')
  getEnrolmentByTerm(
    @Param('num') num: number,
    @Param('year') year: number,
    @Query('termId') termId?: string,
  ) {
    return this.enrolmentService.getEnrolmentByTerm(
      num,
      year,
      termId ? parseInt(termId, 10) : undefined,
    );
  }

  @Delete('enrol/:id')
  unenrolStudent(@Param('id') id: number) {
    return this.enrolmentService.unenrolStudent(id);
  }

}

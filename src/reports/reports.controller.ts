import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { ReportModel } from './models/report.model';
import { Response } from 'express';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { HeadCommentDto } from './dtos/head-comment.dto';
import { ReportsModel } from './models/reports.model';

@Controller('reports')
@UseGuards(AuthGuard())
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('/generate/:name/:num/:year/:examType')
  generateReports(
    @Param('name') name: string,
    @Param('num') num: number,
    @Param('year') year: number,
    @Param('examType') examType: string,
    @GetUser() profile,
  ) {
    // console.log('name', name);
    return this.reportsService.generateReports(
      name,
      num,
      year,
      examType,
      profile,
    );
  }

  @Post('/save/:name/:num/:year')
  saveReports(
    @Param('name') name: string,

    @Param('num') num: number,
    @Param('year') year: number,
    @Body() reports: ReportModel[],
    @GetUser() profile,
  ) {
    return this.reportsService.saveReports(num, year, name, reports, profile);
  }

  @Post('/save/')
  saveHeadComment(
    @Body() comment: HeadCommentDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.reportsService.saveHeadComment(comment, profile);
  }

  @Get('/view/:name/:num/:year/:examType')
  viewReports(
    @Param('name') name: string,

    @Param('num') num: number,
    @Param('year') year: number,
    @Param('examType') examType: string,
    @GetUser() profile,
  ) {
    return this.reportsService.viewReports(name, num, year, examType, profile);
  }

  // @Get('view')
  // getOneReport(
  //   @Param('num') num: number,
  //   @Param('year') year: number,
  //   @Param('name') name: string,
  //   @Param('studentNumber') studentNumber: string,
  //   @GetUser() profile,
  // ) {
  //   return this.reportsService.getOneReport(
  //     num,
  //     year,
  //     name,
  //     studentNumber,
  //     profile,
  //   );
  // }

  @Get('/pdf/:name/:num/:year/:examType/:studentNumber/')
  async getOnePDF(
    @Param('name') name: string,
    @Param('num') num: number,
    @Param('year') year: number,
    @Param('examType') examType: string,
    @Param('studentNumber') studentNumber: string,

    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.reportsService.downloadReport(
      name,
      num,
      year,
      examType,
      studentNumber,
      profile,
    );

    const filename = `${studentNumber}_${name}_${num}_${year}_report.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  // @Get('/pdf/:name/:num/:year')
  // async getAllPDFs(
  //   @Param('name') name: string,
  //   @Param('num') num: number,
  //   @Param('year') year: number,
  //   @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  //   @Res() res: Response,
  // ): Promise<void> {
  //   const studentNumber = '';

  //   const buffer = await this.reportsService.downloadReports(
  //     name,
  //     num,
  //     year,
  //     studentNumber,
  //     profile,
  //   );

  //   res.set({
  //     'Content-Type': 'application/pdf',
  //     'Content-Disposition': 'attachment; filename=example.pdf',
  //     'Content-Length': buffer.length,
  //   });

  //   res.end(buffer);
  // }
}

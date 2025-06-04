/* eslint-disable prettier/prettier */
import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { EnrolmentService } from '../enrolment/enrolment.service';
import { MarksService } from '../marks/marks.service';
import { ReportModel } from './models/report.model';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { SubjectInfoModel } from './models/subject-info.model';
import { SubjectSetItem } from './models/subject-set-item';
import { ROLES } from 'src/auth/models/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { ReportsEntity } from './entities/report.entity';
import { In, Repository } from 'typeorm';
import { TeacherCommentEntity } from 'src/marks/entities/teacher-comments.entity';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { ReportsModel } from './models/reports.model';
import { HeadCommentDto } from './dtos/head-comment.dto';
import * as path from 'path';
import { ExamType } from 'src/marks/models/examtype.enum';
// import bannerImagePath from '../assets/images/banner3.png';

@Injectable()
export class ReportsService {
  constructor(
    private marksService: MarksService,
    private enrolmentService: EnrolmentService,
    @InjectRepository(ReportsEntity)
    private reportsRepository: Repository<ReportsEntity>,
    @InjectRepository(TeacherCommentEntity)
    private teacherCommentRepository: Repository<TeacherCommentEntity>,
  ) {}

  async generateReports(
    name: string,
    num: number,
    year: number,
    examType: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ReportsModel[]> {
    const reports: ReportModel[] = [];

    // get class list
    const classList = await this.enrolmentService.getEnrolmentByClass(
      name,
      num,
      year,
    );

    //get all marks for the class for all subjects and current examtype
    const marks = await this.marksService.getMarksbyClass(
      num,
      year,
      name,
      examType,
      profile,
    );

    //create a set of subjects to avoid duplicates
    const subjectsSet = new Set<SubjectSetItem>();

    //populate subjectset with subjects done in class
    //used set so no duplicates
    marks.forEach((mark) => {
      //loop through all marks and add each subject to set
      subjectsSet.add(new SubjectSetItem(mark.subject.code));
    });

    // calculate subject average and assign to each subject
    subjectsSet.forEach((subject) => {
      const subjectmarks = marks.filter(
        //get marks for a particular subject onle
        (mark) => mark.subject.code === subject.code,
      );
      //clculate the average mark for the subject
      const subjectAverage =
        subjectmarks.reduce((sum, current) => sum + current.mark, 0) /
        subjectmarks.length;

      //calculate mark position
      subjectmarks.sort((a, b) => b.mark - a.mark);
      subjectmarks.forEach(
        (mark) =>
          //a mark of 100 is always at position 1
          (mark.position =
            mark.mark === 100
              ? '1' + '/' + subjectmarks.length
              : subjectmarks.indexOf(mark) + 1 + '/' + subjectmarks.length),
      );

      subject.average = subjectAverage;
    });

    // create empty report for each student in class
    // fill in details like : studentNumber, name, surname, className, termNumber, termYear, examType
    classList.map((enrol) => {
      const report = new ReportModel();
      report.subjectsTable = [];
      report.studentNumber = enrol.student.studentNumber;
      report.surname = enrol.student.surname;
      report.name = enrol.student.name;
      report.className = enrol.name;
      report.termNumber = enrol.num;
      report.termYear = enrol.year;
      report.examType = examType;

      //get student's marks
      const studentMarks = marks.filter(
        (mark) => mark.student.studentNumber === enrol.student.studentNumber,
      );

      // create a row for the Reports Table and push it to the report table
      //report table is a table if subjects and marks and comments in each report
      studentMarks.forEach((subjectMark) => {
        const subjectInfo = new SubjectInfoModel();

        subjectInfo.comment = subjectMark.comment;
        subjectInfo.mark = subjectMark.mark;
        subjectInfo.position = subjectMark.position;
        subjectInfo.subjectCode = subjectMark.subject.code;
        subjectInfo.subjectName = subjectMark.subject.name;
        subjectInfo.grade = this.computeGrade(
          subjectMark.mark,
          report.className,
        );
        subjectInfo.averageMark = Array.from(subjectsSet).find(
          (subject) => subject.code === subjectInfo.subjectCode,
        ).average;

        report.subjectsTable.push(subjectInfo);
      });

      reports.push(report);
    });

    //assign the classSize which equals reports.length and calculate avarage mark for each report/student
    reports.map((report) => {
      report.classSize = reports.length;
      report.percentageAverge =
        report.subjectsTable.reduce((sum, current) => sum + current.mark, 0) /
        report.subjectsTable.length;
    });

    //sort reports based on avarage mark to assign positions
    reports.sort((a, b) => b.percentageAverge - a.percentageAverge);

    //add 1 to each report position to offset array start position
    reports.forEach(
      (report) => (report.classPosition = reports.indexOf(report) + 1),
    );

    //get Teachers' comments for the class, term and examType
    const comments = await this.teacherCommentRepository.find({
      where: {
        name,
        num,
        year,
        examType,
      },
      relations: ['student', 'teacher'],
    });

    //assign class Teacher's comments to each report
    reports.map((report) => {
      comments.map((comment) => {
        if (comment.student.studentNumber === report.studentNumber) {
          report.classTrComment = comment.comment;
        }
      });
    });

    //calculate subjects passed
    reports.map((report) => {
      report.subjectsPassed = 0;
      report.subjectsTable.map((subj) => {
        if (subj.mark >= 50) {
          report.subjectsPassed += 1;
        }
      });
    });

    //create an array of reportsModel objects to encapsulate each report with much accessed data
    //so that it becomes easy to access that data without accessing the actual report
    // const reps: ReportsModel[] = [];

    // reports.map((report) => {
    //   const rep: ReportsModel = new ReportsModel();

    //   rep.name = name;
    //   rep.num = num;
    //   rep.report = report;
    //   rep.studentNumber = report.studentNumber;
    //   rep.year = year;
    //   rep.examType = examType;

    //   reps.push(rep);
    // });

    // // check if reports already saved and assign id and head's comment
    // const savedReports = await this.viewReports(
    //   name,
    //   num,
    //   year,
    //   examType,
    //   profile,
    // );

    // // return savedReports;
    // savedReports.map((rep) => {
    //   reps.map((rp) => {
    //     if (rep.studentNumber === rp.studentNumber) {
    //       if (rep.report.headComment) {
    //         rp.report.headComment = rep.report.headComment;
    //         rp.id = rep.id;
    //       }
    //     }
    //   });
    // });

    const reps: ReportsModel[] = [];

    reports.map((report) => {
      const rep: ReportsModel = new ReportsModel();

      rep.name = name;
      rep.num = num;
      rep.report = report;
      rep.studentNumber = report.studentNumber;
      rep.year = year;
      rep.examType = examType;

      reps.push(rep);
    });

    // check if reports already saved and assign id and head's comment
    const savedReports = await this.viewReports(
      name,
      num,
      year,
      examType,
      profile,
    );

    savedReports.forEach((savedRepEntity) => {
      reps.forEach((generatedRep) => {
        if (savedRepEntity.studentNumber === generatedRep.studentNumber) {
          // Access the headComment from the inner 'report' property
          if (savedRepEntity.report?.headComment) {
            generatedRep.report.headComment = savedRepEntity.report.headComment;
            generatedRep.id = savedRepEntity.id;
          }
          // else if (savedRepEntity?.report?.report.headComment) {
          //   generatedRep.report.headComment =
          //     savedRepEntity.report.report.headComment;
          //   generatedRep.id = savedRepEntity.id;
          // }
        }
      });
    });

    //assign point for A level students
    reps.map((rep) => {
      if (rep.name.charAt(0) === '5' || rep.name.charAt(0) === '6') {
        let pnts = 0;
        rep.report.subjectsTable.forEach((subj) => {
          pnts += this.computePoints(subj.mark);
        });
        rep.report.points = pnts;
      }
    });

    //sort the reports table so that the list of subjects on the report is the same for the fronent
    reps.map((rep) => {
      rep.report.subjectsTable.sort((a, b) => +b.subjectCode - +a.subjectCode);
    });

    //calculate the number of A*,A,B,C,D s for the MarksSheet
    reps.map((rep) => {
      rep.report.symbols = Array(5).fill(0);
      rep.report.subjectsTable.forEach((subj) => {
        if (subj.grade === 'A*') {
          rep.report.symbols[0]++;
        } else if (subj.grade === 'A') {
          rep.report.symbols[1]++;
        } else if (subj.grade === 'B') {
          rep.report.symbols[2]++;
        } else if (subj.grade === 'C') {
          rep.report.symbols[3]++;
        } else if (subj.grade === 'D') {
          rep.report.symbols[4]++;
        }
      });
    });

    // if (profile.role === ROLES.student && profile instanceof StudentsEntity) {
    //   const repo = reps.filter(
    //     (r) => r.studentNumber === profile.studentNumber,
    //   );
    //   return repo;
    // }

    return reps;
  }

  private computeGrade(mark: number, clas: string): string {
    const form = clas.charAt(0);

    switch (form) {
      case '5':
      case '6': {
        if (mark >= 90) return 'A*';
        else if (mark >= 75) return 'A';
        else if (mark >= 65) return 'B';
        else if (mark >= 50) return 'C';
        else if (mark >= 40) return 'D';
        else if (mark >= 35) return 'E';
        else return 'F';
      }
      case '1':
      case '2':
      case '3':
      case '4': {
        if (mark >= 90) return 'A*';
        else if (mark >= 70) return 'A';
        else if (mark >= 60) return 'B';
        else if (mark >= 50) return 'C';
        else if (mark >= 40) return 'D';
        else if (mark >= 35) return 'E';
        else return 'U';
      }
    }
  }

  private computePoints(mark: number): number {
    if (mark >= 75) return 5;
    else if (mark >= 65) return 4;
    else if (mark >= 50) return 3;
    else if (mark >= 40) return 2;
    else if (mark >= 35) return 1;
    else if (mark < 34) return 0;
  }

  // async saveReports(
  //   num: number,
  //   year: number,
  //   name: string,
  //   reports: ReportModel[],
  //   examType: ExamType,
  //   profile: TeachersEntity | StudentsEntity | ParentsEntity,
  // ) {
  //   switch (profile.role) {
  //     case ROLES.hod:
  //     case ROLES.parent:
  //     case ROLES.reception:
  //     case ROLES.student:
  //       // case ROLES.teacher:
  //       throw new UnauthorizedException(
  //         'Only Admins are allowed to save reports',
  //       );
  //   }

  //   const reportsArray: ReportsEntity[] = [];
  //   reports.map(async (report) => {
  //     const studentNumber = report.studentNumber;
  //     const found = await this.reportsRepository.findOne({
  //       where: {
  //         name,
  //         num,
  //         year,
  //         examType,
  //         studentNumber,
  //       },
  //     });

  //     if (found) {
  //       found.report = report;

  //       reportsArray.push({
  //         ...found,
  //       });
  //     } else {
  //       const newReport = await this.reportsRepository.create();
  //       newReport.examType = examType;
  //       newReport.name = name;
  //       newReport.num = num;
  //       newReport.studentNumber = report.studentNumber;
  //       newReport.year = year;
  //       newReport.report = report;

  //       reportsArray.push(newReport);
  //     }
  //   });

  //   return await this.reportsRepository.save(reportsArray);
  // }

  // async saveReports(
  //   num: number,
  //   year: number,
  //   name: string,
  //   reports: ReportsModel[],
  //   examType: ExamType,
  //   profile: TeachersEntity | StudentsEntity | ParentsEntity,
  // ): Promise<ReportsModel[]> {
  //   switch (profile.role) {
  //     case ROLES.hod:
  //     case ROLES.parent:
  //     case ROLES.reception:
  //     case ROLES.student:
  //       throw new UnauthorizedException(
  //         'Only Admins are allowed to save reports',
  //       );
  //   }

  //   const promises = reports.map(async (report) => {
  //     const studentNumber = report.studentNumber;
  //     const found = await this.reportsRepository.findOne({
  //       where: {
  //         name,
  //         num,
  //         year,
  //         examType,
  //         studentNumber,
  //       },
  //     });

  //     if (found) {
  //       found.report = report;
  //       return { ...found };
  //     } else {
  //       const newReport = this.reportsRepository.create({
  //         examType,
  //         name,
  //         num,
  //         studentNumber: report.studentNumber,
  //         year,
  //         report,
  //       });
  //       return newReport;
  //     }
  //   });

  //   const reportsArray = await Promise.all(promises);
  //   return await this.reportsRepository.save(reportsArray);
  // }

  async saveReports(
    num: number,
    year: number,
    name: string, // e.g., Class Name like 'Form 1 Green'
    reports: ReportsModel[], // Array of report data objects
    examType: ExamType,
    profile: TeachersEntity | StudentsEntity | ParentsEntity, // The user performing the action
  ): Promise<ReportsEntity[]> {
    // Return the saved/updated TypeORM entities

    // 1. Authorization Check (More Direct)
    // Define allowed roles explicitly or check against disallowed roles
    // const allowedRoles: ROLES[] = [ROLES.admin]; // Add other roles like Principal if needed
    // if (!allowedRoles.includes(profile.role)) {
    //   throw new UnauthorizedException(
    //     `User role '${profile.role}' is not authorized to save reports. Allowed roles: ${allowedRoles.join(', ')}.`
    //   );
    // }

    // Handle empty input
    if (!reports || reports.length === 0) {
      return []; // Nothing to process
    }

    // 2. Batch Fetch Existing Reports
    const studentNumbers = reports.map((report) => report.studentNumber);

    let existingReports: ReportsEntity[] = [];
    try {
      // Find all reports matching the criteria and the student numbers in the input batch
      existingReports = await this.reportsRepository.find({
        where: {
          name,
          num,
          year,
          examType,
          studentNumber: In(studentNumbers), // Use TypeORM's 'In' operator
        },
      });
    } catch (dbError) {
      console.error('Database error fetching existing reports:', dbError);
      throw new InternalServerErrorException(
        'Could not retrieve existing reports data.',
      );
    }

    // Create a Map for efficient lookup: Map<studentNumber, existingReportEntity>
    const existingReportsMap = new Map<string, ReportsEntity>(
      existingReports.map((report) => [report.studentNumber, report]),
    );

    // 3. Prepare Data for Save (Update existing or Create new)
    const reportsToSave: ReportsEntity[] = [];

    for (const inputReport of reports) {
      const existingReport = existingReportsMap.get(inputReport.studentNumber);

      if (existingReport) {
        // --- UPDATE ---
        // Modify the existing entity fetched from the database
        existingReport.report = inputReport.report; // Update the report data field
        // You might want to update other fields, e.g., an 'updatedBy' timestamp or user ID
        // existingReport.updatedBy = profile.id;

        reportsToSave.push(existingReport); // Add the modified entity to the list
      } else {
        // --- CREATE ---
        // Create a new entity instance using the repository's create method
        const newReport = this.reportsRepository.create({
          name,
          num,
          year,
          examType,
          studentNumber: inputReport.studentNumber,
          report: inputReport.report, // Assign the full report data from input
          // You might want to set 'createdBy' field here
          // createdBy: profile.id,
        });
        reportsToSave.push(newReport); // Add the new entity to the list
      }
    }

    // 4. Save Prepared Data in Bulk
    try {
      // TypeORM's save method intelligently handles inserts and updates for the provided array
      const savedReports = await this.reportsRepository.save(reportsToSave);
      // console.log(`Successfully saved/updated ${savedReports.length} reports.`);
      return savedReports; // Return the array of saved/updated entities
    } catch (dbError) {
      console.error('Database error saving reports:', dbError);
      // Catch potential errors like unique constraint violations if not handled by the pre-fetch logic
      throw new InternalServerErrorException('Failed to save report data.');
    }
  }

  async getStudentReports(studentNumber: string): Promise<ReportsEntity[]> {
    const reports = await this.reportsRepository.find({
      where: {
        studentNumber,
      },
    });
    const normalizedReports = reports.map((rep) =>
      this.normalizeReportStructure(rep),
    );

    return normalizedReports;
  }

  async saveHeadComment(
    comment: HeadCommentDto,
    profile: StudentsEntity | TeachersEntity | ParentsEntity,
  ): Promise<ReportsEntity> {
    //assign the comment to the report
    comment.report.report.headComment = comment.comment;

    //save the report
    return await this.reportsRepository.save({
      ...comment.report,
    });
  }

  async viewReports(
    name: string,
    num: number,
    year: number,
    examType: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<any[]> {
    // switch (profile.role) {
    //   case ROLES.parent:
    //   case ROLES.student:
    //     throw new UnauthorizedException(
    //       'Students and Parents are not allowed to view all reports',
    //     );
    // }

    let reports;

    if (examType) {
      reports = await this.reportsRepository.find({
        where: {
          name,
          num,
          year,
          examType,
        },
      });
    } else
      reports = await this.reportsRepository.find({
        where: {
          name,
          num,
          year,
        },
      });

    const normalizedReports = reports.map((rep) =>
      this.normalizeReportStructure(rep),
    );

    return normalizedReports;
  }

  async downloadReport(
    name,
    num,
    year,
    examType,
    studentNumber,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    let reps: ReportsModel[] = [];

    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student: {
        reps = await this.getStudentReports(studentNumber);
        break;
      }
      case ROLES.admin:
      case ROLES.hod:
      case ROLES.reception:
      case ROLES.teacher: {
        reps = await this.generateReports(name, num, year, examType, profile);
      }
    }

    const reportToDownload = reps.find(
      (rep) => rep.studentNumber === studentNumber,
    );

    return await this.generatePDF(reportToDownload);
  }

  async generatePDF(
    report: ReportsModel,
  ): Promise<{ buffer: Buffer; filename: string }> {
    // console.log(report);

    const filename = `${report.report.name} ${report.report.surname} Term ${report.report.termNumber} - ${report.report.className}`;

    const pdfBuffer: Buffer = await new Promise(async (resolve) => {
      //set margin, rowHeight, columnWidth

      const margin = 42.5197; //15mm margin
      // const yStartPosition = 202.598;
      // const yGap = 28.3465;
      const columnWidth = 28.3465; //28.3465; //10mm per column
      const rowHeight = 28.3465; //100mm per row
      const padding = 9; //2.46944 mm of padding
      const smallPadding = 5; // 1.76389 mm of padding
      let averageMarkRowNumber = 0;

      //Document Colors
      const blueColor = '#27aae1';
      const blackColor = '#000';
      const redColor = '#27aae1'; //'#ff0000'; //'#ff4a95';
      const redAccentColor = '#ff4a95';

      //default fontSize
      const defaultFontSize = 14;

      const title = `${report.report.name} ${report.report.surname} Term ${report.report.termNumber} - ${report.report.className}`;

      const doc = new PDFDocument({
        // font: '',
        size: 'A4',
        margin: margin,
        bufferPages: true,
        displayTitle: true,
        info: {
          Title: title,
        },
      });

      try {
        const imgPath = path.join(__dirname, '../../public/banner.jpeg');
        const imgBuffer = fs.readFileSync(imgPath);

        doc.image(imgBuffer, margin, padding, {
          width: columnWidth * 18,
          height: rowHeight * 3, // Adjust the height as needed - padding ,
          align: 'center',
        }); // Adjust position and size as needed
      } catch (err) {
        console.log('Failed to add image: ', err);
      }

      doc
        .strokeColor(blueColor)
        .lineWidth(2)

        .moveTo(margin, rowHeight * 4 - padding) //draw line after 4 rows, subtract 7pnt/2.5 mm for padding of text
        .lineTo(margin + columnWidth * 18, rowHeight * 4 - padding)
        // .fillColor('blue')
        .stroke();

      //insert heading
      const heading = `${report.examType} ${report.report.termNumber}, ${report.report.termYear} Report Card`;
      doc
        .fillColor(blackColor)
        .fontSize(defaultFontSize + 10)
        .font('Times-Bold')
        .text(heading, margin, rowHeight * 4, {
          width: columnWidth * 18,
          align: 'center',
          height: rowHeight * 1.5,
        });

      //draw a horizontal red line
      doc
        .strokeColor(redAccentColor)
        .moveTo(margin, rowHeight * 5)
        .lineTo(margin + columnWidth * 18, rowHeight * 5)
        .stroke();

      //student number, name and class
      //student number
      doc
        .fontSize(defaultFontSize)
        .font('Times-Roman')
        .text('Student I.D: ', margin, rowHeight * 5 + padding, {
          width: columnWidth * 6,
          align: 'left',
          continued: true,
        })
        .fillColor(blueColor)
        .text(`${report.studentNumber}`);

      //name
      doc
        .fillColor(blackColor)
        .text('Name: ', columnWidth * 7, rowHeight * 5 + padding, {
          width: columnWidth * 2,
          align: 'left',
          // continued: true,
        })
        .fillColor(blueColor)
        .text(
          `${report.report.name} ${report.report.surname}`,
          columnWidth * 9,
          rowHeight * 5 + padding,
          {
            width: columnWidth * 8,
            align: 'left',
          },
        );

      //class
      doc
        .fillColor(blackColor)
        .text('Class: ', columnWidth * 12, rowHeight * 5 + padding, {
          width: columnWidth * 6,
          continued: true,
          align: 'center',
        })
        .fillColor(blueColor)
        .text(`${report.report.className}`, {
          align: 'right',
        });

      //Position in class
      doc
        .moveDown()
        .fillColor(blackColor)
        .fontSize(defaultFontSize)
        .text(`Position in Class: `, margin, rowHeight * 6, {
          // align: 'center',
          width: columnWidth * 9,
          continued: true,
        })
        .fillColor(blueColor)
        .text(` ${report.report.classPosition} / ${report.report.classSize}`);

      //Subjects Passed
      doc
        .fillColor(blackColor)
        .text('Subjects Passed: ', margin + columnWidth * 9, rowHeight * 6, {
          width: columnWidth * 9,
        })
        .fillColor(blueColor)
        .text(
          `${report.report.subjectsPassed}`,
          margin + columnWidth * 13,
          rowHeight * 6,
        );

      //start table

      //table headers
      doc
        .strokeColor(blueColor)
        .lineWidth(0.5)
        .rect(margin, rowHeight * 7, columnWidth, rowHeight)
        .stroke()
        .fontSize(defaultFontSize - 1)
        .text('#', margin + padding, rowHeight * 7 + padding)
        .rect(margin + columnWidth, rowHeight * 7, columnWidth * 5, rowHeight)
        .stroke()
        .text(
          'Subject',
          margin + columnWidth + smallPadding,
          rowHeight * 7 + padding,
        )
        .rect(
          margin + columnWidth * 6,
          rowHeight * 7,
          columnWidth * 1.5,
          rowHeight,
        )
        .stroke()
        .text(
          'Mark',
          margin + columnWidth * 6 + smallPadding,
          rowHeight * 7 + padding,
        )
        .rect(
          margin + columnWidth * 7 + columnWidth * 0.5,
          rowHeight * 7,
          columnWidth * 1.5,
          rowHeight,
        )
        .stroke()
        .text(
          'Mean',
          margin + columnWidth * 7 + columnWidth * 0.5 + smallPadding,
          rowHeight * 7 + padding,
        )
        .rect(
          margin + columnWidth * 9,
          rowHeight * 7,
          columnWidth * 1.5,
          rowHeight,
        )
        .stroke()
        .text(
          'Rank',
          margin + columnWidth * 9 + smallPadding,
          rowHeight * 7 + padding,
        )
        .rect(
          margin + columnWidth * 10.5,
          rowHeight * 7,
          columnWidth * 1.5,
          rowHeight,
        )
        .stroke()
        .text(
          'Grade',
          margin + columnWidth * 10.5 + smallPadding,
          rowHeight * 7 + padding,
        )
        .rect(
          margin + columnWidth * 12,
          rowHeight * 7,
          columnWidth * 6,
          rowHeight,
        )
        .stroke()
        .text(
          'Comment',
          margin + columnWidth * 12 + smallPadding,
          rowHeight * 7 + padding,
        );

      //loop through all subjects and construct a row for each
      for (let i = 0; i < report.report.subjectsTable.length; i++) {
        //increament averageMarkRow
        averageMarkRowNumber += 1;

        //subject row
        doc
          .strokeColor(blueColor)
          .fillColor(blackColor)
          .lineWidth(0.5)
          .rect(margin, rowHeight * (7 + i + 1), columnWidth, rowHeight)
          .stroke()
          .fontSize(defaultFontSize - 3)
          .text(`${i + 1}`, margin + padding, rowHeight * (7 + i + 1) + padding)
          .rect(
            margin + columnWidth,
            rowHeight * (7 + i + 1),
            columnWidth * 5,
            rowHeight,
          )
          .stroke()
          .text(
            `${report.report.subjectsTable[i].subjectCode} ${report.report.subjectsTable[i].subjectName}`,
            margin + columnWidth + smallPadding,
            rowHeight * (7 + i + 1) + padding,
          )
          .rect(
            margin + columnWidth * 6,
            rowHeight * (7 + i + 1),
            columnWidth * 1.5,
            rowHeight,
          )
          .stroke()
          .fillColor(
            report.report.subjectsTable[i].mark >= 60 ? blueColor : redColor,
          )
          .text(
            `${report.report.subjectsTable[i].mark}`,
            margin + columnWidth * 6 + smallPadding,
            rowHeight * (7 + i + 1) + padding,
          )
          .fillColor(blackColor)
          .rect(
            margin + columnWidth * 7 + columnWidth * 0.5,
            rowHeight * (7 + i + 1),
            columnWidth * 1.5,
            rowHeight,
          )
          .stroke()
          .text(
            `${Math.round(report.report.subjectsTable[i].averageMark)}`,
            margin + columnWidth * 7 + columnWidth * 0.5 + smallPadding,
            rowHeight * (7 + i + 1) + padding,
          )
          .rect(
            margin + columnWidth * 9,
            rowHeight * (7 + i + 1),
            columnWidth * 1.5,
            rowHeight,
          )
          .stroke()
          .text(
            `${report.report.subjectsTable[i].position}`,
            margin + columnWidth * 9 + smallPadding,
            rowHeight * (7 + i + 1) + padding,
          )
          .rect(
            margin + columnWidth * 10.5,
            rowHeight * (7 + i + 1),
            columnWidth * 1.5,
            rowHeight,
          )
          .stroke()
          .text(
            `${report.report.subjectsTable[i].grade}`,
            // margin + columnWidth * 10.5 + smallPadding,
            margin + columnWidth * 10.5 + padding,

            rowHeight * (7 + i + 1) + padding,
          )
          .rect(
            margin + columnWidth * 12,
            rowHeight * (7 + i + 1),
            columnWidth * 6,
            rowHeight,
          )
          .stroke()
          .text(
            `${report.report.subjectsTable[i].comment}`,
            margin + columnWidth * 12 + smallPadding,
            rowHeight * (7 + i + 1) + smallPadding,
          );
      }

      //Average Mark row
      doc
        .strokeColor(blueColor)
        .fillColor(blackColor)
        .lineWidth(0.5)
        .rect(
          margin,
          rowHeight * (7 + averageMarkRowNumber + 1),
          columnWidth * 6,
          rowHeight,
        )
        .stroke()
        .fontSize(defaultFontSize - 3)
        .text(
          `Average Mark`,
          margin + padding,
          rowHeight * (7 + averageMarkRowNumber + 1) + padding,
        )

        .rect(
          margin + columnWidth * 6,
          rowHeight * (7 + averageMarkRowNumber + 1),
          columnWidth * 1.5,
          rowHeight,
        )
        .stroke()
        .fillColor(report.report.percentageAverge >= 60 ? blueColor : redColor)
        .text(
          `${Math.round(report.report.percentageAverge)}`,
          margin + columnWidth * 6 + smallPadding,
          rowHeight * (7 + averageMarkRowNumber + 1) + padding,
        )
        .fillColor(blackColor)
        .rect(
          margin + columnWidth * 7 + columnWidth * 0.5,
          rowHeight * (7 + averageMarkRowNumber + 1),
          columnWidth * 1.5,
          rowHeight,
        )
        .stroke()
        .text(
          ``,
          margin + columnWidth * 7 + columnWidth * 0.5 + smallPadding,
          rowHeight * (7 + averageMarkRowNumber + 1) + padding,
        )
        .rect(
          margin + columnWidth * 9,
          rowHeight * (7 + averageMarkRowNumber + 1),
          columnWidth * 1.5,
          rowHeight,
        )
        .stroke()
        .text(
          ``,
          margin + columnWidth * 9 + smallPadding,
          rowHeight * (7 + averageMarkRowNumber + 1) + padding,
        )
        .rect(
          margin + columnWidth * 10.5,
          rowHeight * (7 + averageMarkRowNumber + 1),
          columnWidth * 1.5,
          rowHeight,
        )
        .stroke()
        .text(
          ``,
          margin + columnWidth * 10.5 + smallPadding,
          rowHeight * (7 + averageMarkRowNumber + 1) + padding,
        )
        .rect(
          margin + columnWidth * 12,
          rowHeight * (7 + averageMarkRowNumber + 1),
          columnWidth * 6,
          rowHeight,
        )
        .stroke()
        .text(
          ``,
          margin + columnWidth * 12 + smallPadding,
          rowHeight * (7 + averageMarkRowNumber + 1) + padding,
        );

      //Teacher's Comment
      doc
        .fontSize(defaultFontSize - 2)
        .text('Form Teacher', margin, rowHeight * 24 + padding, {
          align: 'center',
          width: columnWidth * 8,
          height: rowHeight,
        })
        .rect(margin, rowHeight * 25, columnWidth * 8, rowHeight * 2)
        .stroke()
        .text(
          `${report.report.classTrComment}`,
          margin + smallPadding,
          rowHeight * 25 + padding,
          {
            width: columnWidth * 8,
            height: rowHeight * 2,
            align: 'left',
          },
        );

      //Head's Comment
      doc
        .fontSize(defaultFontSize - 2)
        .text(
          "Head's Comment",
          margin + columnWidth * 10,
          rowHeight * 24 + padding,
          {
            align: 'center',
            width: columnWidth * 8,
            height: rowHeight,
          },
        )
        .rect(
          margin + columnWidth * 10,
          rowHeight * 25,
          columnWidth * 8,
          rowHeight * 2,
        )
        .stroke()
        .text(
          report.report.headComment ? `${report.report.headComment}` : '',
          margin + columnWidth * 10 + smallPadding,
          rowHeight * 25 + padding,
          {
            width: columnWidth * 8,
            height: rowHeight * 2,
            align: 'left',
          },
        );
      doc
        .moveTo(0, 0)
        .strokeColor(blueColor)
        .lineWidth(10)
        .lineTo(doc.page.width, 0)
        .lineTo(doc.page.width, doc.page.height)
        .lineTo(0, doc.page.height)
        .lineTo(0, 0)
        .stroke();

      doc.end();

      const buffer = [];
      doc.on('data', buffer.push.bind(buffer));
      doc.on('end', () => {
        const data = Buffer.concat(buffer);
        // const filename = title;
        resolve(data);
      });
    });

    return { buffer: pdfBuffer, filename: `${filename}.pdf` };
  }

  private mmToPoints(mm: number): number {
    // 1 point = (1 inch / 72) * (25.4 mm / 1 inch)
    const pointsPerMm = 25.4 / 72;
    return mm * pointsPerMm;
  }

  private normalizeReportStructure(reportEntity: any): any {
    if (
      reportEntity &&
      reportEntity.report &&
      reportEntity.report.report //&&
      // reportEntity.report.report.report // Check for the deeper nesting
    ) {
      // If deeply nested, assign the content of the innermost 'report'
      reportEntity.report = reportEntity.report.report; //.report;
    }
    // If it's already in the single nested structure, 'reportEntity.report' remains as is.
    return reportEntity;
  }
}

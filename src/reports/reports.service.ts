import { Injectable, UnauthorizedException } from '@nestjs/common';
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
import { Repository } from 'typeorm';
import { TeacherCommentEntity } from 'src/marks/entities/teacher-comments.entity';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { height } from 'pdfkit/js/page';
import { ReportsModel } from './models/reports.model';
import { HeadCommentDto } from './dtos/head-comment.dto';
import * as path from 'path';
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
    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher:
        throw new UnauthorizedException('Only admins can generate new reports');
    }
    // create an array to store all reports
    const reports: ReportModel[] = [];

    // get class list
    const classList = await this.enrolmentService.getEnrolmentByClass(
      name,
      num,
      year,
    );

    //get all marks for the class for all subjects and examtype
    const marks = await this.marksService.getMarksbyClass(
      num,
      year,
      name,
      examType,
      profile,
    );

    //create a set of subjects
    const subjectsSet = new Set<SubjectSetItem>();

    //populate subjectset with subjects done in class
    //used set so no duplicates
    marks.forEach((mark) => {
      subjectsSet.add(new SubjectSetItem(mark.subject.code));
    });

    // calculate subject average and assign to each subject
    subjectsSet.forEach((subject) => {
      const subjectmarks = marks.filter(
        (mark) => mark.subject.code === subject.code,
      );
      const subjectAverage =
        subjectmarks.reduce((sum, current) => sum + current.mark, 0) /
        subjectmarks.length;

      //calculate mark position
      subjectmarks.sort((a, b) => b.mark - a.mark);
      subjectmarks.forEach(
        (mark) =>
          (mark.position =
            mark.mark === 100
              ? '1' + '/' + subjectmarks.length
              : subjectmarks.indexOf(mark) + 1 + '/' + subjectmarks.length),
      );

      subject.average = subjectAverage;
    });

    //get Teachers' comments
    const comments = await this.teacherCommentRepository.find({
      where: {
        name,
        num,
        year,
        // examtype,
      },
      relations: ['student', 'teacher'],
    });

    // create empty report for each student in class
    // fill in details like : studentNumber, name, surname, className, termNumber, termYear
    classList.map((enrol) => {
      const report = new ReportModel();
      report.subjectsTable = [];
      report.studentNumber = enrol.student.studentNumber;
      report.surname = enrol.student.surname;
      report.name = enrol.student.name;
      report.className = enrol.name;
      report.termNumber = enrol.num;
      report.termYear = enrol.year;

      //get student's marks
      const studentMarks = marks.filter(
        (mark) => mark.student.studentNumber === enrol.student.studentNumber,
      );

      // studentMarks.length &&
      studentMarks.forEach((subjectMark) => {
        const subjectInfo = new SubjectInfoModel();

        subjectInfo.comment = subjectMark.comment;
        subjectInfo.mark = subjectMark.mark;
        subjectInfo.position = subjectMark.position;
        subjectInfo.subjectCode = subjectMark.subject.code;
        subjectInfo.subjectName = subjectMark.subject.name;
        subjectInfo.grade = this.computeGrade(subjectMark.mark);
        subjectInfo.averageMark = Array.from(subjectsSet).find(
          (subject) => subject.code === subjectInfo.subjectCode,
        ).average;

        report.subjectsTable.push(subjectInfo);
      });

      reports.push(report);
    });

    reports.map((report) => {
      report.classSize = reports.length;
      report.percentageAverge =
        report.subjectsTable.reduce((sum, current) => sum + current.mark, 0) /
        report.subjectsTable.length;
    });

    reports.sort((a, b) => b.percentageAverge - a.percentageAverge);

    reports.forEach(
      (report) => (report.classPosition = reports.indexOf(report) + 1),
    );

    // console.log(comments);
    reports.map((report) => {
      comments.map((comment) => {
        if (comment.student.studentNumber === report.studentNumber) {
          report.classTrComment = comment.comment;
        }
      });
    });

    reports.map((report) => {
      report.subjectsPassed = 0;
      report.subjectsTable.map((subj) => {
        if (subj.mark >= 60) {
          report.subjectsPassed += 1;
        }
      });
    });

    const reps: ReportsModel[] = [];

    reports.map((report) => {
      const rep: ReportsModel = new ReportsModel();

      rep.name = name;
      rep.num = num;
      rep.report = report;
      rep.studentNumber = report.studentNumber;
      rep.year = year;

      reps.push(rep);
    });

    //check if reports already saved and assign id and head's comment
    const savedReports = await this.viewReports(name, num, year, profile);
    savedReports.map((rep) => {
      reps.map((rp) => {
        if (rep.studentNumber === rp.studentNumber) {
          rp.id = rep.id;
          rp.report.headComment = rep.report.headComment;
        }
      });
    });

    reps.map((rep) => {
      if (rep.name.charAt(0) === '5' || rep.name.charAt(0) === '6') {
        let pnts = 0;
        rep.report.subjectsTable.forEach((subj) => {
          pnts += this.computePoints(subj.mark);
        });
        rep.report.points = pnts;
      }
    });

    reps.map((rep) => {
      rep.report.subjectsTable.sort((a, b) => +b.subjectCode - +a.subjectCode);
    });

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

    return reps;
  }

  private computeGrade(mark: number): string {
    if (mark >= 90) return 'A*';
    else if (mark >= 80) return 'A';
    else if (mark >= 70) return 'B';
    else if (mark >= 60) return 'C';
    else if (mark >= 50) return 'D';
    else if (mark >= 40) return 'E';
    else if (mark >= 30) return 'F';
    else return 'G';
  }

  private computePoints(mark: number): number {
    if (mark >= 80) return 5;
    else if (mark >= 70) return 4;
    else if (mark >= 60) return 3;
    else if (mark >= 50) return 2;
    else if (mark >= 40) return 1;
    else if (mark < 40) return 0;
  }

  async saveReports(
    num: number,
    year: number,
    name: string,
    reports: ReportModel[],
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    switch (profile.role) {
      case ROLES.hod:
      case ROLES.parent:
      case ROLES.reception:
      case ROLES.student:
      case ROLES.teacher:
        throw new UnauthorizedException(
          'Only Admins are allowed to save reports',
        );
    }

    const reportsArray: ReportsEntity[] = [];
    reports.map((report) => {
      const rep: ReportsEntity = new ReportsEntity();

      rep.name = name;
      rep.num = num;
      rep.year = year;
      rep.studentNumber = report.studentNumber;
      rep.report = report;

      reportsArray.push(rep);
    });

    return await this.reportsRepository.save(reportsArray);
  }

  async saveHeadComment(
    comment: HeadCommentDto,
    profile: StudentsEntity | TeachersEntity | ParentsEntity,
  ): Promise<ReportsEntity> {
    comment.report.report.headComment = comment.comment;

    return await this.reportsRepository.save({
      ...comment.report,
    });
  }

  async viewReports(
    name: string,
    num: number,
    year: number,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ReportsEntity[]> {
    switch (profile.role) {
      case ROLES.parent:
      case ROLES.student:
        throw new UnauthorizedException(
          'Students and Parents are not allowed to view all reports',
        );
    }

    return await this.reportsRepository.find({
      where: {
        name,
        num,
        year,
      },
    });
  }

  async downloadReports(
    name: string,
    num: number,
    year: number,
    studentNumber: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    // switch (profile.role) {
    //   case ROLES.parent:
    //   case ROLES.student:
    //   case ROLES.teacher:
    //     throw new UnauthorizedException(
    //       'Only admins are allowed to download reports for now',
    //     );
    // }

    if (studentNumber) {
      const report = await this.reportsRepository.findOne({
        where: {
          name,
          num,
          year,
          studentNumber,
        },
      });

      return await this.generatePDF(report);
    } else {
      const reports = await this.reportsRepository.find({
        where: {
          name,
          num,
          year,
        },
      });

      reports.map(async (rep) => {
        return await this.generatePDF(rep);
      });
    }
  }

  async generatePDF(report: ReportsEntity): Promise<Buffer> {
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
      const redColor = '#ff4a95';

      //default fontSize
      const defaultFontSize = 14;

      const doc = new PDFDocument({
        // font: '',
        size: 'A4',
        margin: margin,
        bufferPages: true,
        displayTitle: true,
        info: {
          Title: `${report.report.name} ${report.report.surname} Term ${report.report.termNumber} - ${report.report.className}`,
        },
      });

      //insert banner

      // const base64Image = './banner3.jpg';
      ///opt/render/project/src/src/reports/reports.service.ts:385:13
      // const imagePath = '../../../../public/banner3.jpg'; // Assuming the public folder is at the root

      // Add an image, constrain it to a given size, and center it vertically and horizontally

      // Add an image

      try {
        const imgPath = path.join(__dirname, '../../public/banner3.jpg');
        const imgBuffer = fs.readFileSync(imgPath);

        doc.image(imgBuffer, 50, 50, {
          width: 100,
          height: 100,
          align: 'center',
        }); // Adjust position and size as needed

        // doc.image(imagePath, {
        //   fit: [250, 300],
        //   align: 'center',
        //   valign: 'center',
        // });
      } catch (err) {
        console.log('Failed to add image: ', err);
      }
      // const imageBuffer = Buffer.from(base64Image, 'base64');
      // doc.image(base64Image, 0, 0, { fit: [250, 300] });

      //draw a horizontal blue line
      doc
        .strokeColor(blueColor)
        .lineWidth(2)

        .moveTo(margin, rowHeight * 4 - padding) //draw line after 4 rows, subtract 7pnt/2.5 mm for padding of text
        .lineTo(margin + columnWidth * 18, rowHeight * 4 - padding)
        // .fillColor('blue')
        .stroke();

      //insert heading
      const heading = `End of Term ${report.report.termNumber}, ${report.report.termYear} Report Card`;
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
        .strokeColor(redColor)
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
        .strokeColor(blackColor)
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
          .strokeColor(blackColor)
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
        .strokeColor(blackColor)
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

      // doc.rect(42.5197, 160.079, 510.236, 42.5197).stroke();

      //close the document
      doc.end();

      const buffer = [];
      doc.on('data', buffer.push.bind(buffer));
      doc.on('end', () => {
        const data = Buffer.concat(buffer);
        resolve(data);
      });
    });

    return pdfBuffer;
  }

  private mmToPoints(mm: number): number {
    // 1 point = (1 inch / 72) * (25.4 mm / 1 inch)
    const pointsPerMm = 25.4 / 72;
    return mm * pointsPerMm;
  }
}

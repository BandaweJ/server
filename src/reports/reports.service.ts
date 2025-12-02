/* eslint-disable prettier/prettier */
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { EnrolmentService } from '../enrolment/enrolment.service';
import { MarksService } from '../marks/marks.service';
import { ReportModel } from './models/report.model';
import { GradingSystemService } from '../system/services/grading-system.service';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { SubjectInfoModel } from './models/subject-info.model';
import { SubjectSetItem } from './models/subject-set-item';
import { InjectRepository } from '@nestjs/typeorm';
import { ReportsEntity } from './entities/report.entity';
import { In, Repository } from 'typeorm';
import { TeacherCommentEntity } from 'src/marks/entities/teacher-comments.entity';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { ReportsModel } from './models/reports.model';
import { HeadCommentDto } from './dtos/head-comment.dto';
import { TeacherCommentDto } from './dtos/teacher-comment.dto';
import * as path from 'path';
import { ExamType } from 'src/marks/models/examtype.enum';
import { NotificationService } from '../notifications/services/notification.service';
import { ResourceByIdService } from '../resource-by-id/resource-by-id.service';
// import bannerImagePath from '../assets/images/banner3.png';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private marksService: MarksService,
    private enrolmentService: EnrolmentService,
    private gradingSystemService: GradingSystemService,
    @InjectRepository(ReportsEntity)
    private reportsRepository: Repository<ReportsEntity>,
    @InjectRepository(TeacherCommentEntity)
    private teacherCommentRepository: Repository<TeacherCommentEntity>,
    private notificationService: NotificationService,
    private resourceById: ResourceByIdService,
  ) {}

  async generateReports(
    name: string,
    num: number,
    year: number,
    examType: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ReportsModel[]> {
    // 1) Fetch enrolment for the class
    const classList = await this.enrolmentService.getEnrolmentByClass(
      name,
      num,
      year,
    );

    if (!classList || classList.length === 0) {
      return [];
    }

    // 2) Fetch marks for the class
    const marks = await this.marksService.getMarksbyClass(
      num,
      year,
      name,
      examType,
      profile,
    );

    if (!marks || marks.length === 0) {
      return [];
    }

    // 3) Build subject statistics (average + rankings)
    const subjectsMap = this.buildSubjectStatisticsAndRankings(marks);

    // 4) Build per‑student reports
    const reports = await this.buildReportsForClass(
      classList,
      marks,
      subjectsMap,
      examType,
    );

    // 5) Compute class‑level stats and positions
    this.computeClassSizeAndAverages(reports);
    this.assignClassPositions(reports);

    // 6) Attach teacher comments
    const comments = await this.teacherCommentRepository.find({
      where: {
        name,
        num,
        year,
        examType,
      },
      relations: ['student', 'teacher'],
    });
    this.applyTeacherComments(reports, comments);

    // 7) Calculate subjects passed
    this.computeSubjectsPassed(reports);

    // 8) Wrap in ReportsModel[]
    const reps: ReportsModel[] = this.wrapReports(
      reports,
      name,
      num,
      year,
      examType,
    );

    // 9) Merge in existing saved report metadata (headComment, id)
    const savedReports = await this.viewReports(
      name,
      num,
      year,
      examType,
      profile,
    );
    this.mergeSavedReportsMetadata(reps, savedReports);

    // 10) A‑Level points
    this.computeALevelPoints(reps);

    // 11) Normalise subject ordering
    this.sortSubjectsForFrontend(reps);

    // 12) Calculate symbols and filter students without marks (existing behaviour)
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

    const filteredReps = this.filterStudentsWithMarks(reps);
    return filteredReps;
  }

  /**
   * Build subject statistics (average + ranking) per subject.
   * Preserves existing behaviour while avoiding Set<SubjectSetItem> pitfalls
   * and repeated filter work.
   */
  private buildSubjectStatisticsAndRankings(
    marks: any[],
  ): Map<string, SubjectSetItem> {
    const subjectsMap = new Map<string, SubjectSetItem>();

    // Ensure one SubjectSetItem per subject code
    marks.forEach((mark) => {
      const code = mark.subject.code;
      if (!subjectsMap.has(code)) {
        subjectsMap.set(code, new SubjectSetItem(code));
      }
    });

    // For each subject, compute average and ranking
    subjectsMap.forEach((subject) => {
      const subjectMarks = marks.filter(
        (mark) => mark.subject.code === subject.code,
      );

      if (!subjectMarks.length) {
        subject.average = 0;
        return;
      }

      const subjectAverage =
        subjectMarks.reduce((sum, current) => sum + current.mark, 0) /
        subjectMarks.length;

      // Existing corrected ranking logic, preserved
      subjectMarks.sort((a, b) => b.mark - a.mark);

      let currentRank = 1;
      let lastMark = -1;

      subjectMarks.forEach((mark, index) => {
        if (mark.mark < lastMark) {
          currentRank = index + 1;
        }

        mark.position = currentRank + '/' + subjectMarks.length;
        lastMark = mark.mark;
      });

      subject.average = subjectAverage;
    });

    return subjectsMap;
  }

  /**
   * Build per‑student reports for a class.
   */
  private async buildReportsForClass(
    classList: any[],
    marks: any[],
    subjectsMap: Map<string, SubjectSetItem>,
    examType: string,
  ): Promise<ReportModel[]> {
    const reports: ReportModel[] = [];

    for (const enrol of classList) {
      const report = new ReportModel();
      report.subjectsTable = [];
      report.studentNumber = enrol.student.studentNumber;
      report.surname = enrol.student.surname;
      report.name = enrol.student.name;
      report.className = enrol.name;
      report.termNumber = enrol.num;
      report.termYear = enrol.year;
      report.examType = examType;

      const studentMarks = marks.filter(
        (mark) => mark.student.studentNumber === enrol.student.studentNumber,
      );

      for (const subjectMark of studentMarks) {
        const subjectInfo = new SubjectInfoModel();

        subjectInfo.comment = subjectMark.comment;
        subjectInfo.mark = subjectMark.mark;
        subjectInfo.position = subjectMark.position;
        subjectInfo.subjectCode = subjectMark.subject.code;
        subjectInfo.subjectName = subjectMark.subject.name;
        subjectInfo.grade = await this.computeGrade(
          subjectMark.mark,
          report.className,
        );

        const subjectStats = subjectsMap.get(subjectInfo.subjectCode);
        subjectInfo.averageMark = subjectStats?.average ?? 0;

        report.subjectsTable.push(subjectInfo);
      }

      reports.push(report);
    }

    return reports;
  }

  /**
   * Assign class size and percentage averages, guarding against empty tables.
   */
  private computeClassSizeAndAverages(reports: ReportModel[]): void {
    const classSize = reports.length;

    reports.forEach((report) => {
      report.classSize = classSize;

      if (!report.subjectsTable || report.subjectsTable.length === 0) {
        report.percentageAverge = 0;
        return;
      }

      const total = report.subjectsTable.reduce(
        (sum, current) => sum + current.mark,
        0,
      );
      report.percentageAverge = total / report.subjectsTable.length;
    });
  }

  /**
   * Assign class positions based on percentage average.
   * This keeps the same semantics but avoids O(n^2) indexOf usage.
   */
  private assignClassPositions(reports: ReportModel[]): void {
    reports.sort((a, b) => b.percentageAverge - a.percentageAverge);
    reports.forEach((report, index) => {
      report.classPosition = index + 1;
    });
  }

  /**
   * Attach teacher comments using a map keyed by student number.
   * NOTE: this now acts as a LEGACY FALLBACK only.
   * For new reports, the primary source of the teacher/class comment
   * is the ReportsEntity.report.classTrComment field.
   */
  private applyTeacherComments(
    reports: ReportModel[],
    comments: TeacherCommentEntity[],
  ): void {
    if (!comments || comments.length === 0) {
      return;
    }

    const commentByStudent = new Map<string, string>();
    comments.forEach((c) => {
      if (c.student?.studentNumber) {
        commentByStudent.set(c.student.studentNumber, c.comment);
      }
    });

    reports.forEach((report) => {
      // If the report already has a class teacher comment from the saved report JSON,
      // do NOT override it with legacy data.
      if (report.classTrComment) {
        return;
      }
      const legacyComment = commentByStudent.get(report.studentNumber);
      if (legacyComment) {
        report.classTrComment = legacyComment;
      }
    });
  }

  /**
   * Calculates the number of subjects passed per student.
   */
  private computeSubjectsPassed(reports: ReportModel[]): void {
    reports.forEach((report) => {
      report.subjectsPassed = 0;
      report.subjectsTable.forEach((subj) => {
        if (subj.mark >= 50) {
          report.subjectsPassed += 1;
        }
      });
    });
  }

  /**
   * Wrap ReportModel objects into ReportsModel transport objects.
   */
  private wrapReports(
    reports: ReportModel[],
    name: string,
    num: number,
    year: number,
    examType: string,
  ): ReportsModel[] {
    const reps: ReportsModel[] = [];

    reports.forEach((report) => {
      const rep: ReportsModel = new ReportsModel();

      rep.name = name;
      rep.num = num;
      rep.report = report;
      rep.studentNumber = report.studentNumber;
      rep.year = year;
      rep.examType = examType;

      reps.push(rep);
    });

    return reps;
  }

  /**
   * Merge saved report metadata (headComment, id) into generated reports.
   */
  private mergeSavedReportsMetadata(
    generatedReports: ReportsModel[],
    savedReports: ReportsEntity[],
  ): void {
    if (!savedReports || savedReports.length === 0) {
      return;
    }

    const savedByStudent = new Map<string, ReportsEntity>();
    savedReports.forEach((saved) => {
      if (saved.studentNumber) {
        savedByStudent.set(saved.studentNumber, saved);
      }
    });

    generatedReports.forEach((generated) => {
      const saved = savedByStudent.get(generated.studentNumber);
      if (!saved?.report) {
        return;
      }

      // Head's comment (existing behaviour)
      if (saved.report.headComment) {
        generated.report.headComment = saved.report.headComment;
        generated.id = saved.id;
      }

      // NEW: class/form teacher comment primarily comes from the saved report JSON
      if (saved.report.classTrComment) {
        generated.report.classTrComment = saved.report.classTrComment;
      }
    });
  }

  /**
   * Assign A‑Level points for relevant classes (same rules as before).
   */
  private computeALevelPoints(reps: ReportsModel[]): void {
    reps.forEach((rep) => {
      if (rep.name.charAt(0) === '5' || rep.name.charAt(0) === '6') {
        let pnts = 0;
        rep.report.subjectsTable.forEach((subj) => {
          pnts += this.computePoints(subj.mark);
        });
        rep.report.points = pnts;
      }
    });
  }

  /**
   * Ensure subjects on each report are sorted consistently for the frontend.
   */
  private sortSubjectsForFrontend(reps: ReportsModel[]): void {
    reps.forEach((rep) => {
      rep.report.subjectsTable.sort((a, b) => +b.subjectCode - +a.subjectCode);
    });
  }

  // async generateReports(
  //   name: string,
  //   num: number,
  //   year: number,
  //   examType: string,
  //   profile: TeachersEntity | StudentsEntity | ParentsEntity,
  // ): Promise<ReportsModel[]> {
  //   const reports: ReportModel[] = [];

  //   // get class list
  //   const classList = await this.enrolmentService.getEnrolmentByClass(
  //     name,
  //     num,
  //     year,
  //   );

  //   //get all marks for the class for all subjects and current examtype
  //   const marks = await this.marksService.getMarksbyClass(
  //     num,
  //     year,
  //     name,
  //     examType,
  //     profile,
  //   );

  //   //create a set of subjects to avoid duplicates
  //   const subjectsSet = new Set<SubjectSetItem>();

  //   //populate subjectset with subjects done in class
  //   //used set so no duplicates
  //   marks.forEach((mark) => {
  //     //loop through all marks and add each subject to set
  //     subjectsSet.add(new SubjectSetItem(mark.subject.code));
  //   });

  //   // calculate subject average and assign to each subject
  //   subjectsSet.forEach((subject) => {
  //     const subjectmarks = marks.filter(
  //       //get marks for a particular subject onle
  //       (mark) => mark.subject.code === subject.code,
  //     );
  //     //clculate the average mark for the subject
  //     const subjectAverage =
  //       subjectmarks.reduce((sum, current) => sum + current.mark, 0) /
  //       subjectmarks.length;

  //     //calculate mark position
  //     subjectmarks.sort((a, b) => b.mark - a.mark);
  //     subjectmarks.forEach(
  //       (mark) =>
  //         //a mark of 100 is always at position 1
  //         (mark.position =
  //           mark.mark === 100
  //             ? '1' + '/' + subjectmarks.length
  //             : subjectmarks.indexOf(mark) + 1 + '/' + subjectmarks.length),
  //     );

  //     subject.average = subjectAverage;
  //   });

  //   // create empty report for each student in class
  //   // fill in details like : studentNumber, name, surname, className, termNumber, termYear, examType
  //   classList.map((enrol) => {
  //     const report = new ReportModel();
  //     report.subjectsTable = [];
  //     report.studentNumber = enrol.student.studentNumber;
  //     report.surname = enrol.student.surname;
  //     report.name = enrol.student.name;
  //     report.className = enrol.name;
  //     report.termNumber = enrol.num;
  //     report.termYear = enrol.year;
  //     report.examType = examType;

  //     //get student's marks
  //     const studentMarks = marks.filter(
  //       (mark) => mark.student.studentNumber === enrol.student.studentNumber,
  //     );

  //     // create a row for the Reports Table and push it to the report table
  //     //report table is a table if subjects and marks and comments in each report
  //     studentMarks.forEach((subjectMark) => {
  //       const subjectInfo = new SubjectInfoModel();

  //       subjectInfo.comment = subjectMark.comment;
  //       subjectInfo.mark = subjectMark.mark;
  //       subjectInfo.position = subjectMark.position;
  //       subjectInfo.subjectCode = subjectMark.subject.code;
  //       subjectInfo.subjectName = subjectMark.subject.name;
  //       subjectInfo.grade = this.computeGrade(
  //         subjectMark.mark,
  //         report.className,
  //       );
  //       subjectInfo.averageMark = Array.from(subjectsSet).find(
  //         (subject) => subject.code === subjectInfo.subjectCode,
  //       ).average;

  //       report.subjectsTable.push(subjectInfo);
  //     });

  //     reports.push(report);
  //   });

  //   //assign the classSize which equals reports.length and calculate avarage mark for each report/student
  //   reports.map((report) => {
  //     report.classSize = reports.length;
  //     report.percentageAverge =
  //       report.subjectsTable.reduce((sum, current) => sum + current.mark, 0) /
  //       report.subjectsTable.length;
  //   });

  //   //sort reports based on avarage mark to assign positions
  //   reports.sort((a, b) => b.percentageAverge - a.percentageAverge);

  //   //add 1 to each report position to offset array start position
  //   reports.forEach(
  //     (report) => (report.classPosition = reports.indexOf(report) + 1),
  //   );

  //   //get Teachers' comments for the class, term and examType
  //   const comments = await this.teacherCommentRepository.find({
  //     where: {
  //       name,
  //       num,
  //       year,
  //       examType,
  //     },
  //     relations: ['student', 'teacher'],
  //   });

  //   //assign class Teacher's comments to each report
  //   reports.map((report) => {
  //     comments.map((comment) => {
  //       if (comment.student.studentNumber === report.studentNumber) {
  //         report.classTrComment = comment.comment;
  //       }
  //     });
  //   });

  //   //calculate subjects passed
  //   reports.map((report) => {
  //     report.subjectsPassed = 0;
  //     report.subjectsTable.map((subj) => {
  //       if (subj.mark >= 50) {
  //         report.subjectsPassed += 1;
  //       }
  //     });
  //   });

  //   //create an array of reportsModel objects to encapsulate each report with much accessed data
  //   //so that it becomes easy to access that data without accessing the actual report
  //   // const reps: ReportsModel[] = [];

  //   // reports.map((report) => {
  //   //   const rep: ReportsModel = new ReportsModel();

  //   //   rep.name = name;
  //   //   rep.num = num;
  //   //   rep.report = report;
  //   //   rep.studentNumber = report.studentNumber;
  //   //   rep.year = year;
  //   //   rep.examType = examType;

  //   //   reps.push(rep);
  //   // });

  //   // // check if reports already saved and assign id and head's comment
  //   // const savedReports = await this.viewReports(
  //   //   name,
  //   //   num,
  //   //   year,
  //   //   examType,
  //   //   profile,
  //   // );

  //   // // return savedReports;
  //   // savedReports.map((rep) => {
  //   //   reps.map((rp) => {
  //   //     if (rep.studentNumber === rp.studentNumber) {
  //   //       if (rep.report.headComment) {
  //   //         rp.report.headComment = rep.report.headComment;
  //   //         rp.id = rep.id;
  //   //       }
  //   //     }
  //   //   });
  //   // });

  //   const reps: ReportsModel[] = [];

  //   reports.map((report) => {
  //     const rep: ReportsModel = new ReportsModel();

  //     rep.name = name;
  //     rep.num = num;
  //     rep.report = report;
  //     rep.studentNumber = report.studentNumber;
  //     rep.year = year;
  //     rep.examType = examType;

  //     reps.push(rep);
  //   });

  //   // check if reports already saved and assign id and head's comment
  //   const savedReports = await this.viewReports(
  //     name,
  //     num,
  //     year,
  //     examType,
  //     profile,
  //   );

  //   savedReports.forEach((savedRepEntity) => {
  //     reps.forEach((generatedRep) => {
  //       if (savedRepEntity.studentNumber === generatedRep.studentNumber) {
  //         // Access the headComment from the inner 'report' property
  //         if (savedRepEntity.report?.headComment) {
  //           generatedRep.report.headComment = savedRepEntity.report.headComment;
  //           generatedRep.id = savedRepEntity.id;
  //         }
  //         // else if (savedRepEntity?.report?.report.headComment) {
  //         //   generatedRep.report.headComment =
  //         //     savedRepEntity.report.report.headComment;
  //         //   generatedRep.id = savedRepEntity.id;
  //         // }
  //       }
  //     });
  //   });

  //   //assign point for A level students
  //   reps.map((rep) => {
  //     if (rep.name.charAt(0) === '5' || rep.name.charAt(0) === '6') {
  //       let pnts = 0;
  //       rep.report.subjectsTable.forEach((subj) => {
  //         pnts += this.computePoints(subj.mark);
  //       });
  //       rep.report.points = pnts;
  //     }
  //   });

  //   //sort the reports table so that the list of subjects on the report is the same for the fronent
  //   reps.map((rep) => {
  //     rep.report.subjectsTable.sort((a, b) => +b.subjectCode - +a.subjectCode);
  //   });

  //   //calculate the number of A*,A,B,C,D s for the MarksSheet
  //   reps.map((rep) => {
  //     rep.report.symbols = Array(5).fill(0);
  //     rep.report.subjectsTable.forEach((subj) => {
  //       if (subj.grade === 'A*') {
  //         rep.report.symbols[0]++;
  //       } else if (subj.grade === 'A') {
  //         rep.report.symbols[1]++;
  //       } else if (subj.grade === 'B') {
  //         rep.report.symbols[2]++;
  //       } else if (subj.grade === 'C') {
  //         rep.report.symbols[3]++;
  //       } else if (subj.grade === 'D') {
  //         rep.report.symbols[4]++;
  //       }
  //     });
  //   });

  //   return reps;
  // }

  private async computeGrade(mark: number, clas: string): Promise<string> {
    // Use the grading system service instead of hardcoded values
    return await this.gradingSystemService.computeGrade(mark, clas);
  }

  private computePoints(mark: number): number {
    if (mark >= 75) return 5;
    else if (mark >= 65) return 4;
    else if (mark >= 50) return 3;
    else if (mark >= 40) return 2;
    else if (mark >= 35) return 1;
    else if (mark < 34) return 0;
  }

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
      
      // 5. Send email notifications for newly created reports (not updates)
      const newReports = savedReports.filter(
        (saved) => !existingReportsMap.has(saved.studentNumber),
      );
      
      // Send notifications asynchronously (don't block the response)
      this.sendReportNotifications(newReports, name, num, year, examType).catch(
        (error) => {
          console.error('Error sending report notifications:', error);
          // Don't throw - notifications are non-critical
        },
      );
      
      return savedReports; // Return the array of saved/updated entities
    } catch (dbError) {
      console.error('Database error saving reports:', dbError);
      // Catch potential errors like unique constraint violations if not handled by the pre-fetch logic
      throw new InternalServerErrorException('Failed to save report data.');
    }
  }

  /**
   * Send email notifications for saved reports
   */
  private async sendReportNotifications(
    reports: ReportsEntity[],
    className: string,
    termNum: number,
    termYear: number,
    examType: string,
  ): Promise<void> {
    for (const report of reports) {
      try {
        // Fetch student with parent relation loaded
        const student = await this.resourceById.getStudentByStudentNumber(
          report.studentNumber,
        );
        
        if (!student) continue;

        // Get parent email - fetch student with parent relation if not loaded
        let parentEmail: string | undefined;
        if (student.parent && student.parent.email) {
          parentEmail = student.parent.email;
        } else {
          // Parent relation not loaded, fetch it
          try {
            const studentRepo = this.reportsRepository.manager.getRepository(StudentsEntity);
            const studentWithParent = await studentRepo.findOne({
              where: { studentNumber: student.studentNumber },
              relations: ['parent'],
            });
            if (studentWithParent?.parent?.email) {
              parentEmail = studentWithParent.parent.email;
            }
          } catch {
            // Could not fetch parent
          }
        }

        await this.notificationService.sendReportCardNotification({
          studentName: `${student.surname} ${student.name}`,
          studentNumber: student.studentNumber,
          className,
          termNumber: termNum,
          termYear,
          examType,
          parentEmail,
          studentEmail: student.email,
        });
      } catch (error) {
        console.error(
          `Failed to send notification for student ${report.studentNumber}:`,
          error,
        );
        // Continue with other students
      }
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
    this.logger.debug('saveHeadComment called', {
      hasComment: !!comment.comment,
      hasReport: !!comment.report,
      reportId: comment.report?.id,
      reportKeys: comment.report ? Object.keys(comment.report) : [],
    });

    // Validate that report data exists
    if (!comment.report) {
      this.logger.error('Report data is missing from request', { comment });
      throw new BadRequestException('Report data is missing from request');
    }

    if (!comment.report.report) {
      this.logger.error('Report JSON data is missing from request', {
        report: comment.report,
        reportKeys: Object.keys(comment.report || {}),
      });
      throw new BadRequestException('Report JSON data is missing from request');
    }

    // Validate required fields for report identification
    const { name, num, year, studentNumber, examType } = comment.report;
    if (!name || !num || !year || !studentNumber) {
      throw new BadRequestException(
        'Missing required fields: name, num, year, and studentNumber are required to identify the report.'
      );
    }

    let existingReport: ReportsEntity | null = null;

    // Try to find existing report: first by ID if provided, then by unique combination
    if (comment.report.id) {
      existingReport = await this.reportsRepository.findOne({
        where: { id: comment.report.id },
      });
    }

    // If not found by ID (or no ID provided), try to find by unique combination
    if (!existingReport) {
      const whereClause: any = {
        name,
        num,
        year,
        studentNumber,
      };
      if (examType) {
        whereClause.examType = examType;
      }

      existingReport = await this.reportsRepository.findOne({
        where: whereClause,
      });
    }

    if (existingReport) {
      // --- UPDATE EXISTING REPORT ---
      this.logger.debug('Updating existing report with head comment', {
        reportId: existingReport.id,
        studentNumber: existingReport.studentNumber,
      });

      // Merge the incoming report data with existing report, updating only the head comment
      existingReport.report = {
        ...existingReport.report,
        ...comment.report.report, // Merge any other updates from frontend
        headComment: comment.comment, // Update the head comment
      };

      return await this.reportsRepository.save(existingReport);
    } else {
      // --- CREATE NEW REPORT ---
      this.logger.debug('Creating new report with head comment', {
        studentNumber,
        name,
        num,
        year,
        examType,
      });

      // Create new report with the comment
      const newReport = this.reportsRepository.create({
        name,
        num,
        year,
        studentNumber,
        examType: examType || null,
        report: {
          ...comment.report.report, // Use the full report data from frontend
          headComment: comment.comment, // Set the head comment
        },
      });

      return await this.reportsRepository.save(newReport);
    }
  }

  /**
   * Save the class / form teacher's comment directly on the report JSON.
   * This is the new, preferred way of storing teacher comments.
   * 
   * If the report exists (by ID or by unique combination), it will be updated.
   * If the report doesn't exist, a new report will be created with the comment.
   */
  async saveTeacherComment(
    comment: TeacherCommentDto,
    profile: StudentsEntity | TeachersEntity | ParentsEntity,
  ): Promise<ReportsEntity> {
    this.logger.debug('saveTeacherComment called', {
      hasComment: !!comment.comment,
      hasReport: !!comment.report,
      hasReportReport: !!(comment.report?.report),
      reportId: comment.report?.id,
    });

    // Validate that report and report.report exist
    if (!comment.report) {
      this.logger.error('Report data is missing from request', { comment });
      throw new BadRequestException('Report data is missing from request');
    }

    if (!comment.report.report) {
      this.logger.error('Report JSON data is missing from request', {
        report: comment.report,
        reportKeys: Object.keys(comment.report || {}),
      });
      throw new BadRequestException('Report JSON data is missing from request');
    }

    // Validate required fields for report identification
    const { name, num, year, studentNumber, examType } = comment.report;
    if (!name || !num || !year || !studentNumber) {
      throw new BadRequestException(
        'Missing required fields: name, num, year, and studentNumber are required to identify the report.'
      );
    }

    let existingReport: ReportsEntity | null = null;

    // Try to find existing report: first by ID if provided, then by unique combination
    if (comment.report.id) {
      existingReport = await this.reportsRepository.findOne({
        where: { id: comment.report.id },
      });
    }

    // If not found by ID (or no ID provided), try to find by unique combination
    if (!existingReport) {
      const whereClause: any = {
        name,
        num,
        year,
        studentNumber,
      };
      if (examType) {
        whereClause.examType = examType;
      }

      existingReport = await this.reportsRepository.findOne({
        where: whereClause,
      });
    }

    if (existingReport) {
      // --- UPDATE EXISTING REPORT ---
      this.logger.debug('Updating existing report with teacher comment', {
        reportId: existingReport.id,
        studentNumber: existingReport.studentNumber,
      });

      // Merge the incoming report data with existing report, updating only the teacher comment
      existingReport.report = {
        ...existingReport.report,
        ...comment.report.report, // Merge any other updates from frontend
        classTrComment: comment.comment, // Update the teacher comment
      };

      return await this.reportsRepository.save(existingReport);
    } else {
      // --- CREATE NEW REPORT ---
      this.logger.debug('Creating new report with teacher comment', {
        studentNumber,
        name,
        num,
        year,
        examType,
      });

      // Create new report with the comment
      const newReport = this.reportsRepository.create({
        name,
        num,
        year,
        studentNumber,
        examType: examType || null,
        report: {
          ...comment.report.report, // Use the full report data from frontend
          classTrComment: comment.comment, // Set the teacher comment
        },
      });

      return await this.reportsRepository.save(newReport);
    }
  }

  /**
   * Search reports with optional filters
   * Supports filtering by studentNumber, name (class), num (term), year, and examType
   */
  async searchReports(
    filters: {
      studentNumber?: string;
      name?: string;
      num?: number;
      year?: number;
      examType?: string;
    },
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ReportsEntity[]> {
    const where: any = {};

    if (filters.studentNumber) {
      where.studentNumber = filters.studentNumber;
    }
    if (filters.name) {
      where.name = filters.name;
    }
    if (filters.num !== undefined) {
      where.num = filters.num;
    }
    if (filters.year !== undefined) {
      where.year = filters.year;
    }
    if (filters.examType) {
      where.examType = filters.examType;
    }

    const reports = await this.reportsRepository.find({
      where,
      order: { year: 'DESC', num: 'DESC', studentNumber: 'ASC' },
      take: 100, // Limit results to prevent performance issues
    });

    return reports.map((rep) => this.normalizeReportStructure(rep));
  }

  async viewReports(
    name: string,
    num: number,
    year: number,
    examType: string,
    profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<any[]> {
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
    // Validate that students can only download their own reports
    if (profile instanceof StudentsEntity) {
      if (profile.studentNumber !== studentNumber) {
        throw new BadRequestException(
          'Students can only download their own reports',
        );
      }
    }

    const report = await this.reportsRepository.findOne({
      where: {
        name,
        num,
        year,
        studentNumber,
        examType,
      },
    });
    if (!report)
      throw new NotFoundException(
        `Report for student ${studentNumber} not found for term ${num}, ${year} for examtype ${examType}`,
      );
    return await this.generatePDF(report);
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
    // Ensure id is preserved (it might be missing if report was just generated)
    return {
      ...reportEntity,
      id: reportEntity.id, // Explicitly preserve id
    };
  }

  /**
   * Filters out students who have no marks in any subject and recalculates positions
   * Includes students who failed (subjectsPassed === 0) as long as they have some marks
   * @param reports Array of ReportsModel to filter
   * @returns Filtered array of ReportsModel with recalculated positions
   */
  private filterStudentsWithMarks(reports: ReportsModel[]): ReportsModel[] {
    // First filter out students without marks
    const filteredReports = reports.filter(report => {
      const { report: studentReport } = report;
      
      // Check if student has any marks in subjects (including failing marks)
      const hasAnyMarks = studentReport.subjectsTable.some(subject => 
        subject && subject.mark > 0
      );
      
      // Include student if they have any marks (regardless of pass/fail status)
      return hasAnyMarks;
    });

    // Sort by percentage average (descending) to determine new positions
    const sortedReports = filteredReports.sort((a, b) => 
      b.report.percentageAverge - a.report.percentageAverge
    );

    // Recalculate positions and class size
    const newClassSize = sortedReports.length;
    
    return sortedReports.map((report, index) => ({
      ...report,
      report: {
        ...report.report,
        classPosition: index + 1,  // New position (1-based)
        classSize: newClassSize,   // Updated class size
      }
    }));
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AttendanceEntity } from './entities/attendance.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { EnrolEntity } from '../enrolment/entities/enrol.entity';
import { MarkAttendanceDto } from './dtos/mark-attendance.dto';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { StudentsEntity as StudentsEntityType } from '../profiles/entities/students.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceEntity)
    private attendanceRepository: Repository<AttendanceEntity>,
    @InjectRepository(StudentsEntity)
    private studentsRepository: Repository<StudentsEntity>,
    @InjectRepository(EnrolEntity)
    private enrolmentRepository: Repository<EnrolEntity>,
  ) {}

  async getClassAttendance(
    className: string,
    termNum: number,
    year: number,
    date?: string,
  ) {
    try {
      const targetDate = date ? new Date(date) : new Date();
      targetDate.setHours(0, 0, 0, 0);

      // Get enrolled students for the class and term
      const enrolments = await this.enrolmentRepository.find({
        where: {
          name: className,
          num: termNum,
          year,
        },
        relations: ['student'],
      });

      if (enrolments.length === 0) {
        throw new NotFoundException('No students found for the specified class and term');
      }

      // Get existing attendance records for the date
      const existingAttendance = await this.attendanceRepository.find({
        where: {
          name: className,
          num: termNum,
          year,
          date: targetDate,
        },
        relations: ['student'],
      });

      // Create a map of existing attendance
      const attendanceMap = new Map();
      existingAttendance.forEach(attendance => {
        // Only add to map if student is loaded
        if (attendance.student?.studentNumber) {
          attendanceMap.set(attendance.student.studentNumber, attendance);
        }
      });

      // Build the result with all students and their attendance status
      // Filter out enrolments where student is not loaded
      const result = enrolments
        .filter(enrolment => enrolment.student != null)
        .map(enrolment => {
          const existingRecord = attendanceMap.get(enrolment.student.studentNumber);
          return {
            id: existingRecord?.id || null,
            studentNumber: enrolment.student.studentNumber,
            surname: enrolment.student.surname,
            name: enrolment.student.name,
            gender: enrolment.student.gender,
            present: existingRecord?.present || false,
            date: targetDate,
            className,
            termNum,
            year,
            student: enrolment.student,
          };
        });

      return result;
    } catch (error) {
      console.error('Error in getClassAttendance:', error);
      console.error('Error stack:', error?.stack);
      throw error;
    }
  }

  async markAttendance(
    markAttendanceDto: MarkAttendanceDto,
    profile: TeachersEntity | StudentsEntityType | ParentsEntity,
  ) {
    const { studentNumber, className, termNum, year, present, date } = markAttendanceDto;

    // Verify the student exists
    const student = await this.studentsRepository.findOne({
      where: { studentNumber },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Check if attendance record already exists for this date
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const existingRecord = await this.attendanceRepository.findOne({
      where: {
        student: { studentNumber },
        name: className,
        num: termNum,
        year,
        date: targetDate,
      },
      relations: ['student'], // Load student relation
    });

    if (existingRecord) {
      // Update existing record
      existingRecord.present = present;
      const saved = await this.attendanceRepository.save(existingRecord);
      // Reload with student relation to ensure it's included in response
      return await this.attendanceRepository.findOne({
        where: { id: saved.id },
        relations: ['student'],
      });
    } else {
      // Create new record
      const attendanceRecord = this.attendanceRepository.create({
        student,
        name: className,
        num: termNum,
        year,
        present,
        date: targetDate,
      });

      const saved = await this.attendanceRepository.save(attendanceRecord);
      // Reload with student relation to ensure it's included in response
      return await this.attendanceRepository.findOne({
        where: { id: saved.id },
        relations: ['student'],
      });
    }
  }

  async getAttendanceReports(
    className: string,
    termNum: number,
    year: number,
    startDate?: string,
    endDate?: string,
  ) {
    const queryBuilder = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.student', 'student')
      .where('attendance.name = :className', { className })
      .andWhere('attendance.num = :termNum', { termNum })
      .andWhere('attendance.year = :year', { year });

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('attendance.date BETWEEN :startDate AND :endDate', {
        startDate: start,
        endDate: end,
      });
    }

    const attendanceRecords = await queryBuilder
      .orderBy('attendance.date', 'DESC')
      .addOrderBy('student.surname', 'ASC')
      .getMany();

    // Transform records to match AttendanceRecord interface
    const transformedRecords = attendanceRecords
      .filter(record => record.student != null) // Filter out records without student
      .map(record => ({
        id: record.id,
        studentNumber: record.student.studentNumber,
        surname: record.student.surname,
        name: record.student.name, // Student's first name
        gender: record.student.gender,
        present: record.present,
        date: record.date.toISOString().split('T')[0],
        className: record.name, // Class name from attendance.name
        termNum: record.num,
        year: record.year,
        student: record.student, // Keep full student object for reference
      }));

    // Group by date
    const groupedByDate = transformedRecords.reduce((acc, record) => {
      const dateKey = record.date;
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(record);
      return acc;
    }, {});

    return groupedByDate;
  }

  async getStudentAttendance(
    studentNumber: string,
    termNum: number,
    year: number,
    startDate?: string,
    endDate?: string,
  ) {
    const queryBuilder = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.student', 'student')
      .where('student.studentNumber = :studentNumber', { studentNumber })
      .andWhere('attendance.num = :termNum', { termNum })
      .andWhere('attendance.year = :year', { year });

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('attendance.date BETWEEN :startDate AND :endDate', {
        startDate: start,
        endDate: end,
      });
    }

    const attendanceRecords = await queryBuilder
      .orderBy('attendance.date', 'DESC')
      .getMany();

    // Transform records to match AttendanceRecord interface
    return attendanceRecords
      .filter(record => record.student != null) // Filter out records without student
      .map(record => ({
        id: record.id,
        studentNumber: record.student.studentNumber,
        surname: record.student.surname,
        name: record.student.name, // Student's first name
        gender: record.student.gender,
        present: record.present,
        date: record.date.toISOString().split('T')[0],
        className: record.name, // Class name from attendance.name
        termNum: record.num,
        year: record.year,
        student: record.student, // Keep full student object for reference
      }));
  }

  async getAttendanceSummary(className: string, termNum: number, year: number) {
    const attendanceRecords = await this.attendanceRepository.find({
      where: {
        name: className,
        num: termNum,
        year,
      },
      relations: ['student'],
    });

    // Calculate summary statistics
    const totalRecords = attendanceRecords.length;
    const presentCount = attendanceRecords.filter(record => record.present).length;
    const absentCount = totalRecords - presentCount;
    const attendanceRate = totalRecords > 0 ? (presentCount / totalRecords) * 100 : 0;

    // Group by student
    const studentStats = attendanceRecords.reduce((acc, record) => {
      const studentNumber = record.student.studentNumber;
      if (!acc[studentNumber]) {
        acc[studentNumber] = {
          student: record.student,
          totalDays: 0,
          presentDays: 0,
          absentDays: 0,
        };
      }
      acc[studentNumber].totalDays++;
      if (record.present) {
        acc[studentNumber].presentDays++;
      } else {
        acc[studentNumber].absentDays++;
      }
      return acc;
    }, {});

    // Calculate individual attendance rates
    Object.values(studentStats).forEach((stats: any) => {
      stats.attendanceRate = stats.totalDays > 0 ? (stats.presentDays / stats.totalDays) * 100 : 0;
    });

    return {
      className,
      termNum,
      year,
      totalRecords,
      presentCount,
      absentCount,
      attendanceRate: Math.round(attendanceRate * 100) / 100,
      studentStats: Object.values(studentStats),
    };
  }
}

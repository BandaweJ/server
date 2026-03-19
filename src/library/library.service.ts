import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { TextbookTitleEntity } from './entities/textbook-title.entity';
import { TextbookCopyEntity } from './entities/textbook-copy.entity';
import { TextbookLoanEntity } from './entities/textbook-loan.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { ROLES } from 'src/auth/models/roles.enum';
import { RoomEntity } from 'src/inventory/entities/room.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { TextbookCopyStatus } from './models/textbook-copy-status.enum';
import { CreateTextbookTitleDto } from './dtos/create-textbook-title.dto';
import { ReceiveTextbookCopiesDto } from './dtos/receive-textbook-copies.dto';
import { IssueTextbookLoanDto } from './dtos/issue-textbook-loan.dto';
import { ReturnTextbookLoanDto } from './dtos/return-textbook-loan.dto';
import { AssignTextbookCopyDto } from './dtos/assign-textbook-copy.dto';

@Injectable()
export class LibraryService {
  constructor(
    @InjectRepository(TextbookTitleEntity)
    private readonly titlesRepo: Repository<TextbookTitleEntity>,
    @InjectRepository(TextbookCopyEntity)
    private readonly copiesRepo: Repository<TextbookCopyEntity>,
    @InjectRepository(TextbookLoanEntity)
    private readonly loansRepo: Repository<TextbookLoanEntity>,
    @InjectRepository(TeachersEntity)
    private readonly teachersRepo: Repository<TeachersEntity>,
    @InjectRepository(RoomEntity)
    private readonly roomsRepo: Repository<RoomEntity>,
    @InjectRepository(StudentsEntity)
    private readonly studentsRepo: Repository<StudentsEntity>,
  ) {}

  /**
   * Generates a school-unique book number in an invoice-like format:
   * BOOK-YYYY-0001, BOOK-YYYY-0002, ...
   */
  async generateBookNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BOOK-${year}-`;

    const last = await this.copiesRepo.findOne({
      where: { bookNumber: Like(`${prefix}%`) },
      order: { createdAt: 'DESC' },
    });

    let sequence = 1;
    if (last?.bookNumber) {
      const parts = last.bookNumber.split('-');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!Number.isNaN(lastSeq)) {
          sequence = lastSeq + 1;
        }
      }
    }

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }

  private ensureTeacher(profile: TeachersEntity & { role: ROLES }): void {
    const allowed = [
      ROLES.teacher,
      ROLES.hod,
      ROLES.seniorTeacher,
      ROLES.deputy,
      ROLES.head,
      ROLES.auditor,
      ROLES.director,
      ROLES.admin,
      ROLES.dev,
    ];
    if (!profile?.id || !allowed.includes(profile.role)) {
      throw new ForbiddenException('Not allowed to access library');
    }
  }

  private async getTeacherDepartmentId(
    profile: TeachersEntity & { role: ROLES },
  ): Promise<string> {
    const teacher = await this.teachersRepo.findOne({ where: { id: profile.id } });
    if (!teacher) throw new BadRequestException('Teacher profile not found');
    if (!teacher.departmentId) {
      throw new BadRequestException(
        'Teacher is not assigned to a department. Please update their department first.',
      );
    }
    return teacher.departmentId;
  }

  async getTitles(profile: TeachersEntity & { role: ROLES }, q?: string) {
    this.ensureTeacher(profile);
    const query = (q || '').trim();
    const qb = this.titlesRepo.createQueryBuilder('t').orderBy('t.title', 'ASC');
    if (query) {
      qb.where(
        '(t.title ILIKE :q OR t.author ILIKE :q OR t.isbn ILIKE :q)',
        { q: `%${query}%` },
      );
    }
    return qb.take(200).getMany();
  }

  async createTitle(
    profile: TeachersEntity & { role: ROLES },
    dto: CreateTextbookTitleDto,
  ) {
    this.ensureTeacher(profile);
    await this.getTeacherDepartmentId(profile); // enforce teacher has department

    const title = this.titlesRepo.create({
      title: dto.title.trim(),
      author: dto.author?.trim() || null,
      edition: dto.edition?.trim() || null,
      isbn: dto.isbn?.trim() || null,
      publisher: dto.publisher?.trim() || null,
      subject: dto.subject?.trim() || null,
      notes: dto.notes?.trim() || null,
    });

    return this.titlesRepo.save(title);
  }

  async getCopies(
    profile: TeachersEntity & { role: ROLES },
    params: { q?: string; titleId?: string; roomId?: string; status?: string },
  ) {
    this.ensureTeacher(profile);
    const deptId = await this.getTeacherDepartmentId(profile);

    const qb = this.copiesRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.title', 'title')
      .leftJoinAndSelect('c.room', 'room')
      .leftJoinAndSelect('c.department', 'department')
      .orderBy('c.createdAt', 'DESC')
      .take(200);

    qb.where('c.departmentId = :deptId', { deptId });

    if (params.titleId?.trim()) qb.andWhere('c.titleId = :titleId', { titleId: params.titleId.trim() });
    if (params.roomId?.trim()) qb.andWhere('c.roomId = :roomId', { roomId: params.roomId.trim() });
    if (params.status?.trim()) qb.andWhere('c.status = :status', { status: params.status.trim() });

    const query = (params.q || '').trim();
    if (query) {
      qb.andWhere('(c.bookNumber ILIKE :q OR title.title ILIKE :q OR title.author ILIKE :q)', {
        q: `%${query}%`,
      });
    }

    return qb.getMany();
  }

  async receiveCopies(
    profile: TeachersEntity & { role: ROLES },
    dto: ReceiveTextbookCopiesDto,
  ): Promise<{ created: number; bookNumbers: string[] }> {
    this.ensureTeacher(profile);
    const deptId = await this.getTeacherDepartmentId(profile);

    const title = await this.titlesRepo.findOne({ where: { id: dto.titleId } });
    if (!title) throw new NotFoundException('Textbook title not found');

    let roomId: string | null = dto.roomId?.trim() || null;
    if (roomId) {
      const room = await this.roomsRepo.findOne({ where: { id: roomId } });
      if (!room) throw new BadRequestException('Room not found');
      if (room.departmentId !== deptId) {
        throw new ForbiddenException('Room is not in your department');
      }
    }

    const assignedTeacherId = dto.assignedTeacherId?.trim() || null;

    return this.copiesRepo.manager.transaction(async (manager) => {
      const copyRepo = manager.getRepository(TextbookCopyEntity);
      const createdNumbers: string[] = [];

      // Generate a sequence of unique numbers (invoice-number style).
      // In the unlikely case of collision due to concurrent receives, the unique constraint will fail.
      for (let i = 0; i < dto.copiesCount; i += 1) {
        const bookNumber = await this.generateBookNumber();
        const copy = copyRepo.create({
          bookNumber,
          titleId: title.id,
          departmentId: deptId,
          roomId,
          status: TextbookCopyStatus.Available,
          assignedTeacherId,
        });
        await copyRepo.save(copy);
        createdNumbers.push(bookNumber);
      }

      return { created: createdNumbers.length, bookNumbers: createdNumbers };
    });
  }

  async assignCopy(
    profile: TeachersEntity & { role: ROLES },
    dto: AssignTextbookCopyDto,
  ) {
    this.ensureTeacher(profile);
    const deptId = await this.getTeacherDepartmentId(profile);

    const copy = await this.copiesRepo.findOne({ where: { id: dto.copyId } });
    if (!copy) throw new NotFoundException('Textbook copy not found');
    if (copy.departmentId !== deptId) {
      throw new ForbiddenException('Not allowed to assign a book from another department');
    }

    const assignedTeacherId = dto.assignedTeacherId?.trim() || null;
    if (assignedTeacherId) {
      const teacher = await this.teachersRepo.findOne({
        where: { id: assignedTeacherId },
      });
      if (!teacher) throw new BadRequestException('Assigned teacher not found');
      if (teacher.departmentId !== deptId) {
        throw new ForbiddenException('Assigned teacher is not in your department');
      }
    }

    copy.assignedTeacherId = assignedTeacherId;
    return this.copiesRepo.save(copy);
  }

  async getDepartmentTeachers(profile: TeachersEntity & { role: ROLES }) {
    this.ensureTeacher(profile);
    const deptId = await this.getTeacherDepartmentId(profile);
    return this.teachersRepo.find({
      where: { departmentId: deptId },
      select: ['id', 'name', 'surname', 'email'],
      order: { name: 'ASC', surname: 'ASC' },
      take: 200,
    });
  }

  async issueLoan(
    profile: TeachersEntity & { role: ROLES },
    dto: IssueTextbookLoanDto,
  ) {
    this.ensureTeacher(profile);
    const deptId = await this.getTeacherDepartmentId(profile);

    const copy = await this.copiesRepo.findOne({ where: { id: dto.copyId } });
    if (!copy) throw new NotFoundException('Textbook copy not found');
    if (copy.departmentId !== deptId) {
      throw new ForbiddenException('Not allowed to loan a book from another department');
    }
    if (copy.status !== TextbookCopyStatus.Available) {
      throw new BadRequestException(`Book is not available (status: ${copy.status})`);
    }

    const student = await this.studentsRepo.findOne({
      where: { studentNumber: dto.studentNumber },
    });
    if (!student) throw new BadRequestException('Student not found');

    const dueAt = new Date(dto.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException('Invalid dueAt');
    }

    return this.loansRepo.manager.transaction(async (manager) => {
      const loanRepo = manager.getRepository(TextbookLoanEntity);
      const copyRepo = manager.getRepository(TextbookCopyEntity);

      const loan = loanRepo.create({
        copyId: copy.id,
        studentNumber: student.studentNumber,
        borrowedAt: new Date(),
        dueAt,
        returnedAt: null,
        issuedByTeacherId: profile.id,
        receivedByTeacherId: null,
        notes: dto.notes?.trim() || null,
      });
      await loanRepo.save(loan);

      copy.status = TextbookCopyStatus.Borrowed;
      await copyRepo.save(copy);

      return loan;
    });
  }

  async returnLoan(
    profile: TeachersEntity & { role: ROLES },
    dto: ReturnTextbookLoanDto,
  ) {
    this.ensureTeacher(profile);
    const deptId = await this.getTeacherDepartmentId(profile);

    const loan = await this.loansRepo.findOne({ where: { id: dto.loanId } });
    if (!loan) throw new NotFoundException('Loan not found');

    const copy = await this.copiesRepo.findOne({ where: { id: loan.copyId } });
    if (!copy) throw new NotFoundException('Textbook copy not found');
    if (copy.departmentId !== deptId) {
      throw new ForbiddenException('Not allowed to return a book from another department');
    }

    if (loan.returnedAt) return loan;

    return this.loansRepo.manager.transaction(async (manager) => {
      const loanRepo = manager.getRepository(TextbookLoanEntity);
      const copyRepo = manager.getRepository(TextbookCopyEntity);

      loan.returnedAt = new Date();
      loan.receivedByTeacherId = profile.id;
      loan.notes = dto.notes?.trim() || loan.notes || null;
      await loanRepo.save(loan);

      copy.status = TextbookCopyStatus.Available;
      await copyRepo.save(copy);

      return loan;
    });
  }

  async getLoans(
    profile: TeachersEntity & { role: ROLES },
    params: {
      q?: string;
      studentNumber?: string;
      copyId?: string;
      status?: 'open' | 'returned';
    },
  ) {
    this.ensureTeacher(profile);
    const deptId = await this.getTeacherDepartmentId(profile);

    const qb = this.loansRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.copy', 'copy')
      .leftJoinAndSelect('copy.title', 'title')
      .leftJoinAndSelect('copy.room', 'room')
      .leftJoinAndSelect('l.student', 'student')
      .leftJoinAndSelect('l.issuedBy', 'issuedBy')
      .leftJoinAndSelect('l.receivedBy', 'receivedBy')
      .where('copy.departmentId = :deptId', { deptId })
      .orderBy('l.createdAt', 'DESC')
      .take(300);

    const query = (params.q || '').trim();
    if (query) {
      qb.andWhere(
        '(copy.bookNumber ILIKE :q OR title.title ILIKE :q OR l.studentNumber ILIKE :q OR student.name ILIKE :q OR student.surname ILIKE :q)',
        { q: `%${query}%` },
      );
    }
    if (params.studentNumber?.trim()) {
      qb.andWhere('l.studentNumber = :studentNumber', {
        studentNumber: params.studentNumber.trim(),
      });
    }
    if (params.copyId?.trim()) {
      qb.andWhere('l.copyId = :copyId', { copyId: params.copyId.trim() });
    }
    if (params.status === 'open') {
      qb.andWhere('l.returnedAt IS NULL');
    } else if (params.status === 'returned') {
      qb.andWhere('l.returnedAt IS NOT NULL');
    }

    return qb.getMany();
  }
}


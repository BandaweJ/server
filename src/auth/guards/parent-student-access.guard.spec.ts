import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { ROLES } from '../models/roles.enum';
import { ParentStudentAccessGuard } from './parent-student-access.guard';

describe('ParentStudentAccessGuard', () => {
  let guard: ParentStudentAccessGuard;
  let parentsRepository: jest.Mocked<Repository<ParentsEntity>>;

  const createMockContext = (
    user: { role: string; email?: string; studentNumber?: string } | null,
    params: { studentNumber?: string } = {},
  ): ExecutionContext => {
    const request = { user, params };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentStudentAccessGuard,
        { provide: getRepositoryToken(ParentsEntity), useValue: mockRepo },
      ],
    }).compile();

    guard = module.get<ParentStudentAccessGuard>(ParentStudentAccessGuard);
    parentsRepository = module.get(getRepositoryToken(ParentsEntity));
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access when no studentNumber in params', async () => {
    const ctx = createMockContext({ role: 'parent' }, {});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should allow access when user is dev/director/auditor/reception', async () => {
    const ctx = createMockContext(
      { role: ROLES.dev },
      { studentNumber: 'any-student' },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should allow student to access own studentNumber', async () => {
    const profile = {
      role: 'student',
      studentNumber: 'STU001',
      email: 's@test.com',
    };
    const ctx = createMockContext(profile, { studentNumber: 'STU001' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should deny student access to another studentNumber', async () => {
    const profile = {
      role: 'student',
      studentNumber: 'STU001',
      email: 's@test.com',
    };
    const ctx = createMockContext(profile, { studentNumber: 'STU002' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'You can only access your own records.',
    );
  });

  it('should allow parent to access linked child studentNumber', async () => {
    const profile = Object.assign(new ParentsEntity(), {
      role: 'parent',
      email: 'p@test.com',
      students: [{ studentNumber: 'STU001' }],
    });
    const ctx = createMockContext(profile, { studentNumber: 'STU001' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should deny parent access to non-linked studentNumber', async () => {
    const profile = Object.assign(new ParentsEntity(), {
      role: 'parent',
      email: 'p@test.com',
      students: [{ studentNumber: 'STU001' }],
    });
    const ctx = createMockContext(profile, { studentNumber: 'STU002' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'You can only access financial records and reports for your linked children.',
    );
  });

  it('should treat parent role case-insensitively', async () => {
    const profile = Object.assign(new ParentsEntity(), {
      role: 'Parent',
      email: 'p@test.com',
      students: [{ studentNumber: 'STU001' }],
    });
    const ctx = createMockContext(profile, { studentNumber: 'STU001' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

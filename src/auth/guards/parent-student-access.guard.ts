import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { ROLES } from '../models/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * Guard for routes that have :studentNumber in path.
 * When user is a parent, allows access only if studentNumber is one of the parent's linked children.
 * When user is a student, allows access only to their own studentNumber.
 */
@Injectable()
export class ParentStudentAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(ParentsEntity)
    private readonly parentsRepository: Repository<ParentsEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const profile = request.user;
    const studentNumber = request.params?.studentNumber;

    // Management / finance roles have unrestricted access to student-scoped
    // finance/report routes. They should be able to view any student's data.
    if (
      profile?.role === ROLES.dev ||
      profile?.role === ROLES.director ||
      profile?.role === ROLES.auditor ||
      profile?.role === ROLES.reception
    ) {
      return true;
    }

    if (!studentNumber) {
      return true;
    }
    if (!profile) {
      return true;
    }

    // 1) Parent role: restrict to linked children (existing behavior)
    if (profile.role === ROLES.parent && profile instanceof ParentsEntity) {
      const linkedStudentNumbers = (profile.students || []).map(
        (s: { studentNumber: string }) => s.studentNumber,
      );
      if (!linkedStudentNumbers.includes(studentNumber)) {
        throw new ForbiddenException(
          'You can only access financial records and reports for your linked children.',
        );
      }
    }

    // 2) Teacher who is also a parent: match by email to ParentsEntity
    if (profile.role === ROLES.teacher) {
      const email: string | undefined = (profile as any).email;
      if (email) {
        const parent = await this.parentsRepository.findOne({
          where: { email },
          relations: ['students'],
        });
        if (parent) {
          const linkedStudentNumbers = (parent.students || []).map(
            (s: { studentNumber: string }) => s.studentNumber,
          );
          if (!linkedStudentNumbers.includes(studentNumber)) {
            throw new ForbiddenException(
              'You can only access financial records and reports for your linked children.',
            );
          }
        }
      }
    }

    if (profile.role === ROLES.student && profile.studentNumber !== studentNumber) {
      throw new ForbiddenException('You can only access your own records.');
    }

    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { ROLES } from '../models/roles.enum';

/**
 * Guard for routes that have :studentNumber in path.
 * When user is a parent, allows access only if studentNumber is one of the parent's linked children.
 * When user is a student, allows access only to their own studentNumber.
 */
@Injectable()
export class ParentStudentAccessGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const profile = request.user;
    const studentNumber = request.params?.studentNumber;

    if (!studentNumber) {
      return true;
    }
    if (!profile) {
      return true;
    }

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

    if (profile.role === ROLES.student && profile.studentNumber !== studentNumber) {
      throw new ForbiddenException('You can only access your own records.');
    }

    return true;
  }
}

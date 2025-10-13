import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TeachersEntity } from '../../profiles/entities/teachers.entity';
import { ParentsEntity } from '../../profiles/entities/parents.entity';
import { StudentsEntity } from '../../profiles/entities/students.entity';

export const GetUser = createParamDecorator(
  (data, ctx: ExecutionContext): TeachersEntity | ParentsEntity | StudentsEntity => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AccountsEntity } from '../entities/accounts.entity';

export const GetUser = createParamDecorator(
  (data, ctx: ExecutionContext): AccountsEntity => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

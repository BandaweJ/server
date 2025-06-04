/* eslint-disable prettier/prettier */
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { JwtPayload } from './models/jwt-payload.interface';
import { AccountsEntity } from './entities/accounts.entity';
import { Repository } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { ResourceByIdService } from '../resource-by-id/resource-by-id.service';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { ROLES } from './models/roles.enum';
import { ConfigService } from '@nestjs/config';

export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(AccountsEntity)
    private accountsRepository: Repository<AccountsEntity>,
    private resourceById: ResourceByIdService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(
    payload: JwtPayload,
  ): Promise<TeachersEntity | ParentsEntity | StudentsEntity> {
    const { username, role, id } = payload;

    const user = await this.accountsRepository.findOne({ where: { username } });

    if (!user) {
      throw new UnauthorizedException('You are not Authorised');
    }

    switch (role) {
      case ROLES.teacher:
      case ROLES.admin:
      case ROLES.hod:
      case ROLES.reception:
        return await this.resourceById.getTeacherById(id);
        break;
      case 'parent':
        return await this.resourceById.getParentByEmail(id);
        break;
      case 'student':
        return await this.resourceById.getStudentByStudentNumber(id);
    }
  }
}

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

    console.log('JWT Strategy: Validating token', { username, role, id });

    if (!username || !role || !id) {
      console.error('JWT Strategy: Invalid payload - missing fields', { username, role, id });
      throw new UnauthorizedException('Invalid JWT payload');
    }

    const user = await this.accountsRepository.findOne({ where: { username } });

    if (!user) {
      console.error('JWT Strategy: Account not found', { username });
      throw new UnauthorizedException('You are not Authorised');
    }

    console.log('JWT Strategy: Account found', { username, accountRole: user.role, accountId: user.id });

    try {
      let profile: TeachersEntity | ParentsEntity | StudentsEntity;
      
      switch (role) {
        case ROLES.teacher:
        case ROLES.admin:
        case ROLES.hod:
        case ROLES.reception:
        case ROLES.auditor:
        case ROLES.director:
          profile = await this.resourceById.getTeacherById(id);
          console.log('JWT Strategy: Teacher profile found', { profileId: profile.id, profileRole: (profile as any).role });
          break;
        case ROLES.parent:
          profile = await this.resourceById.getParentByEmail(id);
          console.log('JWT Strategy: Parent profile found', { email: id });
          break;
        case ROLES.student:
          profile = await this.resourceById.getStudentByStudentNumber(id);
          console.log('JWT Strategy: Student profile found', { studentNumber: id });
          break;
        default:
          console.error('JWT Strategy: Invalid role', { role });
          throw new UnauthorizedException(`Invalid user role: ${role}`);
      }
      
      // Attach the role from JWT payload to the profile
      // This ensures the role from accounts table is used (not the profile's role field)
      (profile as any).role = role;
      (profile as any).accountId = user.id;
      
      const profileId = (profile as any).id || (profile as any).email || (profile as any).studentNumber;
      console.log('JWT Strategy: Validation successful', { 
        username, 
        role, 
        profileId,
        accountId: user.id 
      });
      
      return profile;
    } catch (error) {
      console.error('JWT Strategy validation error:', error);
      throw new UnauthorizedException('Failed to validate user profile');
    }
  }
}

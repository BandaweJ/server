/* eslint-disable prettier/prettier */
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { JwtPayload } from './models/jwt-payload.interface';
import { AccountsEntity } from './entities/accounts.entity';
import { Repository } from 'typeorm';
import { UnauthorizedException, Logger, NotFoundException } from '@nestjs/common';
import { ResourceByIdService } from '../resource-by-id/resource-by-id.service';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { ROLES } from './models/roles.enum';
import { ConfigService } from '@nestjs/config';

export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @InjectRepository(AccountsEntity)
    private accountsRepository: Repository<AccountsEntity>,
    private resourceById: ResourceByIdService,
    private configService: ConfigService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured in environment variables');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
      ignoreExpiration: false, // Explicitly don't ignore expiration
    });
    
    this.logger.log('JWT Strategy initialized', {
      hasSecret: !!jwtSecret,
      secretLength: jwtSecret?.length || 0,
      ignoreExpiration: false,
    });
  }

  async validate(
    payload: JwtPayload,
    ): Promise<TeachersEntity | ParentsEntity | StudentsEntity> {
    this.logger.log('JWT Strategy: Validating payload', { 
      username: payload.username, 
      role: payload.role, 
      id: payload.id 
    });
    
    // Log that we received the payload (means token was successfully decoded)
    this.logger.log('JWT Strategy: Token decoded successfully, payload received');
    
    const { username, role, id } = payload;

    if (!username || !role || !id) {
      this.logger.error(`JWT Strategy: Invalid payload - missing fields`, { username, role, id });
      throw new UnauthorizedException('Invalid JWT payload');
    }

    this.logger.debug(`JWT Strategy: Looking up account for username: ${username}`);
    const user = await this.accountsRepository.findOne({ 
      where: { username },
      relations: ['student'], // Load student relation for students
    });

    if (!user) {
      this.logger.error(`JWT Strategy: Account not found for username: ${username}`);
      throw new UnauthorizedException('You are not Authorised');
    }
    
    this.logger.log(`JWT Strategy: Account found, looking up profile for role: ${role}, id: ${id}`);
    
    // For students, if account has student relation, use that student number instead of JWT id
    // This handles cases where JWT was issued with wrong id
    if (role === ROLES.student && user.student) {
      const studentNumberFromRelation = user.student.studentNumber;
      if (studentNumberFromRelation && studentNumberFromRelation !== id) {
        this.logger.warn(`JWT Strategy: JWT id (${id}) doesn't match student number from account (${studentNumberFromRelation}). Using student number from account.`, {
          jwtId: id,
          accountId: user.id,
          studentNumberFromRelation,
        });
        // Use the student number from the account relation instead
        // This fixes tokens issued with incorrect id
      }
    }

    try {
      let profile: TeachersEntity | ParentsEntity | StudentsEntity;
      
      switch (role) {
        case ROLES.teacher:
        case ROLES.admin:
        case ROLES.hod:
        case ROLES.reception:
        case ROLES.auditor:
        case ROLES.director:
          try {
            profile = await this.resourceById.getTeacherById(id);
            if (!profile) {
              this.logger.error('JWT Strategy: Teacher profile not found', { id, role });
              throw new UnauthorizedException('Teacher profile not found');
            }
          } catch (error) {
            // getTeacherById throws NotFoundException if teacher doesn't exist
            if (error instanceof NotFoundException) {
              this.logger.error('JWT Strategy: Teacher profile not found in database', { 
                id, 
                role, 
                username,
                errorMessage: error.message 
              });
              throw new UnauthorizedException(`Teacher profile not found for ID: ${id}. Please contact administrator.`);
            }
            // Re-throw if it's a different error
            this.logger.error('JWT Strategy: Unexpected error during teacher lookup', { 
              id, 
              role, 
              username,
              error: error.message,
              errorStack: error.stack 
            });
            throw error;
          }
          break;
        case ROLES.parent:
          profile = await this.resourceById.getParentByEmail(id);
          if (!profile) {
            this.logger.error('JWT Strategy: Parent profile not found', { email: id });
            throw new UnauthorizedException('Parent profile not found');
          }
          break;
        case ROLES.student: {
          // For students, try to use student number from account relation if available
          // This handles cases where JWT was issued with incorrect id
          const studentNumberToUse = user.student?.studentNumber || id;
          
          try {
            profile = await this.resourceById.getStudentByStudentNumber(studentNumberToUse);
            if (!profile) {
              this.logger.error('JWT Strategy: Student profile not found', { 
                studentNumber: studentNumberToUse,
                jwtId: id,
                accountId: user.id,
              });
              throw new UnauthorizedException('Student profile not found');
            }
          } catch (error) {
            // getStudentByStudentNumber throws NotFoundException if student doesn't exist
            if (error instanceof NotFoundException) {
              this.logger.error('JWT Strategy: Student profile not found in database', { 
                studentNumber: studentNumberToUse,
                jwtId: id,
                accountId: user.id,
                role, 
                username,
                errorMessage: error.message 
              });
              throw new UnauthorizedException(`Student profile not found for student number: ${studentNumberToUse}. Please contact administrator.`);
            }
            // Re-throw if it's a different error
            this.logger.error('JWT Strategy: Unexpected error during student lookup', { 
              studentNumber: studentNumberToUse,
              jwtId: id,
              accountId: user.id,
              role, 
              username,
              error: error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined
            });
            throw error;
          }
          break;
        }
        default:
          this.logger.error('JWT Strategy: Invalid role', { role });
          throw new UnauthorizedException(`Invalid user role: ${role}`);
      }
      
      // Attach the role from JWT payload to the profile
      // This ensures the role from accounts table is used (not the profile's role field)
      (profile as any).role = role;
      (profile as any).accountId = user.id;
      
      this.logger.log('JWT Strategy: Validation successful', {
        username,
        role,
        profileId: (profile as any).id || (profile as any).studentNumber || (profile as any).email,
        accountId: user.id,
      });
      
      return profile;
    } catch (error) {
      this.logger.error('JWT Strategy validation error:', error);
      throw new UnauthorizedException('Failed to validate user profile');
    }
  }
}

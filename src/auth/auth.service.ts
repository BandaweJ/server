import { BadRequestException } from '@nestjs/common';

import { AccountsDto } from './dtos/signup.dto';
import { ROLES } from './models/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountsEntity } from './entities/accounts.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { SignupResponse } from './dtos/signup-response.dto';
import { SigninDto } from './dtos/signin.dto';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './models/jwt-payload.interface';
import { ResourceByIdService } from 'src/resource-by-id/resource-by-id.service';
import { AccountStats } from './models/acc-stats.model';
import { ActivityService } from '../activity/activity.service';
import { Injectable } from '@nestjs/common';
import { NotImplementedException } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AccountsEntity)
    private accountsRepository: Repository<AccountsEntity>,
    private jwtService: JwtService,
    private resourceById: ResourceByIdService,
    private activityService: ActivityService,
  ) {}

  async getAccountsStats() {
    const accStats = new AccountStats(0, 0, 0, 0);

    const res = await this.accountsRepository.find({
      select: ['username'],
      relations: ['student', 'teacher'],
    });

    res.map((acc) => {
      if (acc.role === 'student') {
        accStats.students++;
      } else {
        switch (acc.teacher.role) {
          case 'admin':
            accStats.admins++;
            break;
          case 'teacher':
            accStats.teachers++;
            break;
          case 'reception':
            accStats.reception++;
            break;
        }
      }
    });

    return accStats;
  }

  async signup(accountsDto: AccountsDto): Promise<SignupResponse> {
    const { role, id, username, password } = accountsDto;

    // const found = await this.accountsRepository.findOne({
    //   where: { id },
    // });

    // if (found) {
    //   throw new BadRequestException(
    //     `User with ID ${id} already has an account`,
    //   );
    // }

    const salt = await bcrypt.genSalt();

    const account = new AccountsEntity();
    account.role = role;
    account.id = id;
    account.username = username;
    account.password = await this.hashPassword(password, salt);
    account.salt = salt;
    // password = await this.hashPassword(password, salt);

    switch (role) {
      case ROLES.parent: {
        const pr = await this.resourceById.getParentByEmail(id);

        try {
          const user = await this.accountsRepository.save({
            ...account,
          });
          return { response: true };
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            throw new BadRequestException('Username Already taken');
          } else {
            throw new NotImplementedException('Failed to create account');
          }
        }
        break;
      }

      case ROLES.student: {
        const st = await this.resourceById.getStudentByStudentNumber(id);

        try {
          account.student = st;
          const user = await this.accountsRepository.save({
            ...account,
          });

          return { response: true };
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            throw new BadRequestException('Username Already taken');
          } else {
            throw new NotImplementedException('Failed to create account');
          }
        }
        break;
      }

      case ROLES.teacher:
      case ROLES.reception:
      case ROLES.hod:
      case ROLES.admin:
      case ROLES.auditor:
      case ROLES.director: {
        const tr = await this.resourceById.getTeacherById(id);

        try {
          account.teacher = tr;
          const user = await this.accountsRepository.save({
            ...account,
          });
          return { response: true };
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            throw new BadRequestException('Username Already taken');
          } else {
            throw new NotImplementedException('Failed to create account');
          }
        }
        break;
      }
    }
  }

  private async hashPassword(password: string, salt: string): Promise<string> {
    return await bcrypt.hash(password, salt);
  }

  async signin(signinDto: SigninDto): Promise<{ accessToken: string }> {
    const result = await this.validatePassword(signinDto);

    if (!result) {
      throw new UnauthorizedException('Invalid login creadentials');
    }

    const payload = { ...result };
    const accessToken = await this.jwtService.sign(payload);

    // Log the login activity
    try {
      await this.activityService.logActivity({
        userId: result.id,
        action: 'LOGIN',
        description: `User ${signinDto.username} logged in successfully`,
        metadata: { username: signinDto.username },
      });
    } catch (error) {
      // Don't fail the login if activity logging fails
      console.error('Failed to log login activity:', error);
    }

    return { accessToken };
  }

  private async validatePassword(signinDto: SigninDto): Promise<JwtPayload> {
    const { username, password } = signinDto;

    const user = await this.accountsRepository.findOne({ where: { username } });

    if (user && (await user.validatePassword(password))) {
      const rol = user.role;
      const id = user.id;

      switch (rol) {
        case ROLES.admin:
        case ROLES.director:
        case ROLES.auditor:
        case ROLES.hod:
        case ROLES.reception:
        case ROLES.teacher: {
          const usr = await this.resourceById.getTeacherById(id);
          return { username, role: usr.role, id };
        }
        case ROLES.parent: {
          const usr = await this.resourceById.getParentByEmail(id);
          return { username, role: usr.role, id };
        }
        case ROLES.student: {
          const usr = await this.resourceById.getStudentByStudentNumber(id);
          return { username, role: usr.role, id };
        }
      }
    } else {
      return null;
    }
  }

  async fetchUserDetails(id: string, role: string) {
    // First get the account to get username
    const account = await this.accountsRepository.findOne({
      where: { id },
      relations: ['student', 'teacher']
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    let userDetails = null;

    if (role === ROLES.student && account.student) {
      userDetails = account.student;
    } else if (
      [ROLES.teacher, ROLES.hod, ROLES.reception, ROLES.admin, ROLES.auditor, ROLES.director].includes(role as ROLES) &&
      account.teacher
    ) {
      userDetails = account.teacher;
    } else if (role === ROLES.parent) {
      // For parents, we need to get the parent by email (since parent uses email as primary key)
      userDetails = await this.resourceById.getParentByEmail(id);
    }

    if (!userDetails) {
      throw new BadRequestException('User profile not found');
    }

    // Add username to the user details
    return {
      ...userDetails,
      username: account.username,
      accountId: account.id,
      role: account.role
    };
  }

  async getAllAccounts() {
    const accounts = await this.accountsRepository.find({
      select: ['id', 'username', 'role', 'createdAt'],
      relations: ['student', 'teacher'],
    });

    // Map accounts to include user details
    const accountsWithDetails = await Promise.all(
      accounts.map(async (account) => {
        let userDetails = null;
        let name = account.username;
        let email = null;

        try {
          if (account.role === ROLES.student && account.student) {
            userDetails = account.student;
            name = `${account.student.name || ''} ${account.student.surname || ''}`.trim() || account.username;
            email = account.student.email || null;
          } else if (
            [ROLES.teacher, ROLES.admin, ROLES.hod, ROLES.reception, ROLES.auditor, ROLES.director].includes(
              account.role as ROLES
            ) &&
            account.teacher
          ) {
            userDetails = account.teacher;
            name = `${account.teacher.name || ''} ${account.teacher.surname || ''}`.trim() || account.username;
            email = account.teacher.email || null;
          } else if (account.role === ROLES.parent) {
            const parent = await this.resourceById.getParentByEmail(account.id);
            userDetails = parent;
            name = `${parent.surname || ''}`.trim() || account.username;
            email = null;
          }
        } catch (error) {
          console.error(`Error fetching details for account ${account.username}:`, error);
        }

        return {
          id: account.id,
          username: account.username,
          role: account.role,
          name: name,
          email: email,
          createdAt: account.createdAt,
          status: 'active', // TODO: Add status field to accounts entity
        };
      })
    );

    return accountsWithDetails;
  }

  async resetPassword(id: string): Promise<{ message: string; generatedPassword: string }> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    
    if (!account) {
      throw new BadRequestException('User not found');
    }

    // Generate a random password
    const generatedPassword = Math.random().toString(36).slice(-8) + 'A1!';
    const salt = await bcrypt.genSalt();
    
    account.password = await this.hashPassword(generatedPassword, salt);
    account.salt = salt;
    
    await this.accountsRepository.save(account);
    
    // Log the password reset activity
    try {
      await this.activityService.logActivity({
        userId: id,
        action: 'PASSWORD_RESET',
        description: `Password reset for user ${account.username}`,
        resourceType: 'user',
        resourceId: id,
        metadata: { username: account.username },
      });
    } catch (error) {
      console.error('Failed to log password reset activity:', error);
    }
    
    return {
      message: 'Password reset successfully',
      generatedPassword: generatedPassword
    };
  }

  async setCustomPassword(id: string, newPassword: string): Promise<{ message: string }> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    
    if (!account) {
      throw new BadRequestException('User not found');
    }

    // Generate new salt and hash the custom password
    const salt = await bcrypt.genSalt();
    account.password = await this.hashPassword(newPassword, salt);
    account.salt = salt;
    
    await this.accountsRepository.save(account);
    
    // Log the password change activity
    try {
      await this.activityService.logActivity({
        userId: id,
        action: 'PASSWORD_CHANGED',
        description: `Password changed for user ${account.username}`,
        resourceType: 'user',
        resourceId: id,
        metadata: { username: account.username },
      });
    } catch (error) {
      console.error('Failed to log password change activity:', error);
    }
    
    return {
      message: 'Password updated successfully'
    };
  }

  async updateAccount(id: string, updateData: { username?: string }): Promise<{ message: string }> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    
    if (!account) {
      throw new BadRequestException('User not found');
    }

    if (updateData.username) {
      account.username = updateData.username;
      await this.accountsRepository.save(account);
    }
    
    return {
      message: 'Account updated successfully'
    };
  }

  async updateProfile(id: string, role: string, updateData: any): Promise<{ message: string }> {
    const account = await this.accountsRepository.findOne({ 
      where: { id },
      relations: ['student', 'teacher']
    });
    
    if (!account) {
      throw new BadRequestException('User not found');
    }

    // Update profile based on role
    if (account.role === 'student' && account.student) {
      await this.resourceById.updateStudent(account.student.studentNumber, updateData);
    } else if (['teacher', 'admin', 'hod', 'reception', 'auditor', 'director'].includes(account.role) && account.teacher) {
      await this.resourceById.updateTeacher(account.teacher.id, updateData);
    } else {
      throw new BadRequestException('Profile not found for this user');
    }
    
    // Log the profile update activity
    try {
      await this.activityService.logActivity({
        userId: id,
        action: 'PROFILE_UPDATED',
        description: `Profile updated for user ${account.username}`,
        resourceType: account.role,
        resourceId: id,
        metadata: { username: account.username, updatedFields: Object.keys(updateData) },
      });
    } catch (error) {
      console.error('Failed to log profile update activity:', error);
    }
    
    return {
      message: 'Profile updated successfully'
    };
  }

  async getUserActivity(id: string, page: number = 1, limit: number = 20): Promise<any> {
    // Use the ActivityService to get real activity data
    return await this.activityService.getUserActivities(id, page, limit);
  }
}

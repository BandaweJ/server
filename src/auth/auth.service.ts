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

    // Check if user already has an account
    const existingAccount = await this.accountsRepository.findOne({
      where: [
        { id }, // Check by ID (studentNumber/teacher ID/parent email)
        { username }, // Check by username
      ],
    });

    if (existingAccount) {
      throw new BadRequestException(
        `User with ID ${id} or username ${username} already has an account`,
      );
    }

    const salt = await bcrypt.genSalt();

    const account = new AccountsEntity();
    account.role = role;
    account.id = id;
    account.username = username;
    account.password = await this.hashPassword(password, salt);
    account.salt = salt;
    account.active = true; // New accounts are active by default
    account.deletedAt = null;
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
        // Verify student exists before creating account
        // id from DTO should be the student number
        const st = await this.resourceById.getStudentByStudentNumber(id);
        
        // account.id is already set to id (student number) on line 80
        // Verify they match
        if (account.id !== id) {
          throw new BadRequestException('Account ID mismatch during student signup');
        }
        
        // Verify student number matches
        if (st.studentNumber !== id) {
          throw new BadRequestException('Student number mismatch during signup');
        }
        
        try {
          account.student = st;
          const user = await this.accountsRepository.save({
            ...account,
          });

          // Verify the account was saved correctly with correct ID
          if (!user || !user.id || user.id !== id) {
            console.error('Student signup - account save verification failed:', {
              expectedId: id,
              actualId: user?.id,
              studentNumber: st.studentNumber,
            });
            throw new NotImplementedException('Failed to create account - account ID mismatch');
          }

          return { response: true };
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            throw new BadRequestException('Username Already taken');
          } else {
            console.error('Student signup error:', {
              studentNumber: id,
              username,
              error: err instanceof Error ? err.message : String(err),
              errorCode: (err as any)?.code,
            });
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

  async signin(signinDto: SigninDto): Promise<{ accessToken: string; permissions: string[] }> {
    const result = await this.validatePassword(signinDto);

    if (!result) {
      throw new UnauthorizedException('Invalid login credentials');
    }

    const payload = { ...result };
    const accessToken = await this.jwtService.sign(payload);

    // Get user permissions from their role
    let permissions: string[] = [];
    try {
      // Get account to find roleId
      const account = await this.accountsRepository.findOne({
        where: { username: signinDto.username },
        relations: ['roleEntity', 'roleEntity.permissions'],
      });

      if (account?.roleEntity?.permissions) {
        permissions = account.roleEntity.permissions
          .filter((p) => p.active)
          .map((p) => p.name);
      }
    } catch (error) {
      // Don't fail the login if permission fetching fails
      console.error('Failed to fetch user permissions:', error);
    }

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

    return { accessToken, permissions };
  }

  private async validatePassword(signinDto: SigninDto): Promise<JwtPayload> {
    const { username, password } = signinDto;

    // Load account with student relation for students (to get student number)
    const user = await this.accountsRepository.findOne({ 
      where: { username },
      relations: ['student'],
    });

    if (!user) {
      return null; // User not found
    }

    // Check if user account is active (not deleted)
    // For existing users without active field, default to true (handled by entity default value)
    // We check explicitly for false to handle cases where the field exists but is false
    if (user.active === false || user.deletedAt) {
      throw new UnauthorizedException('Account has been deactivated. Please contact an administrator.');
    }

    if (await user.validatePassword(password)) {
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
          // For students, account.id IS the student number (set during signup from DTO)
          // During signup: account.id = id (where id is the student number from DTO)
          // So we can use account.id directly as the student number
          try {
            const usr = await this.resourceById.getStudentByStudentNumber(id);
            return { username, role: usr.role, id };
          } catch (error) {
            // If student not found, log for debugging
            console.error('Student signin - student lookup failed:', {
              accountId: id,
              username,
              error: error instanceof Error ? error.message : String(error),
              studentRelationExists: !!user.student,
              studentNumberFromRelation: user.student?.studentNumber,
            });
            throw new UnauthorizedException(
              `Student profile not found. Please contact an administrator.`
            );
          }
        }
      }
    } else {
      return null; // Invalid password
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
    // Include ALL accounts (active and inactive/deleted) so they can be managed and reactivated
    const accounts = await this.accountsRepository.find({
      select: ['id', 'username', 'role', 'createdAt', 'active', 'deletedAt'],
      relations: ['student', 'teacher'],
      // No filtering - return all accounts so deleted ones can be reactivated
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
          status: account.active === false || account.deletedAt ? 'inactive' : 'active',
          active: account.active !== false, // Treat null/undefined as true for backward compatibility
          deletedAt: account.deletedAt || null,
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

    // Handle active status change (activate/deactivate user)
    if (updateData.active !== undefined) {
      account.active = updateData.active;
      
      if (updateData.active) {
        // Reactivate: clear deletedAt and set active to true
        account.deletedAt = null;
        account.active = true;
      } else {
        // Deactivate: set active to false and set deletedAt if not already set
        account.active = false;
        if (!account.deletedAt) {
          account.deletedAt = new Date();
        }
      }
      
      await this.accountsRepository.save(account);
      
      // Log the activation/deactivation activity
      try {
        await this.activityService.logActivity({
          userId: id,
          action: updateData.active ? 'USER_RESTORED' : 'USER_DELETED',
          description: updateData.active 
            ? `User ${account.username} was reactivated` 
            : `User ${account.username} was deactivated`,
          resourceType: 'user',
          resourceId: id,
          metadata: { username: account.username, active: updateData.active },
        });
      } catch (error) {
        console.error('Failed to log activity:', error);
      }
      
      // Remove active from updateData so it doesn't get passed to profile update
      const { active, ...profileUpdateData } = updateData;
      if (Object.keys(profileUpdateData).length === 0) {
        return {
          message: updateData.active ? 'User reactivated successfully' : 'User deactivated successfully'
        };
      }
      updateData = profileUpdateData;
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

  async deleteAccount(id: string): Promise<{ message: string }> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    
    if (!account) {
      throw new BadRequestException('User not found');
    }

    // Check if already deleted
    if (!account.active || account.deletedAt) {
      throw new BadRequestException('User is already deleted');
    }

    // Soft delete: mark as inactive and set deletedAt timestamp
    account.active = false;
    account.deletedAt = new Date();
    await this.accountsRepository.save(account);

    // Log the deletion activity
    try {
      await this.activityService.logActivity({
        userId: id,
        action: 'USER_DELETED',
        description: `User account ${account.username} was deleted`,
        resourceType: 'user',
        resourceId: id,
        metadata: { 
          username: account.username,
          role: account.role,
          deletedAt: account.deletedAt 
        },
      });
    } catch (error) {
      console.error('Failed to log user deletion activity:', error);
    }

    return {
      message: 'User deleted successfully'
    };
  }

  async restoreAccount(id: string): Promise<{ message: string }> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    
    if (!account) {
      throw new BadRequestException('User not found');
    }

    if (account.active) {
      throw new BadRequestException('User is already active');
    }

    // Restore the account
    account.active = true;
    account.deletedAt = null;
    await this.accountsRepository.save(account);

    // Log the restoration activity
    try {
      await this.activityService.logActivity({
        userId: id,
        action: 'USER_RESTORED',
        description: `User account ${account.username} was restored`,
        resourceType: 'user',
        resourceId: id,
        metadata: { username: account.username, role: account.role },
      });
    } catch (error) {
      console.error('Failed to log user restoration activity:', error);
    }

    return {
      message: 'User restored successfully'
    };
  }

  async getUserActivity(id: string, page: number = 1, limit: number = 20): Promise<any> {
    // Use the ActivityService to get real activity data
    return await this.activityService.getUserActivities(id, page, limit);
  }
}

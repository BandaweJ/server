/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';

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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AccountsEntity)
    private accountsRepository: Repository<AccountsEntity>,
    private jwtService: JwtService,
    private resourceById: ResourceByIdService,
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

    return { accessToken };

    // return payload;
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
    if (role === ROLES.student) {
      const user = await this.resourceById.getStudentByStudentNumber(id);

      return user;
    } else if (
      role === ROLES.teacher ||
      role === ROLES.hod ||
      role === ROLES.reception ||
      role === ROLES.admin
    ) {
      const user = await this.resourceById.getTeacherById(id);

      return user;
    } else {
      const user = await this.resourceById.getParentByEmail(id);
      return user;
    }
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

  async resetPassword(id: string): Promise<{ message: string; temporaryPassword: string }> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    
    if (!account) {
      throw new BadRequestException('User not found');
    }

    // Generate a random temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    const salt = await bcrypt.genSalt();
    
    account.password = await this.hashPassword(tempPassword, salt);
    account.salt = salt;
    
    await this.accountsRepository.save(account);
    
    return {
      message: 'Password reset successfully',
      temporaryPassword: tempPassword
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
}

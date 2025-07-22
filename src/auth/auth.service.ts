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

      case ROLES.teacher: {
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

  async fetchUserDetails(id: string) {
    const user = await this.resourceById.getTeacherById(id);

    return user;
  }
}

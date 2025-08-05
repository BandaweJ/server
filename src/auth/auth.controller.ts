/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AccountsDto } from './dtos/signup.dto';
import { SigninDto } from './dtos/signin.dto';
import { AuthGuard } from '@nestjs/passport';
import { ROLES } from './models/roles.enum';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('/signup')
  signup(@Body() accountsDto: AccountsDto) {
    return this.authService.signup(accountsDto);
  }

  @Post('/signin')
  signin(@Body() signinDto: SigninDto) {
    // console.log(signinDto);
    return this.authService.signin(signinDto);
  }

  @Get('/:id/:role')
  @UseGuards(AuthGuard())
  getUserDetails(@Param('id') id: string, @Param('role') role: string) {
    return this.authService.fetchUserDetails(id, role);
  }

  @Get()
  @UseGuards(AuthGuard())
  getAccountsStats() {
    return this.authService.getAccountsStats();
  }
}

/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AccountsDto } from './dtos/signup.dto';
import { SigninDto } from './dtos/signin.dto';
import { AuthGuard } from '@nestjs/passport';

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

  @Get('/:id')
  @UseGuards(AuthGuard())
  getUserDetails(id: string) {
    return this.authService.fetchUserDetails(id);
  }

  @Get()
  @UseGuards(AuthGuard())
  getAccountsStats() {
    return this.authService.getAccountsStats();
  }
}

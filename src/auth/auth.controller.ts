/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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

  @Get('accounts/all')
  @UseGuards(AuthGuard())
  getAllAccounts() {
    return this.authService.getAllAccounts();
  }

  @Get('accounts/stats')
  @UseGuards(AuthGuard())
  getAccountsStats() {
    return this.authService.getAccountsStats();
  }

  @Get('/:id/:role')
  @UseGuards(AuthGuard())
  getUserDetails(@Param('id') id: string, @Param('role') role: string) {
    return this.authService.fetchUserDetails(id, role);
  }

  @Post('/:id/reset-password')
  @UseGuards(AuthGuard())
  resetPassword(@Param('id') id: string) {
    return this.authService.resetPassword(id);
  }

  @Patch('/:id')
  @UseGuards(AuthGuard())
  updateAccount(@Param('id') id: string, @Body() updateData: { username?: string }) {
    return this.authService.updateAccount(id, updateData);
  }

  @Patch('/:id/profile')
  @UseGuards(AuthGuard())
  updateProfile(@Param('id') id: string, @Body() updateData: any) {
    return this.authService.updateProfile(id, '', updateData);
  }
}

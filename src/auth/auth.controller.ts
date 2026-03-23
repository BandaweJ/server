/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AccountsDto } from './dtos/signup.dto';
import { SigninDto } from './dtos/signin.dto';
import { ROLES } from './models/roles.enum';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { HasRoles } from './decorators/has-roles.decorator';

type AuthenticatedRequest = {
  user?: { accountId?: string; id?: string; role?: ROLES | string };
  tenant?: { id: string; slug: string };
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private isPrivilegedRole(role?: string | ROLES): boolean {
    return [ROLES.admin, ROLES.director, ROLES.dev].includes(role as ROLES);
  }

  private assertSelfOrPrivileged(req: AuthenticatedRequest, targetId: string): void {
    const accountId = req.user?.accountId || req.user?.id;
    const role = req.user?.role;
    if (this.isPrivilegedRole(role)) return;
    if (accountId && accountId === targetId) return;
    throw new ForbiddenException('You are not allowed to access this account');
  }

  @Post('/signup')
  signup(@Body() accountsDto: AccountsDto) {
    return this.authService.signup(accountsDto);
  }

  @Post('/signin')
  signin(@Body() signinDto: SigninDto, @Req() req: AuthenticatedRequest) {
    return this.authService.signin(signinDto, req.tenant);
  }

  @Get('accounts/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  getAllAccounts() {
    return this.authService.getAllAccounts();
  }

  @Get('accounts/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  getAccountsStats() {
    return this.authService.getAccountsStats();
  }

  @Get('/:id/:role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev, ROLES.parent, ROLES.student, ROLES.teacher, ROLES.reception, ROLES.hod, ROLES.auditor)
  getUserDetails(@Param('id') id: string, @Param('role') role: string, @Req() req: AuthenticatedRequest) {
    this.assertSelfOrPrivileged(req, id);
    return this.authService.fetchUserDetails(id, role);
  }

  @Post('/:id/reset-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  resetPassword(@Param('id') id: string) {
    return this.authService.resetPassword(id);
  }

  @Post('/:id/set-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev, ROLES.parent, ROLES.student, ROLES.teacher, ROLES.reception, ROLES.hod, ROLES.auditor)
  setCustomPassword(@Param('id') id: string, @Body() body: { password: string }, @Req() req: AuthenticatedRequest) {
    this.assertSelfOrPrivileged(req, id);
    return this.authService.setCustomPassword(id, body.password);
  }

  @Patch('/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  updateAccount(
    @Param('id') id: string,
    @Body() updateData: { username?: string; role?: ROLES },
  ) {
    return this.authService.updateAccount(id, updateData);
  }

  @Patch('/:id/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev, ROLES.parent, ROLES.student, ROLES.teacher, ROLES.reception, ROLES.hod, ROLES.auditor)
  updateProfile(@Param('id') id: string, @Body() updateData: any, @Req() req: AuthenticatedRequest) {
    this.assertSelfOrPrivileged(req, id);
    return this.authService.updateProfile(id, '', updateData);
  }

  @Get('/accounts/:id/activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev, ROLES.parent, ROLES.student, ROLES.teacher, ROLES.reception, ROLES.hod, ROLES.auditor)
  getUserActivity(@Param('id') id: string, @Query('page') page: string = '1', @Query('limit') limit: string = '20', @Req() req: AuthenticatedRequest) {
    this.assertSelfOrPrivileged(req, id);
    return this.authService.getUserActivity(id, parseInt(page), parseInt(limit));
  }

  @Delete('/accounts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  deleteAccount(@Param('id') id: string) {
    return this.authService.deleteAccount(id);
  }

  @Post('/accounts/:id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  restoreAccount(@Param('id') id: string) {
    return this.authService.restoreAccount(id);
  }
}


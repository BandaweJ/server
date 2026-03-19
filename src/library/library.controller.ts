import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { HasPermissions } from 'src/auth/decorators/has-permissions.decorator';
import { PERMISSIONS } from 'src/auth/models/permissions.constants';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { ROLES } from 'src/auth/models/roles.enum';
import { LibraryService } from './library.service';
import { CreateTextbookTitleDto } from './dtos/create-textbook-title.dto';
import { ReceiveTextbookCopiesDto } from './dtos/receive-textbook-copies.dto';
import { IssueTextbookLoanDto } from './dtos/issue-textbook-loan.dto';
import { ReturnTextbookLoanDto } from './dtos/return-textbook-loan.dto';
import { AssignTextbookCopyDto } from './dtos/assign-textbook-copy.dto';

@Controller('library')
@UseGuards(AuthGuard(), PermissionsGuard)
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get('titles')
  @HasPermissions(PERMISSIONS.INVENTORY.VIEW_OWN_DEPARTMENT)
  getTitles(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Query('q') q?: string,
  ) {
    return this.libraryService.getTitles(profile, q);
  }

  @Post('titles')
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  createTitle(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: CreateTextbookTitleDto,
  ) {
    return this.libraryService.createTitle(profile, dto);
  }

  @Get('copies')
  @HasPermissions(PERMISSIONS.INVENTORY.VIEW_OWN_DEPARTMENT)
  getCopies(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Query('q') q?: string,
    @Query('titleId') titleId?: string,
    @Query('roomId') roomId?: string,
    @Query('status') status?: string,
  ) {
    return this.libraryService.getCopies(profile, { q, titleId, roomId, status });
  }

  @Post('copies/receive')
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  receiveCopies(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: ReceiveTextbookCopiesDto,
  ) {
    return this.libraryService.receiveCopies(profile, dto);
  }

  @Post('copies/assign')
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  assignCopy(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: AssignTextbookCopyDto,
  ) {
    return this.libraryService.assignCopy(profile, dto);
  }

  @Get('teachers')
  @HasPermissions(PERMISSIONS.INVENTORY.VIEW_OWN_DEPARTMENT)
  getDepartmentTeachers(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
  ) {
    return this.libraryService.getDepartmentTeachers(profile);
  }

  @Post('loans/issue')
  @HasPermissions(PERMISSIONS.INVENTORY.VIEW_OWN_DEPARTMENT)
  issueLoan(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: IssueTextbookLoanDto,
  ) {
    return this.libraryService.issueLoan(profile, dto);
  }

  @Post('loans/return')
  @HasPermissions(PERMISSIONS.INVENTORY.VIEW_OWN_DEPARTMENT)
  returnLoan(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: ReturnTextbookLoanDto,
  ) {
    return this.libraryService.returnLoan(profile, dto);
  }

  @Get('loans')
  @HasPermissions(PERMISSIONS.INVENTORY.VIEW_OWN_DEPARTMENT)
  getLoans(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Query('q') q?: string,
    @Query('studentNumber') studentNumber?: string,
    @Query('copyId') copyId?: string,
    @Query('status') status?: 'open' | 'returned',
  ) {
    return this.libraryService.getLoans(profile, {
      q,
      studentNumber,
      copyId,
      status,
    });
  }
}


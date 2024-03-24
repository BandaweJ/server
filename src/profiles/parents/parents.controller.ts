import { ParentsService } from './parents.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateParentsDto } from '../dtos/createParents.dto';

import { UpdateParentDto } from '../dtos/updateParent.dto';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from '../entities/teachers.entity';
import { StudentsEntity } from '../entities/students.entity';
import { ParentsEntity } from '../entities/parents.entity';

@Controller('parents')
@UseGuards(AuthGuard())
export class ParentsController {
  constructor(private parentsService: ParentsService) {}

  @Get()
  getAllParents(
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.parentsService.getAllParents(profile);
  }

  @Get(':email')
  getParent(
    @Param('email') email: string,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.parentsService.getParent(email, profile);
  }

  @Post()
  createParent(
    @Body() createParentDto: CreateParentsDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.parentsService.createParent(createParentDto, profile);
  }

  @Patch(':email')
  updateParent(
    @Param('email') email: string,
    @Body() updateParentDto: UpdateParentDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.parentsService.updateParent(email, updateParentDto, profile);
  }

  @Delete(':email')
  deleteParent(
    @Param('email') email: string,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.parentsService.deleteParent(email, profile);
  }
}

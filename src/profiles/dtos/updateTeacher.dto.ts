import { CreateTeacherDto } from './createTeachers.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateTeacherDto extends PartialType(CreateTeacherDto) {}

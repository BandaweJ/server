import { PartialType } from '@nestjs/swagger';
import { CreateStudentDto } from './createStudents.dto';

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

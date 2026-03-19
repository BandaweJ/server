import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssignTextbookCopyDto {
  @IsString()
  @IsNotEmpty()
  copyId: string;

  @IsString()
  @IsOptional()
  assignedTeacherId?: string | null;
}
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssignTextbookCopyDto {
  @IsString()
  @IsNotEmpty()
  copyId: string;

  @IsString()
  @IsOptional()
  assignedTeacherId?: string | null;
}
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssignTextbookCopyDto {
  @IsString()
  @IsNotEmpty()
  copyId: string;

  @IsString()
  @IsOptional()
  assignedTeacherId?: string | null;
}


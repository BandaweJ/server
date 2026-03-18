import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class ReceiveTextbookCopiesDto {
  @IsString()
  @IsNotEmpty()
  titleId: string;

  @IsString()
  @IsOptional()
  roomId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  copiesCount: number;

  @IsString()
  @IsOptional()
  assignedTeacherId?: string | null;
}


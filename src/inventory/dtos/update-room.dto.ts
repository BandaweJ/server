import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoomDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  code?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  isActive?: boolean;
}


import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTextbookTitleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  author?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  edition?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  isbn?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  publisher?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  subject?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string | null;
}


import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateInventoryItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(160)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  category?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  unit?: string | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  reorderLevel?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  isActive?: boolean;
}


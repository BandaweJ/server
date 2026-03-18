import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  category?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  unit?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  quantityOnHand?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  reorderLevel?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string | null;
}


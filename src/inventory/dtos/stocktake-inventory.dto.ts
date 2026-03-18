import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class StocktakeInventoryDto {
  @IsInt()
  @Min(0)
  quantityOnHand: number;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  reference?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string | null;
}


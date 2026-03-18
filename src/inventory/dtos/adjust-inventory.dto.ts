import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { InventoryAdjustmentReason } from '../models/inventory-adjustment-reason.enum';

export class AdjustInventoryDto {
  @IsInt()
  delta: number;

  @IsEnum(InventoryAdjustmentReason)
  reason: InventoryAdjustmentReason;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  reference?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string | null;
}


import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkCreateInventoryItemRowDto {
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

export class BulkCreateInventoryItemsDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkCreateInventoryItemRowDto)
  items: BulkCreateInventoryItemRowDto[];
}


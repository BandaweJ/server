import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IncidentType } from '../models/incident-type.enum';

export class CreateIncidentDto {
  @IsEnum(IncidentType)
  type: IncidentType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  replacementCost: number;

  @IsString()
  @IsOptional()
  studentNumber?: string | null;

  @IsString()
  @IsOptional()
  roomId?: string | null;

  @IsString()
  @IsOptional()
  textbookCopyId?: string | null;

  @IsString()
  @IsOptional()
  inventoryItemId?: string | null;
}


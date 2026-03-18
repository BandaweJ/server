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

export class ReceiveRequisitionLineDto {
  @IsString()
  @IsNotEmpty()
  requisitionItemId: string;

  @IsInt()
  @Min(1)
  quantityReceived: number;
}

export class ReceiveRequisitionDto {
  @IsString()
  @IsNotEmpty()
  requisitionId: string;

  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveRequisitionLineDto)
  lines: ReceiveRequisitionLineDto[];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string | null;
}


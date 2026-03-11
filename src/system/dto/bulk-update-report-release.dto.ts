import {
  IsArray,
  IsNotEmpty,
  ValidateNested,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkUpdateReportReleaseDto {
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateItemDto)
  updates: BulkUpdateItemDto[];
}

export class BulkUpdateItemDto {
  @IsNotEmpty()
  id: string;

  @IsNotEmpty()
  isReleased: boolean;

  @IsOptional()
  releaseNotes?: string;

  @IsOptional()
  sendNotification?: boolean = true;
}

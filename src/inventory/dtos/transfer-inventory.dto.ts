import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class TransferInventoryDto {
  @IsString()
  @IsNotEmpty()
  fromItemId: string;

  @IsString()
  @IsNotEmpty()
  toRoomId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  reference?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string | null;
}


import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectIncidentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}


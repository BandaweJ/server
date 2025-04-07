/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';

export class CreateBalancesDto {
  @ApiProperty()
  amount: number;

  @ApiProperty()
  studentNumber: string;
}

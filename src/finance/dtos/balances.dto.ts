/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';

export class createBalancesDto {
  @ApiProperty()
  amount: number;

  @ApiProperty()
  descriptiom?: string;

  @ApiProperty()
  studentNumber: string;
}

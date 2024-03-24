import { OmitType } from '@nestjs/swagger';
import { AccountsDto } from './signup.dto';

// export class SignupResponse extends OmitType(AccountsDto, [
//   'password',
// ] as const) {}

export class SignupResponse {
  response: boolean;
}

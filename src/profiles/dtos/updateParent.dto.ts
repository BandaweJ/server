import { CreateParentsDto } from '../dtos/createParents.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateParentDto extends PartialType(CreateParentsDto) {}

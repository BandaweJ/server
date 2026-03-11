import { PartialType } from '@nestjs/mapped-types';
import { CreateReportReleaseDto } from './create-report-release.dto';

export class UpdateReportReleaseDto extends PartialType(
  CreateReportReleaseDto,
) {}

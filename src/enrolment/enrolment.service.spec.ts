import { Test, TestingModule } from '@nestjs/testing';
import { EnrolmentService } from './enrolment.service';

describe('EnrolmentService', () => {
  let service: EnrolmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EnrolmentService],
    }).compile();

    service = module.get<EnrolmentService>(EnrolmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

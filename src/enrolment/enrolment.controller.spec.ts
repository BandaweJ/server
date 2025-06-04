import { Test, TestingModule } from '@nestjs/testing';
import { EnrolmentController } from './enrolment.controller';

describe('EnrolmentController', () => {
  let controller: EnrolmentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EnrolmentController],
    }).compile();

    controller = module.get<EnrolmentController>(EnrolmentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

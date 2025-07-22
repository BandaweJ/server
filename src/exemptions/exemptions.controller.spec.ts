import { Test, TestingModule } from '@nestjs/testing';
import { ExemptionsController } from './exemptions.controller';

describe('ExemptionsController', () => {
  let controller: ExemptionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExemptionsController],
    }).compile();

    controller = module.get<ExemptionsController>(ExemptionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

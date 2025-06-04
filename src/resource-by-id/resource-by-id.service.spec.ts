import { Test, TestingModule } from '@nestjs/testing';
import { ResourceByIdService } from './resource-by-id.service';

describe('ResourceByIdService', () => {
  let service: ResourceByIdService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResourceByIdService],
    }).compile();

    service = module.get<ResourceByIdService>(ResourceByIdService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

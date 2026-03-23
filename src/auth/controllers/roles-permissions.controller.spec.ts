import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RolesPermissionsController } from './roles-permissions.controller';
import { RolesPermissionsService } from '../services/roles-permissions.service';
import { ROLES } from '../models/roles.enum';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

describe('RolesPermissionsController', () => {
  let controller: RolesPermissionsController;
  const serviceMock = {
    getUserPermissions: jest.fn(),
    hasPermission: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = Test.createTestingModule({
      controllers: [RolesPermissionsController],
      providers: [
        { provide: RolesPermissionsService, useValue: serviceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true });

    const module: TestingModule = await moduleRef.compile();

    controller = module.get<RolesPermissionsController>(RolesPermissionsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('allows users to read their own permissions', async () => {
    serviceMock.getUserPermissions.mockResolvedValue(['finance.view']);
    const result = await controller.getUserPermissions('ACC01', {
      user: { accountId: 'ACC01', role: ROLES.teacher },
    });

    expect(result).toEqual({ permissions: ['finance.view'] });
    expect(serviceMock.getUserPermissions).toHaveBeenCalledWith('ACC01');
  });

  it('blocks non-privileged users from reading another account permissions', async () => {
    await expect(
      controller.getUserPermissions('ACC02', {
        user: { accountId: 'ACC01', role: ROLES.teacher },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows privileged users to read another account permissions', async () => {
    serviceMock.getUserPermissions.mockResolvedValue(['users.manage.roles']);
    const result = await controller.getUserPermissions('ACC02', {
      user: { accountId: 'ADMIN01', role: ROLES.admin },
    });

    expect(result).toEqual({ permissions: ['users.manage.roles'] });
    expect(serviceMock.getUserPermissions).toHaveBeenCalledWith('ACC02');
  });
});

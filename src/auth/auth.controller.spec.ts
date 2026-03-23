import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ForbiddenException } from '@nestjs/common';
import { ROLES } from './models/roles.enum';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

describe('AuthController', () => {
  let controller: AuthController;
  const authServiceMock = {
    fetchUserDetails: jest.fn(),
    setCustomPassword: jest.fn(),
    updateProfile: jest.fn(),
    getUserActivity: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true });

    const module: TestingModule = await moduleRef.compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('allows self access for getUserDetails', async () => {
    authServiceMock.fetchUserDetails.mockResolvedValue({ id: 'S01' });
    await controller.getUserDetails(
      'S01',
      'student',
      { user: { accountId: 'S01', role: ROLES.student } },
    );
    expect(authServiceMock.fetchUserDetails).toHaveBeenCalledWith('S01', 'student');
  });

  it('blocks non-privileged access to another account', async () => {
    expect(() =>
      controller.getUserDetails(
        'S01',
        'student',
        { user: { accountId: 'S02', role: ROLES.student } },
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows privileged role access to another account', async () => {
    authServiceMock.fetchUserDetails.mockResolvedValue({ id: 'S01' });
    await controller.getUserDetails(
      'S01',
      'student',
      { user: { accountId: 'ADMIN01', role: ROLES.admin } },
    );
    expect(authServiceMock.fetchUserDetails).toHaveBeenCalledWith('S01', 'student');
  });
});

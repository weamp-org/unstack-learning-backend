import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { TeachersController } from './teachers.controller.js';
import { TeachersService } from './teachers.service.js';

const mockTeachersService = {
  getMySubjects: jest.fn(),
  setMySubjects: jest.fn(),
};

describe('TeachersController', () => {
  let controller: TeachersController;
  let service: typeof mockTeachersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeachersController],
      providers: [{ provide: TeachersService, useValue: mockTeachersService }],
    })
      // Guards decorate the controller but never run on direct method calls;
      // stub them so the module resolves without their real dependencies.
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<TeachersController>(TeachersController);
    service = module.get(TeachersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getMySubjects delegates with the caller id', async () => {
    const rows = [{ teacherId: 't-1' }];
    service.getMySubjects.mockResolvedValue(rows);

    await expect(controller.getMySubjects('t-1')).resolves.toEqual(rows);
    expect(service.getMySubjects).toHaveBeenCalledWith('t-1');
  });

  it('getMySubjects throws without a caller id', () => {
    expect(() => controller.getMySubjects(null)).toThrow(UnauthorizedException);
    expect(service.getMySubjects).not.toHaveBeenCalled();
  });

  it('setMySubjects delegates with the caller id and IDs', async () => {
    const rows = [{ teacherId: 't-1' }];
    service.setMySubjects.mockResolvedValue(rows);

    await expect(
      controller.setMySubjects('t-1', { subjectIds: ['s-1'] }),
    ).resolves.toEqual(rows);
    expect(service.setMySubjects).toHaveBeenCalledWith('t-1', ['s-1']);
  });

  it('setMySubjects throws without a caller id', () => {
    expect(() => controller.setMySubjects(null, { subjectIds: [] })).toThrow(
      UnauthorizedException,
    );
    expect(service.setMySubjects).not.toHaveBeenCalled();
  });
});

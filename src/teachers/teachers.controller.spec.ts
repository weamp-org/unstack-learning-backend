import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { TeachersController } from './teachers.controller.js';
import { TeachersService } from './teachers.service.js';

const mockTeachersService = {
  getMySubjects: jest.fn(),
  setMySubjects: jest.fn(),
  getMyAvailability: jest.fn(),
  addMyAvailability: jest.fn(),
  removeMyAvailability: jest.fn(),
  getMyOverrides: jest.fn(),
  addMyOverride: jest.fn(),
  removeMyOverride: jest.fn(),
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

  it('getMyAvailability delegates with the caller id', async () => {
    const windows = [{ id: 'w-1' }];
    service.getMyAvailability.mockResolvedValue(windows);

    await expect(controller.getMyAvailability('t-1')).resolves.toEqual(windows);
    expect(service.getMyAvailability).toHaveBeenCalledWith('t-1');
  });

  it('getMyAvailability throws without a caller id', () => {
    expect(() => controller.getMyAvailability(null)).toThrow(
      UnauthorizedException,
    );
    expect(service.getMyAvailability).not.toHaveBeenCalled();
  });

  it('addMyAvailability delegates with the caller id and DTO', async () => {
    const dto = { weekday: 1, startTime: '14:00', endTime: '18:00' };
    const created = { id: 'w-1', teacherId: 't-1', ...dto };
    service.addMyAvailability.mockResolvedValue(created);

    await expect(controller.addMyAvailability('t-1', dto)).resolves.toEqual(
      created,
    );
    expect(service.addMyAvailability).toHaveBeenCalledWith('t-1', dto);
  });

  it('addMyAvailability throws without a caller id', () => {
    const dto = { weekday: 1, startTime: '14:00', endTime: '18:00' };
    expect(() => controller.addMyAvailability(null, dto)).toThrow(
      UnauthorizedException,
    );
    expect(service.addMyAvailability).not.toHaveBeenCalled();
  });

  it('removeMyAvailability delegates with the caller id and window id', async () => {
    const window = { id: 'w-1', teacherId: 't-1' };
    service.removeMyAvailability.mockResolvedValue(window);

    await expect(
      controller.removeMyAvailability('t-1', 'w-1'),
    ).resolves.toEqual(window);
    expect(service.removeMyAvailability).toHaveBeenCalledWith('t-1', 'w-1');
  });

  it('removeMyAvailability throws without a caller id', () => {
    expect(() => controller.removeMyAvailability(null, 'w-1')).toThrow(
      UnauthorizedException,
    );
    expect(service.removeMyAvailability).not.toHaveBeenCalled();
  });

  it('getMyOverrides delegates with the caller id', async () => {
    const rows = [{ id: 'o-1' }];
    service.getMyOverrides.mockResolvedValue(rows);

    await expect(controller.getMyOverrides('t-1')).resolves.toEqual(rows);
    expect(service.getMyOverrides).toHaveBeenCalledWith('t-1');
  });

  it('getMyOverrides throws without a caller id', () => {
    expect(() => controller.getMyOverrides(null)).toThrow(
      UnauthorizedException,
    );
    expect(service.getMyOverrides).not.toHaveBeenCalled();
  });

  it('addMyOverride delegates with the caller id and DTO', async () => {
    const dto = {
      date: '2099-01-01',
      startTime: '14:00',
      endTime: '18:00',
      kind: 'UNAVAILABLE' as const,
    };
    const created = { id: 'o-1', ...dto };
    service.addMyOverride.mockResolvedValue(created);

    await expect(controller.addMyOverride('t-1', dto)).resolves.toEqual(
      created,
    );
    expect(service.addMyOverride).toHaveBeenCalledWith('t-1', dto);
  });

  it('addMyOverride throws without a caller id', () => {
    const dto = {
      date: '2099-01-01',
      startTime: '14:00',
      endTime: '18:00',
      kind: 'UNAVAILABLE' as const,
    };
    expect(() => controller.addMyOverride(null, dto)).toThrow(
      UnauthorizedException,
    );
    expect(service.addMyOverride).not.toHaveBeenCalled();
  });

  it('removeMyOverride delegates with the caller id and override id', async () => {
    const override = { id: 'o-1', teacherId: 't-1' };
    service.removeMyOverride.mockResolvedValue(override);

    await expect(controller.removeMyOverride('t-1', 'o-1')).resolves.toEqual(
      override,
    );
    expect(service.removeMyOverride).toHaveBeenCalledWith('t-1', 'o-1');
  });

  it('removeMyOverride throws without a caller id', () => {
    expect(() => controller.removeMyOverride(null, 'o-1')).toThrow(
      UnauthorizedException,
    );
    expect(service.removeMyOverride).not.toHaveBeenCalled();
  });
});

import { Test, TestingModule } from '@nestjs/testing';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { AdminStatsController } from './admin-stats.controller.js';
import { AdminStatsService } from './admin-stats.service.js';

const mockAdminStatsService = {
  getStats: jest.fn(),
};

describe('AdminStatsController', () => {
  let controller: AdminStatsController;
  let service: typeof mockAdminStatsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminStatsController],
      providers: [
        { provide: AdminStatsService, useValue: mockAdminStatsService },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AdminStatsController>(AdminStatsController);
    service = module.get(AdminStatsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates to the stats service', async () => {
    const stats = { overview: { total: 1 } };
    service.getStats.mockResolvedValue(stats);

    await expect(controller.getStats()).resolves.toEqual(stats);
    expect(service.getStats).toHaveBeenCalledWith();
  });
});

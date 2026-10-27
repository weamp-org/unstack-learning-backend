import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

const mockNotificationsService = {
  listMine: jest.fn(),
  unreadCount: jest.fn(),
  markAllRead: jest.fn(),
  markRead: jest.fn(),
  clearMine: jest.fn(),
  dismiss: jest.fn(),
  escalateStaleRequests: jest.fn(),
};

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: typeof mockNotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    })
      // Guards decorate the controller but never run on direct method calls;
      // stub them so the module resolves without their real dependencies.
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get(NotificationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listMine delegates with the caller id', async () => {
    const rows = [{ id: 'n-1' }];
    service.listMine.mockResolvedValue(rows);

    await expect(controller.listMine('user-1', undefined)).resolves.toEqual(
      rows,
    );
    expect(service.listMine).toHaveBeenCalledWith('user-1', false);
  });

  it('listMine passes unreadOnly through', async () => {
    service.listMine.mockResolvedValue([]);

    await controller.listMine('user-1', 'true');
    expect(service.listMine).toHaveBeenCalledWith('user-1', true);
  });

  it('listMine throws without a caller id', () => {
    expect(() => controller.listMine(null, undefined)).toThrow(
      UnauthorizedException,
    );
    expect(service.listMine).not.toHaveBeenCalled();
  });

  it('unreadCount wraps the count', async () => {
    service.unreadCount.mockResolvedValue(2);

    await expect(controller.unreadCount('user-1')).resolves.toEqual({
      count: 2,
    });
    expect(service.unreadCount).toHaveBeenCalledWith('user-1');
  });

  it('unreadCount throws without a caller id', async () => {
    await expect(controller.unreadCount(null)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.unreadCount).not.toHaveBeenCalled();
  });

  it('markAllRead delegates with the caller id', async () => {
    service.markAllRead.mockResolvedValue({ count: 2 });

    await expect(controller.markAllRead('user-1')).resolves.toEqual({
      count: 2,
    });
    expect(service.markAllRead).toHaveBeenCalledWith('user-1');
  });

  it('markAllRead throws without a caller id', () => {
    expect(() => controller.markAllRead(null)).toThrow(UnauthorizedException);
    expect(service.markAllRead).not.toHaveBeenCalled();
  });

  it('markRead delegates with both ids', async () => {
    const row = { id: 'n-1' };
    service.markRead.mockResolvedValue(row);

    await expect(controller.markRead('user-1', 'n-1')).resolves.toEqual(row);
    expect(service.markRead).toHaveBeenCalledWith('user-1', 'n-1');
  });

  it('markRead throws without a caller id', () => {
    expect(() => controller.markRead(null, 'n-1')).toThrow(
      UnauthorizedException,
    );
    expect(service.markRead).not.toHaveBeenCalled();
  });

  it('clearMine defaults to read rows only', async () => {
    service.clearMine.mockResolvedValue({ count: 3 });

    await expect(controller.clearMine('user-1', undefined)).resolves.toEqual({
      count: 3,
    });
    expect(service.clearMine).toHaveBeenCalledWith('user-1', true);
  });

  it('clearMine clears everything only when asked', async () => {
    service.clearMine.mockResolvedValue({ count: 5 });

    await controller.clearMine('user-1', 'false');
    expect(service.clearMine).toHaveBeenCalledWith('user-1', false);
  });

  it('clearMine throws without a caller id', () => {
    expect(() => controller.clearMine(null, undefined)).toThrow(
      UnauthorizedException,
    );
    expect(service.clearMine).not.toHaveBeenCalled();
  });

  it('dismiss delegates with both ids', async () => {
    service.dismiss.mockResolvedValue({ id: 'n-1', dismissed: true });

    await expect(controller.dismiss('user-1', 'n-1')).resolves.toEqual({
      id: 'n-1',
      dismissed: true,
    });
    expect(service.dismiss).toHaveBeenCalledWith('user-1', 'n-1');
  });

  it('dismiss throws without a caller id', () => {
    expect(() => controller.dismiss(null, 'n-1')).toThrow(
      UnauthorizedException,
    );
    expect(service.dismiss).not.toHaveBeenCalled();
  });

  it('escalate delegates to the service', async () => {
    service.escalateStaleRequests.mockResolvedValue({ escalated: 1 });

    await expect(controller.escalate()).resolves.toEqual({ escalated: 1 });
    expect(service.escalateStaleRequests).toHaveBeenCalledWith();
  });
});

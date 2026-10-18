import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

const mockPushService = {
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  listMine: jest.fn(),
  sendTest: jest.fn(),
};

const dto = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

describe('PushController', () => {
  let controller: PushController;
  let service: typeof mockPushService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushController],
      providers: [{ provide: PushService, useValue: mockPushService }],
    })
      // Guards decorate the controller but never run on direct method calls;
      // stub them so the module resolves without their real dependencies.
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<PushController>(PushController);
    service = module.get(PushService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('subscribe registers the caller endpoint', async () => {
    const row = { id: 'ps-1', userId: 'user-1' };
    service.subscribe.mockResolvedValue(row);

    await expect(controller.subscribe('user-1', dto)).resolves.toEqual(row);
    expect(service.subscribe).toHaveBeenCalledWith('user-1', dto);
  });

  it('subscribe throws without a caller id', () => {
    expect(() => controller.subscribe(null, dto)).toThrow(
      UnauthorizedException,
    );
    expect(service.subscribe).not.toHaveBeenCalled();
  });

  it('unsubscribe removes the caller endpoint', async () => {
    service.unsubscribe.mockResolvedValue({ count: 1 });

    await expect(
      controller.unsubscribe('user-1', { endpoint: dto.endpoint }),
    ).resolves.toEqual({ count: 1 });
    expect(service.unsubscribe).toHaveBeenCalledWith('user-1', dto.endpoint);
  });

  it('unsubscribe throws without a caller id', () => {
    expect(() =>
      controller.unsubscribe(null, { endpoint: dto.endpoint }),
    ).toThrow(UnauthorizedException);
    expect(service.unsubscribe).not.toHaveBeenCalled();
  });

  it('listMine delegates with the caller id', async () => {
    const rows = [{ id: 'ps-1' }];
    service.listMine.mockResolvedValue(rows);

    await expect(controller.listMine('user-1')).resolves.toEqual(rows);
    expect(service.listMine).toHaveBeenCalledWith('user-1');
  });

  it('listMine throws without a caller id', () => {
    expect(() => controller.listMine(null)).toThrow(UnauthorizedException);
    expect(service.listMine).not.toHaveBeenCalled();
  });

  it('sendTest delegates with the caller id', async () => {
    service.sendTest.mockResolvedValue({ sent: 1, pruned: 0, failed: 0 });

    await expect(controller.sendTest('user-1')).resolves.toEqual({
      sent: 1,
      pruned: 0,
      failed: 0,
    });
    expect(service.sendTest).toHaveBeenCalledWith('user-1');
  });

  it('sendTest throws without a caller id', () => {
    expect(() => controller.sendTest(null)).toThrow(UnauthorizedException);
    expect(service.sendTest).not.toHaveBeenCalled();
  });
});

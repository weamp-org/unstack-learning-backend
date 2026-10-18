import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { HelpRequestsController } from './help-requests.controller.js';
import { HelpRequestsService } from './help-requests.service.js';

const mockHelpRequestsService = {
  create: jest.fn(),
  findMine: jest.fn(),
  findOneFor: jest.fn(),
  findQueue: jest.fn(),
  isAdmin: jest.fn(),
  acceptRequest: jest.fn(),
  declineRequest: jest.fn(),
  closeRequest: jest.fn(),
  updateRequest: jest.fn(),
  upsertFeedback: jest.fn(),
  getFeedback: jest.fn(),
  updateSession: jest.fn(),
};

describe('HelpRequestsController', () => {
  let controller: HelpRequestsController;
  let service: typeof mockHelpRequestsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HelpRequestsController],
      providers: [
        { provide: HelpRequestsService, useValue: mockHelpRequestsService },
      ],
    })
      // Guards decorate the controller but never run on direct method calls;
      // stub them so the module resolves without their real dependencies.
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<HelpRequestsController>(HelpRequestsController);
    service = module.get(HelpRequestsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates with the caller id and DTO', async () => {
    const dto = { subjectId: 's-1', topic: 'Help', details: 'Stuck' };
    const created = { id: 'r-1', ...dto };
    service.create.mockResolvedValue(created);

    await expect(controller.create('learner-1', dto)).resolves.toEqual(created);
    expect(service.create).toHaveBeenCalledWith('learner-1', dto);
  });

  it('create throws without a caller id', () => {
    const dto = { subjectId: 's-1', topic: 'Help', details: 'Stuck' };
    expect(() => controller.create(null, dto)).toThrow(UnauthorizedException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('findMine delegates with the caller id', async () => {
    const rows = [{ id: 'r-1' }];
    service.findMine.mockResolvedValue(rows);

    await expect(controller.findMine('learner-1')).resolves.toEqual(rows);
    expect(service.findMine).toHaveBeenCalledWith('learner-1');
  });

  it('findMine throws without a caller id', () => {
    expect(() => controller.findMine(null)).toThrow(UnauthorizedException);
    expect(service.findMine).not.toHaveBeenCalled();
  });

  it('findQueue delegates with the caller id', async () => {
    const rows = [{ id: 'r-1' }];
    service.findQueue.mockResolvedValue(rows);

    await expect(controller.findQueue('teacher-1')).resolves.toEqual(rows);
    expect(service.findQueue).toHaveBeenCalledWith('teacher-1');
  });

  it('findQueue throws without a caller id', () => {
    expect(() => controller.findQueue(null)).toThrow(UnauthorizedException);
    expect(service.findQueue).not.toHaveBeenCalled();
  });

  it('findOne delegates with the caller id and request id', async () => {
    const row = { id: 'r-1' };
    service.findOneFor.mockResolvedValue(row);

    await expect(controller.findOne('learner-1', 'r-1')).resolves.toEqual(row);
    expect(service.findOneFor).toHaveBeenCalledWith('learner-1', 'r-1');
  });

  it('findOne throws without a caller id', () => {
    expect(() => controller.findOne(null, 'r-1')).toThrow(
      UnauthorizedException,
    );
    expect(service.findOneFor).not.toHaveBeenCalled();
  });

  it('accept resolves admin and delegates', async () => {
    const dto = { sessionUrl: 'https://meet.google.com/abc' };
    const accepted = { id: 'r-1', status: 'ACCEPTED' };
    service.isAdmin.mockResolvedValue(false);
    service.acceptRequest.mockResolvedValue(accepted);

    await expect(controller.accept('t-1', 'r-1', dto)).resolves.toEqual(
      accepted,
    );
    expect(service.isAdmin).toHaveBeenCalledWith('t-1');
    expect(service.acceptRequest).toHaveBeenCalledWith(
      't-1',
      false,
      'r-1',
      dto,
    );
  });

  it('accept throws without a caller id', async () => {
    await expect(controller.accept(null, 'r-1', {})).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.acceptRequest).not.toHaveBeenCalled();
  });

  it('decline resolves admin and delegates', async () => {
    service.isAdmin.mockResolvedValue(true);
    service.declineRequest.mockResolvedValue({ id: 'r-1', declined: true });

    await expect(controller.decline('admin-1', 'r-1')).resolves.toEqual({
      id: 'r-1',
      declined: true,
    });
    expect(service.declineRequest).toHaveBeenCalledWith('admin-1', true, 'r-1');
  });

  it('decline throws without a caller id', async () => {
    await expect(controller.decline(null, 'r-1')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.declineRequest).not.toHaveBeenCalled();
  });

  it('close resolves admin and delegates', async () => {
    const closed = { id: 'r-1', status: 'CLOSED' };
    service.isAdmin.mockResolvedValue(false);
    service.closeRequest.mockResolvedValue(closed);

    await expect(controller.close('learner-1', 'r-1')).resolves.toEqual(closed);
    expect(service.closeRequest).toHaveBeenCalledWith(
      'learner-1',
      false,
      'r-1',
    );
  });

  it('close throws without a caller id', async () => {
    await expect(controller.close(null, 'r-1')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.closeRequest).not.toHaveBeenCalled();
  });

  it('updateSession resolves admin and delegates', async () => {
    const dto = { sessionUrl: 'https://meet.google.com/abc' };
    const updated = { id: 'r-1' };
    service.isAdmin.mockResolvedValue(false);
    service.updateSession.mockResolvedValue(updated);

    await expect(controller.updateSession('t-1', 'r-1', dto)).resolves.toEqual(
      updated,
    );
    expect(service.isAdmin).toHaveBeenCalledWith('t-1');
    expect(service.updateSession).toHaveBeenCalledWith(
      't-1',
      false,
      'r-1',
      dto,
    );
  });

  it('updateSession throws without a caller id', async () => {
    await expect(controller.updateSession(null, 'r-1', {})).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.updateSession).not.toHaveBeenCalled();
  });

  it('update delegates with the caller id and DTO', async () => {
    const dto = { topic: 'New topic' };
    const updated = { id: 'r-1', ...dto };
    service.updateRequest.mockResolvedValue(updated);

    await expect(controller.update('learner-1', 'r-1', dto)).resolves.toEqual(
      updated,
    );
    expect(service.updateRequest).toHaveBeenCalledWith('learner-1', 'r-1', dto);
  });

  it('update throws without a caller id', () => {
    expect(() => controller.update(null, 'r-1', { topic: 'x' })).toThrow(
      UnauthorizedException,
    );
    expect(service.updateRequest).not.toHaveBeenCalled();
  });

  it('giveFeedback delegates with the caller id and DTO', async () => {
    const dto = { rating: 5 };
    const saved = { id: 'f-1', ...dto };
    service.upsertFeedback.mockResolvedValue(saved);

    await expect(
      controller.giveFeedback('learner-1', 'r-1', dto),
    ).resolves.toEqual(saved);
    expect(service.upsertFeedback).toHaveBeenCalledWith(
      'learner-1',
      'r-1',
      dto,
    );
  });

  it('getFeedback resolves admin and delegates', async () => {
    const saved = { id: 'f-1', rating: 5 };
    service.isAdmin.mockResolvedValue(false);
    service.getFeedback.mockResolvedValue(saved);

    await expect(controller.getFeedback('teacher-1', 'r-1')).resolves.toEqual(
      saved,
    );
    expect(service.getFeedback).toHaveBeenCalledWith('teacher-1', false, 'r-1');
  });
});

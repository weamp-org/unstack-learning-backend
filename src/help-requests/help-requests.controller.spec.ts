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
});

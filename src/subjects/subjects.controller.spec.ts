import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { SubjectsController } from './subjects.controller.js';
import { SubjectsService } from './subjects.service.js';

const mockSubjectsService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('SubjectsController', () => {
  let controller: SubjectsController;
  let service: typeof mockSubjectsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubjectsController],
      providers: [{ provide: SubjectsService, useValue: mockSubjectsService }],
    })
      // Guards decorate the controller but never run on direct method calls;
      // stub them so the module resolves without their real dependencies.
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<SubjectsController>(SubjectsController);
    service = module.get(SubjectsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to the service', async () => {
    const dto = { name: 'Mathematics' };
    const created = { id: '1', ...dto, slug: 'mathematics' };
    service.create.mockResolvedValue(created);

    await expect(controller.create(dto)).resolves.toEqual(created);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('findAll passes the flag and caller through to the service', async () => {
    const subjects = [{ id: '1', name: 'Mathematics' }];
    service.findAll.mockResolvedValue(subjects);

    // req.auth is a function once clerkMiddleware() ran.
    const request = {
      auth: () => ({ userId: 'admin-1' }),
    } as unknown as Request;
    await expect(controller.findAll('true', request)).resolves.toEqual(
      subjects,
    );
    expect(service.findAll).toHaveBeenCalledWith({
      includeInactive: true,
      clerkId: 'admin-1',
    });
  });

  it('findAll treats missing auth as anonymous', async () => {
    service.findAll.mockResolvedValue([]);

    await expect(controller.findAll(undefined, {} as Request)).resolves.toEqual(
      [],
    );
    expect(service.findAll).toHaveBeenCalledWith({
      includeInactive: false,
      clerkId: null,
    });
  });

  it('findOne delegates to the service', async () => {
    const subject = { id: '1', name: 'Mathematics' };
    service.findOne.mockResolvedValue(subject);

    await expect(controller.findOne('1')).resolves.toEqual(subject);
    expect(service.findOne).toHaveBeenCalledWith('1');
  });

  it('update delegates to the service', async () => {
    const dto = { name: 'Maths' };
    const updated = { id: '1', ...dto };
    service.update.mockResolvedValue(updated);

    await expect(controller.update('1', dto)).resolves.toEqual(updated);
    expect(service.update).toHaveBeenCalledWith('1', dto);
  });

  it('remove delegates to the service', async () => {
    const subject = { id: '1', name: 'Mathematics' };
    service.remove.mockResolvedValue(subject);

    await expect(controller.remove('1')).resolves.toEqual(subject);
    expect(service.remove).toHaveBeenCalledWith('1');
  });
});

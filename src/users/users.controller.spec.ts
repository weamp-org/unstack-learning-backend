import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateUserRoleDto } from './dtos/update-user-role.dto';
import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard';
import { RolesGuard } from '../roles/roles.guard';
import { UserRole } from '../generated/prisma/enums.js';

describe('UsersController', () => {
  let controller: UsersController;
  let service: {
    updateRole: jest.Mock;
    findMe: jest.Mock;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            updateRole: jest.fn(),
            findMe: jest.fn(),
          },
        },
      ],
    })
      // Guards are covered by their own specs; stub them out here so this
      // spec focuses on the controller logic.
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    service = module.get(UsersService);
    controller = module.get(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findMe', () => {
    it('delegates to service.findMe with the caller id', async () => {
      const user = { id: 'clerk_123', role: UserRole.STUDENT };
      service.findMe.mockResolvedValue(user);

      await expect(controller.findMe('clerk_123')).resolves.toBe(user);
      expect(service.findMe).toHaveBeenCalledWith('clerk_123');
    });

    it('throws UnauthorizedException without a caller id', () => {
      expect(() => controller.findMe(null)).toThrow(UnauthorizedException);
      expect(service.findMe).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('delegates to service.updateRole with id and role', async () => {
      const dto: UpdateUserRoleDto = { role: UserRole.TEACHER };
      service.updateRole.mockResolvedValue('result');

      const result = await controller.updateRole('clerk_123', dto, 'clerk_999');

      expect(service.updateRole).toHaveBeenCalledWith(
        'clerk_123',
        UserRole.TEACHER,
      );
      expect(result).toBe('result');
    });

    it('throws ForbiddenException when changing your own role', async () => {
      const dto: UpdateUserRoleDto = { role: UserRole.STUDENT };

      await expect(
        controller.updateRole('clerk_123', dto, 'clerk_123'),
      ).rejects.toThrow(ForbiddenException);
      expect(service.updateRole).not.toHaveBeenCalled();
    });
  });
});

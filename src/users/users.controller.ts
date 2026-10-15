import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { Roles } from '../roles/roles.decorator.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { UserClerkId } from '../user-clerk-id/user-clerk-id.decorator.js';
import { UpdateUserRoleDto } from './dtos/update-user-role.dto.js';
import { UsersService } from './users.service.js';

@UseGuards(ClerkAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.ADMIN)
  @Patch(':id/role')
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @UserClerkId() clerkId: string | null,
  ) {
    // Admins cannot change their own role: a self-demotion would leave no
    // admin able to restore access (roles are assigned only via this
    // endpoint or directly in the database).
    if (clerkId !== null && id === clerkId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    return this.usersService.updateRole(id, dto.role);
  }
}

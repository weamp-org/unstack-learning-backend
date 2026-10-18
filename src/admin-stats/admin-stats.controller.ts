import { Controller, Get, UseGuards } from '@nestjs/common';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { Roles } from '../roles/roles.decorator.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { AdminStatsService } from './admin-stats.service.js';

@UseGuards(ClerkAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly adminStatsService: AdminStatsService) {}

  @Get()
  getStats() {
    return this.adminStatsService.getStats();
  }
}

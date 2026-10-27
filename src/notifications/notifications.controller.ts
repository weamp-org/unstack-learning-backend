import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { Roles } from '../roles/roles.decorator.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { UserClerkId } from '../user-clerk-id/user-clerk-id.decorator.js';
import { NotificationsService } from './notifications.service.js';

@UseGuards(ClerkAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // Static routes before ':id/read' — Nest matches in declaration order.
  @Get('me')
  listMine(
    @UserClerkId() clerkId: string | null,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.listMine(clerkId, unreadOnly === 'true');
  }

  @Get('me/unread-count')
  async unreadCount(@UserClerkId() clerkId: string | null) {
    if (clerkId === null) throw new UnauthorizedException();
    const count = await this.notificationsService.unreadCount(clerkId);
    return { count };
  }

  @Patch('me/read-all')
  markAllRead(@UserClerkId() clerkId: string | null) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.markAllRead(clerkId);
  }

  /**
   * Empties the caller's inbox. `readOnly` defaults to true on the service:
   * clearing the rows already read is the common case, and a full wipe has to
   * be asked for explicitly.
   *
   * Declared before `:id` so "me" is never captured as an id.
   */
  @Delete()
  clearMine(
    @UserClerkId() clerkId: string | null,
    @Query('readOnly') readOnly?: string,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.clearMine(clerkId, readOnly !== 'false');
  }

  @Delete(':id')
  dismiss(@UserClerkId() clerkId: string | null, @Param('id') id: string) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.dismiss(clerkId, id);
  }

  @Patch(':id/read')
  markRead(@UserClerkId() clerkId: string | null, @Param('id') id: string) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.markRead(clerkId, id);
  }

  // Manual trigger for the stale-request fallback until a real cron exists.
  @Roles(UserRole.ADMIN)
  @Post('escalate')
  escalate() {
    return this.notificationsService.escalateStaleRequests();
  }
}

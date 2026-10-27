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
    @Query('archived') archived?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.listMine(clerkId, {
      archived: archived === 'true',
      unreadOnly: unreadOnly === 'true',
    });
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
   * Puts the caller's inbox away instead of destroying it: read rows by
   * default, everything when `readOnly=false`. Archived rows can be restored
   * or hard-deleted from the archive view.
   */
  @Patch('me/archive-all')
  archiveAll(
    @UserClerkId() clerkId: string | null,
    @Query('readOnly') readOnly?: string,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.archiveMine(clerkId, readOnly !== 'false');
  }

  /// Empties the archive. Declared before ':id' so "archive" is never
  /// captured as an id.
  @Delete('archive')
  deleteArchived(@UserClerkId() clerkId: string | null) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.deleteArchived(clerkId);
  }

  @Patch(':id/archive')
  archive(@UserClerkId() clerkId: string | null, @Param('id') id: string) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.archive(clerkId, id);
  }

  @Patch(':id/restore')
  restore(@UserClerkId() clerkId: string | null, @Param('id') id: string) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.restore(clerkId, id);
  }

  @Patch(':id/read')
  markRead(@UserClerkId() clerkId: string | null, @Param('id') id: string) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.markRead(clerkId, id);
  }

  /// Hard delete — the archive view's only destructive action.
  @Delete(':id')
  deleteOne(@UserClerkId() clerkId: string | null, @Param('id') id: string) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.notificationsService.deleteOne(clerkId, id);
  }

  // Manual trigger for the stale-request fallback until a real cron exists.
  @Roles(UserRole.ADMIN)
  @Post('escalate')
  escalate() {
    return this.notificationsService.escalateStaleRequests();
  }
}

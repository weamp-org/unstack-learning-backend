import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { UserClerkId } from '../user-clerk-id/user-clerk-id.decorator.js';
import {
  CreatePushSubscriptionDto,
  DeletePushSubscriptionDto,
} from './dtos/push-subscription.dto.js';
import { PushService } from './push.service.js';

@UseGuards(ClerkAuthGuard, RolesGuard)
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('subscriptions')
  subscribe(
    @UserClerkId() clerkId: string | null,
    @Body() dto: CreatePushSubscriptionDto,
  ) {
    // Recipient is always the caller: subscriptions can never be registered
    // for another user.
    if (clerkId === null) throw new UnauthorizedException();
    return this.pushService.subscribe(clerkId, dto);
  }

  @Delete('subscriptions')
  unsubscribe(
    @UserClerkId() clerkId: string | null,
    @Body() dto: DeletePushSubscriptionDto,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.pushService.unsubscribe(clerkId, dto.endpoint);
  }

  @Get('subscriptions/me')
  listMine(@UserClerkId() clerkId: string | null) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.pushService.listMine(clerkId);
  }

  @Post('test')
  sendTest(@UserClerkId() clerkId: string | null) {
    // Self-only: anyone signed in can verify their own device setup.
    if (clerkId === null) throw new UnauthorizedException();
    return this.pushService.sendTest(clerkId);
  }
}

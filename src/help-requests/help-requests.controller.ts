import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { Roles } from '../roles/roles.decorator.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { UserClerkId } from '../user-clerk-id/user-clerk-id.decorator.js';
import { AcceptHelpRequestDto } from './dtos/accept-help-request.dto.js';
import { CreateHelpRequestDto } from './dtos/create-help-request.dto.js';
import { UpdateHelpRequestDto } from './dtos/update-help-request.dto.js';
import { UpdateHelpSessionDto } from './dtos/update-help-session.dto.js';
import { UpsertFeedbackDto } from './dtos/upsert-feedback.dto.js';
import { HelpRequestsService } from './help-requests.service.js';

@UseGuards(ClerkAuthGuard, RolesGuard)
@Controller('requests')
export class HelpRequestsController {
  constructor(private readonly helpRequestsService: HelpRequestsService) {}

  @Post()
  create(
    @UserClerkId() clerkId: string | null,
    @Body() dto: CreateHelpRequestDto,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.helpRequestsService.create(clerkId, dto);
  }

  // Static routes before ':id' — Nest matches in declaration order, so
  // ':id' would swallow these if declared first.
  @Get('me')
  findMine(@UserClerkId() clerkId: string | null) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.helpRequestsService.findMine(clerkId);
  }

  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @Get('queue')
  findQueue(@UserClerkId() clerkId: string | null) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.helpRequestsService.findQueue(clerkId);
  }

  @Get(':id')
  findOne(@UserClerkId() clerkId: string | null, @Param('id') id: string) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.helpRequestsService.findOneFor(clerkId, id);
  }

  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @Patch(':id/accept')
  async accept(
    @UserClerkId() clerkId: string | null,
    @Param('id') id: string,
    @Body() dto: AcceptHelpRequestDto,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    const isAdmin = await this.helpRequestsService.isAdmin(clerkId);
    return this.helpRequestsService.acceptRequest(clerkId, isAdmin, id, dto);
  }

  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @Patch(':id/decline')
  async decline(
    @UserClerkId() clerkId: string | null,
    @Param('id') id: string,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    const isAdmin = await this.helpRequestsService.isAdmin(clerkId);
    return this.helpRequestsService.declineRequest(clerkId, isAdmin, id);
  }

  @Patch(':id/close')
  async close(@UserClerkId() clerkId: string | null, @Param('id') id: string) {
    if (clerkId === null) throw new UnauthorizedException();
    const isAdmin = await this.helpRequestsService.isAdmin(clerkId);
    return this.helpRequestsService.closeRequest(clerkId, isAdmin, id);
  }

  @Patch(':id')
  update(
    @UserClerkId() clerkId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateHelpRequestDto,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.helpRequestsService.updateRequest(clerkId, id, dto);
  }

  @Post(':id/feedback')
  giveFeedback(
    @UserClerkId() clerkId: string | null,
    @Param('id') id: string,
    @Body() dto: UpsertFeedbackDto,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.helpRequestsService.upsertFeedback(clerkId, id, dto);
  }

  @Get(':id/feedback')
  async getFeedback(
    @UserClerkId() clerkId: string | null,
    @Param('id') id: string,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    const isAdmin = await this.helpRequestsService.isAdmin(clerkId);
    return this.helpRequestsService.getFeedback(clerkId, isAdmin, id);
  }

  @Patch(':id/session')
  async updateSession(
    @UserClerkId() clerkId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateHelpSessionDto,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    const isAdmin = await this.helpRequestsService.isAdmin(clerkId);
    return this.helpRequestsService.updateSession(clerkId, isAdmin, id, dto);
  }
}

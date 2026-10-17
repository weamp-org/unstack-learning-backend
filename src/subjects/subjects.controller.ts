import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { Public } from '../public/public.decorator.js';
import { Roles } from '../roles/roles.decorator.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { CreateSubjectDto } from './dtos/create-subject.dto.js';
import { UpdateSubjectDto } from './dtos/update-subject.dto.js';
import { SubjectsService } from './subjects.service.js';

@UseGuards(ClerkAuthGuard, RolesGuard)
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(dto);
  }

  @Public()
  @Get()
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description:
      'Admins only: include deactivated subjects. Ignored for anyone else.',
  })
  findAll(
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() request: Request,
  ) {
    // req.auth is set by clerkMiddleware() in main.ts. It is absent in e2e
    // (and getAuth() would throw there), so read it defensively — callers
    // without it simply get the active-only list.
    const clerkId =
      (request as Request & { auth?: { userId?: string | null } }).auth
        ?.userId ?? null;
    return this.subjectsService.findAll({
      includeInactive: includeInactive === 'true',
      clerkId,
    });
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subjectsService.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.subjectsService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subjectsService.remove(id);
  }
}

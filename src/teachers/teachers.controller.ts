import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { Roles } from '../roles/roles.decorator.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { UserClerkId } from '../user-clerk-id/user-clerk-id.decorator.js';
import { CreateAvailabilityDto } from './dtos/create-availability.dto.js';
import { CreateAvailabilityOverrideDto } from './dtos/create-availability-override.dto.js';
import { SetTeacherSubjectsDto } from './dtos/set-teacher-subjects.dto.js';
import { TeachersService } from './teachers.service.js';

@UseGuards(ClerkAuthGuard, RolesGuard)
@Roles(UserRole.TEACHER, UserRole.ADMIN)
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get('me/subjects')
  getMySubjects(@UserClerkId() clerkId: string | null) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.teachersService.getMySubjects(clerkId);
  }

  @Put('me/subjects')
  setMySubjects(
    @UserClerkId() clerkId: string | null,
    @Body() dto: SetTeacherSubjectsDto,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.teachersService.setMySubjects(clerkId, dto.subjectIds);
  }

  @Get('me/availability')
  getMyAvailability(@UserClerkId() clerkId: string | null) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.teachersService.getMyAvailability(clerkId);
  }

  @Post('me/availability')
  addMyAvailability(
    @UserClerkId() clerkId: string | null,
    @Body() dto: CreateAvailabilityDto,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.teachersService.addMyAvailability(clerkId, dto);
  }

  @Delete('me/availability/:id')
  removeMyAvailability(
    @UserClerkId() clerkId: string | null,
    @Param('id') id: string,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.teachersService.removeMyAvailability(clerkId, id);
  }

  @Get('me/overrides')
  getMyOverrides(@UserClerkId() clerkId: string | null) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.teachersService.getMyOverrides(clerkId);
  }

  @Post('me/overrides')
  addMyOverride(
    @UserClerkId() clerkId: string | null,
    @Body() dto: CreateAvailabilityOverrideDto,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.teachersService.addMyOverride(clerkId, dto);
  }

  @Delete('me/overrides/:id')
  removeMyOverride(
    @UserClerkId() clerkId: string | null,
    @Param('id') id: string,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.teachersService.removeMyOverride(clerkId, id);
  }
}

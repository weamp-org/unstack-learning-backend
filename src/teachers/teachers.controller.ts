import {
  Body,
  Controller,
  Get,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { Roles } from '../roles/roles.decorator.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { UserClerkId } from '../user-clerk-id/user-clerk-id.decorator.js';
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
}

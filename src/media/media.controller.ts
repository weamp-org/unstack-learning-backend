import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClerkAuthGuard } from '../clerk-auth/clerk-auth.guard.js';
import { RolesGuard } from '../roles/roles.guard.js';
import { UserClerkId } from '../user-clerk-id/user-clerk-id.decorator.js';
import { CreateMediaUploadDto } from './dtos/create-media-upload.dto.js';
import { MediaService } from './media.service.js';

@ApiTags('media')
@UseGuards(ClerkAuthGuard, RolesGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('uploads')
  @ApiOperation({ summary: 'Reserve an upload and return a presigned PUT URL' })
  createUpload(
    @UserClerkId() clerkId: string | null,
    @Body() dto: CreateMediaUploadDto,
  ) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.mediaService.createUpload(clerkId, dto);
  }

  @Post('uploads/:id/complete')
  @ApiOperation({ summary: 'Verify an uploaded object and mark it usable' })
  complete(@UserClerkId() clerkId: string | null, @Param('id') id: string) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.mediaService.complete(clerkId, id);
  }

  @Delete('uploads/:id')
  @ApiOperation({ summary: 'Discard an upload that was never attached' })
  abandon(@UserClerkId() clerkId: string | null, @Param('id') id: string) {
    if (clerkId === null) throw new UnauthorizedException();
    return this.mediaService.abandon(clerkId, id);
  }
}

import { Module } from '@nestjs/common';

import { HelpRequestsController } from './help-requests.controller.js';
import { HelpRequestsService } from './help-requests.service.js';
import { MediaModule } from '../media/media.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [MediaModule, NotificationsModule],
  controllers: [HelpRequestsController],
  providers: [HelpRequestsService],
})
export class HelpRequestsModule {}

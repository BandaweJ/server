/* eslint-disable prettier/prettier */
import { Module, forwardRef } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { NotificationService } from './services/notification.service';
import { SystemModule } from '../system/system.module';

@Module({
  imports: [forwardRef(() => SystemModule)],
  providers: [EmailService, NotificationService],
  exports: [EmailService, NotificationService],
})
export class NotificationsModule {}


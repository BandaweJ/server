import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { ConversationEntity } from './entities/conversation.entity';
import { ConversationParticipantEntity } from './entities/conversation-participant.entity';
import { MessageEntity } from './entities/message.entity';
import { MessageAttachmentEntity } from './entities/message-attachment.entity';
import { MessageReadEntity } from './entities/message-read.entity';
import { MessagingService } from './services/messaging.service';
import { MessagingController } from './controllers/messaging.controller';
import { MessagingGateway } from './gateways/messaging.gateway';
import { AuthModule } from '../auth/auth.module';
import { EnrolmentModule } from '../enrolment/enrolment.module';
import { AccountsEntity } from '../auth/entities/accounts.entity';
import { EnrolEntity } from '../enrolment/entities/enrol.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationEntity,
      ConversationParticipantEntity,
      MessageEntity,
      MessageAttachmentEntity,
      MessageReadEntity,
      AccountsEntity,
      EnrolEntity,
    ]),
    AuthModule,
    EnrolmentModule,
    JwtModule,
    ConfigModule,
  ],
  providers: [MessagingService, MessagingGateway],
  controllers: [MessagingController],
  exports: [MessagingService, MessagingGateway],
})
export class MessagingModule {}


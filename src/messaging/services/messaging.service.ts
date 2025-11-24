import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, MoreThan } from 'typeorm';
import { ConversationEntity, ConversationType } from '../entities/conversation.entity';
import { ConversationParticipantEntity, ParticipantRole } from '../entities/conversation-participant.entity';
import { MessageEntity, MessageType } from '../entities/message.entity';
import { MessageReadEntity } from '../entities/message-read.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { ROLES } from 'src/auth/models/roles.enum';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';

export interface CreateConversationDto {
  type: ConversationType;
  name?: string;
  description?: string;
  participantIds: string[];
  classId?: number;
}

export interface CreateMessageDto {
  content: string;
  type?: MessageType;
  replyToId?: string;
}

export interface UpdateMessageDto {
  content: string;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepository: Repository<ConversationEntity>,
    @InjectRepository(ConversationParticipantEntity)
    private readonly participantRepository: Repository<ConversationParticipantEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepository: Repository<MessageEntity>,
    @InjectRepository(MessageReadEntity)
    private readonly messageReadRepository: Repository<MessageReadEntity>,
    @InjectRepository(AccountsEntity)
    private readonly accountsRepository: Repository<AccountsEntity>,
    @InjectRepository(EnrolEntity)
    private readonly enrolRepository: Repository<EnrolEntity>,
  ) {}

  async getUserConversations(userId: string): Promise<ConversationEntity[]> {
    const participants = await this.participantRepository.find({
      where: {
        userId,
        leftAt: null,
        isArchived: false,
      },
      relations: ['conversation', 'conversation.createdBy'],
      order: { conversation: { lastMessageAt: 'DESC' } },
    });

    return participants.map(p => p.conversation);
  }

  async getConversationById(conversationId: string, userId: string): Promise<ConversationEntity> {
    const participant = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId,
        leftAt: null,
      },
      relations: ['conversation', 'conversation.participants', 'conversation.participants.user'],
    });

    if (!participant) {
      throw new NotFoundException('Conversation not found or you are not a participant');
    }

    return participant.conversation;
  }

  async createConversation(
    createDto: CreateConversationDto,
    createdById: string,
  ): Promise<ConversationEntity> {
    const account = await this.accountsRepository.findOne({ where: { id: createdById } });
    if (!account) {
      throw new NotFoundException('User not found');
    }

    // Check permissions for school-wide messages
    if (createDto.type === ConversationType.SCHOOL_WIDE) {
      if (account.role !== ROLES.admin && account.role !== ROLES.director) {
        throw new ForbiddenException('Only admins and directors can create school-wide messages');
      }
    }

    // Validate participants
    const participantAccounts = await this.accountsRepository.find({
      where: { id: In(createDto.participantIds) },
    });

    if (participantAccounts.length !== createDto.participantIds.length) {
      throw new BadRequestException('Some participant IDs are invalid');
    }

    // Create conversation
    const conversation = this.conversationRepository.create({
      type: createDto.type,
      name: createDto.name,
      description: createDto.description,
      createdById,
      classId: createDto.classId,
    });

    const savedConversation = await this.conversationRepository.save(conversation);

    // Add creator as admin participant
    const creatorParticipant = this.participantRepository.create({
      conversationId: savedConversation.id,
      userId: createdById,
      role: ParticipantRole.ADMIN,
    });
    await this.participantRepository.save(creatorParticipant);

    // Add other participants
    const participants = createDto.participantIds
      .filter(id => id !== createdById)
      .map(userId =>
        this.participantRepository.create({
          conversationId: savedConversation.id,
          userId,
          role: ParticipantRole.MEMBER,
        }),
      );

    if (participants.length > 0) {
      await this.participantRepository.save(participants);
    }

    // If class-based, add all students and teachers in that class
    if (createDto.type === ConversationType.CLASS && createDto.classId) {
      await this.addClassParticipants(savedConversation.id, createDto.classId);
    }

    return this.getConversationById(savedConversation.id, createdById);
  }

  private async addClassParticipants(conversationId: string, classId: number): Promise<void> {
    // Get all enrolments for this class (current term)
    const enrolments = await this.enrolRepository.find({
      where: { name: classId.toString() }, // Assuming class name matches classId
      relations: ['student', 'student.account'],
    });

    const studentAccountIds = enrolments
      .map(e => e.student?.account?.id)
      .filter(id => id !== undefined);

    // Get teachers (for now, all teachers - you might want to filter by class assignment)
    const teachers = await this.accountsRepository.find({
      where: { role: In([ROLES.teacher, ROLES.hod]) },
    });

    const teacherIds = teachers.map(t => t.id);

    // Combine and add as participants
    const allParticipantIds = [...new Set([...studentAccountIds, ...teacherIds])];

    // Check existing participants to avoid duplicates
    const existing = await this.participantRepository.find({
      where: { conversationId },
    });
    const existingIds = new Set(existing.map(p => p.userId));

    const newParticipants = allParticipantIds
      .filter(id => !existingIds.has(id))
      .map(userId =>
        this.participantRepository.create({
          conversationId,
          userId,
          role: ParticipantRole.MEMBER,
        }),
      );

    if (newParticipants.length > 0) {
      await this.participantRepository.save(newParticipants);
    }
  }

  async createClassConversation(classId: number, createdById: string): Promise<ConversationEntity> {
    const account = await this.accountsRepository.findOne({ where: { id: createdById } });
    if (!account) {
      throw new NotFoundException('User not found');
    }

    // Only teachers, HOD, admin, director can create class conversations
    if (
      account.role !== ROLES.teacher &&
      account.role !== ROLES.hod &&
      account.role !== ROLES.admin &&
      account.role !== ROLES.director
    ) {
      throw new ForbiddenException('Only teachers and administrators can create class conversations');
    }

    // Check if conversation already exists for this class
    const existing = await this.conversationRepository.findOne({
      where: { classId, type: ConversationType.CLASS },
    });

    if (existing) {
      return this.getConversationById(existing.id, createdById);
    }

    // Get class name for conversation name
    const enrolments = await this.enrolRepository.find({
      where: { name: classId.toString() },
      take: 1,
    });

    const className = enrolments.length > 0 ? `Class ${enrolments[0].name}` : `Class ${classId}`;

    return this.createConversation(
      {
        type: ConversationType.CLASS,
        name: className,
        description: `Class conversation for ${className}`,
        participantIds: [createdById],
        classId,
      },
      createdById,
    );
  }

  async createSchoolWideConversation(createdById: string): Promise<ConversationEntity> {
    const account = await this.accountsRepository.findOne({ where: { id: createdById } });
    if (!account) {
      throw new NotFoundException('User not found');
    }

    if (account.role !== ROLES.admin && account.role !== ROLES.director) {
      throw new ForbiddenException('Only admins and directors can create school-wide messages');
    }

    // Check if school-wide conversation already exists
    const existing = await this.conversationRepository.findOne({
      where: { type: ConversationType.SCHOOL_WIDE },
    });

    if (existing) {
      return this.getConversationById(existing.id, createdById);
    }

    // Get all active accounts
    const allAccounts = await this.accountsRepository.find({
      where: { active: true },
    });

    const allUserIds = allAccounts.map(a => a.id);

    return this.createConversation(
      {
        type: ConversationType.SCHOOL_WIDE,
        name: 'School-Wide Announcements',
        description: 'All school members',
        participantIds: allUserIds,
      },
      createdById,
    );
  }

  async getMessages(
    conversationId: string,
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ messages: MessageEntity[]; total: number }> {
    // Verify user is participant
    await this.getConversationById(conversationId, userId);

    const [messages, total] = await this.messageRepository.findAndCount({
      where: {
        conversationId,
        deletedAt: null,
      },
      relations: ['sender', 'replyTo', 'attachments'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { messages: messages.reverse(), total };
  }

  async sendMessage(
    conversationId: string,
    createDto: CreateMessageDto,
    senderId: string,
  ): Promise<MessageEntity> {
    // Verify user is participant
    await this.getConversationById(conversationId, senderId);

    const message = this.messageRepository.create({
      conversationId,
      senderId,
      content: createDto.content,
      type: createDto.type || MessageType.TEXT,
      replyToId: createDto.replyToId,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Update conversation lastMessageAt
    await this.conversationRepository.update(conversationId, {
      lastMessageAt: new Date(),
    });

    return this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['sender', 'replyTo', 'attachments'],
    });
  }

  async updateMessage(
    messageId: string,
    updateDto: UpdateMessageDto,
    userId: string,
  ): Promise<MessageEntity> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['sender'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    message.content = updateDto.content;
    message.editedAt = new Date();

    return await this.messageRepository.save(message);
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['sender', 'conversation', 'conversation.createdBy'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const account = await this.accountsRepository.findOne({ where: { id: userId } });
    const isAdmin = account?.role === ROLES.admin || account?.role === ROLES.director;

    // Allow deletion if user is sender, admin, or conversation creator
    if (
      message.senderId !== userId &&
      !isAdmin &&
      message.conversation.createdById !== userId
    ) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    message.deletedAt = new Date();
    await this.messageRepository.save(message);
  }

  async markAsRead(messageId: string, userId: string): Promise<void> {
    const existing = await this.messageReadRepository.findOne({
      where: { messageId, userId },
    });

    if (!existing) {
      const read = this.messageReadRepository.create({
        messageId,
        userId,
      });
      await this.messageReadRepository.save(read);
    }

    // Update participant lastReadAt
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['conversation'],
    });

    if (message) {
      await this.participantRepository.update(
        { conversationId: message.conversationId, userId },
        { lastReadAt: new Date() },
      );
    }
  }

  async getUnreadCount(conversationId: string, userId: string): Promise<number> {
    const participant = await this.participantRepository.findOne({
      where: { conversationId, userId },
    });

    if (!participant) {
      return 0;
    }

    const lastReadAt = participant.lastReadAt || participant.joinedAt;

    const count = await this.messageRepository.count({
      where: {
        conversationId,
        senderId: Not(userId),
        deletedAt: null,
        ...(lastReadAt ? { createdAt: MoreThan(lastReadAt) } : {}),
      },
    });

    return count;
  }
}


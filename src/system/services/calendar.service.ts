import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CalendarEventEntity } from '../entities/calendar-event.entity';
import { EventNotificationEntity } from '../entities/event-notification.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';

export interface CreateCalendarEventDto {
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  allDay?: boolean;
  location?: string;
  color?: string;
  isPublic?: boolean;
}

export interface UpdateCalendarEventDto {
  title?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  allDay?: boolean;
  location?: string;
  color?: string;
  isPublic?: boolean;
}

export interface EventNotificationPreferenceDto {
  enabled: boolean;
  reminderMinutes: number[];
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    @InjectRepository(CalendarEventEntity)
    private readonly eventRepository: Repository<CalendarEventEntity>,
    @InjectRepository(EventNotificationEntity)
    private readonly notificationRepository: Repository<EventNotificationEntity>,
    @InjectRepository(AccountsEntity)
    private readonly accountsRepository: Repository<AccountsEntity>,
  ) {}

  async getAllEvents(startDate?: Date, endDate?: Date, userId?: string): Promise<CalendarEventEntity[]> {
    const queryBuilder = this.eventRepository.createQueryBuilder('event')
      .leftJoinAndSelect('event.createdBy', 'createdBy');

    // Filter by date range if provided
    if (startDate && endDate) {
      queryBuilder.where('event.startDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      queryBuilder.where('event.startDate >= :startDate', { startDate });
    }

    // If user is provided, check if they're admin
    let isAdmin = false;
    if (userId) {
      const account = await this.accountsRepository.findOne({ where: { id: userId } });
      isAdmin = account?.role === 'admin' || account?.role === 'director';
    }

    // If not admin, filter to show only public events or events they have notifications for
    if (userId && !isAdmin) {
      // Get events user has notifications for
      const userNotifications = await this.notificationRepository.find({
        where: { userId },
      });
      const userEventIds = userNotifications.map(n => n.eventId);
      
      if (userEventIds.length > 0) {
        queryBuilder.andWhere('(event.isPublic = true OR event.id IN (:...userEventIds))', {
          userEventIds,
        });
      } else {
        queryBuilder.andWhere('event.isPublic = true');
      }
    }

    queryBuilder.orderBy('event.startDate', 'ASC');

    return await queryBuilder.getMany();
  }

  async getEventById(id: string, userId?: string): Promise<CalendarEventEntity> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID "${id}" not found`);
    }

    // Check if user can view this event
    if (userId) {
      const account = await this.accountsRepository.findOne({ where: { id: userId } });
      const isAdmin = account?.role === 'admin' || account?.role === 'director';
      
      if (!isAdmin && !event.isPublic) {
        // Check if user has notification for this event
        const notification = await this.notificationRepository.findOne({
          where: { eventId: id, userId },
        });
        
        if (!notification) {
          throw new ForbiddenException('You do not have access to this event');
        }
      }
    }

    return event;
  }

  async createEvent(createDto: CreateCalendarEventDto, createdById: string): Promise<CalendarEventEntity> {
    // Verify the account exists
    const account = await this.accountsRepository.findOne({ where: { id: createdById } });
    if (!account) {
      throw new NotFoundException(`Account with ID "${createdById}" not found`);
    }

    const event = this.eventRepository.create({
      ...createDto,
      createdById,
      createdBy: account, // Set the relation object
      allDay: createDto.allDay ?? false,
      isPublic: createDto.isPublic ?? true,
      color: createDto.color || '#2196f3', // Default blue color
    });

    return await this.eventRepository.save(event);
  }

  async updateEvent(id: string, updateDto: UpdateCalendarEventDto, userId: string): Promise<CalendarEventEntity> {
    const event = await this.getEventById(id, userId);
    
    // Check if user is admin or the creator
    const account = await this.accountsRepository.findOne({ where: { id: userId } });
    const isAdmin = account?.role === 'admin' || account?.role === 'director';
    
    if (!isAdmin && event.createdById !== userId) {
      throw new ForbiddenException('Only admins or event creators can update events');
    }

    Object.assign(event, updateDto);
    return await this.eventRepository.save(event);
  }

  async deleteEvent(id: string, userId: string): Promise<void> {
    const event = await this.getEventById(id, userId);
    
    // Check if user is admin or the creator
    const account = await this.accountsRepository.findOne({ where: { id: userId } });
    const isAdmin = account?.role === 'admin' || account?.role === 'director';
    
    if (!isAdmin && event.createdById !== userId) {
      throw new ForbiddenException('Only admins or event creators can delete events');
    }

    await this.eventRepository.remove(event);
  }

  async setNotificationPreference(
    eventId: string,
    userId: string,
    preference: EventNotificationPreferenceDto,
  ): Promise<EventNotificationEntity> {
    // Verify event exists
    await this.getEventById(eventId, userId);

    let notification = await this.notificationRepository.findOne({
      where: { eventId, userId },
    });

    if (notification) {
      notification.enabled = preference.enabled;
      notification.reminderMinutes = preference.reminderMinutes;
    } else {
      notification = this.notificationRepository.create({
        eventId,
        userId,
        enabled: preference.enabled,
        reminderMinutes: preference.reminderMinutes,
      });
    }

    return await this.notificationRepository.save(notification);
  }

  async getNotificationPreference(eventId: string, userId: string): Promise<EventNotificationEntity | null> {
    return await this.notificationRepository.findOne({
      where: { eventId, userId },
    });
  }

  async getUserNotifications(userId: string): Promise<EventNotificationEntity[]> {
    return await this.notificationRepository.find({
      where: { userId, enabled: true },
      relations: ['event'],
    });
  }
}


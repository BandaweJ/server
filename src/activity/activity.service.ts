/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEntity } from './entities/activity.entity';

export interface ActivityLogData {
  userId: string;
  action: string;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityEntity)
    private activityRepository: Repository<ActivityEntity>,
  ) {}

  /**
   * Log a user activity
   */
  async logActivity(data: ActivityLogData): Promise<ActivityEntity> {
    const activity = this.activityRepository.create({
      userId: data.userId,
      action: data.action,
      description: data.description,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      metadata: data.metadata,
      timestamp: new Date(),
    });

    return await this.activityRepository.save(activity);
  }

  /**
   * Get activities for a specific user with pagination
   */
  async getUserActivities(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ activities: ActivityEntity[]; total: number; page: number; limit: number; totalPages: number }> {
    const [activities, total] = await this.activityRepository.findAndCount({
      where: { userId, active: true },
      order: { timestamp: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      activities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all system activities with pagination
   */
  async getSystemActivities(
    page: number = 1,
    limit: number = 20,
    filters?: {
      action?: string;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{ activities: ActivityEntity[]; total: number; page: number; limit: number; totalPages: number }> {
    const queryBuilder = this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.active = :active', { active: true })
      .orderBy('activity.timestamp', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    if (filters?.action) {
      queryBuilder.andWhere('activity.action = :action', { action: filters.action });
    }

    if (filters?.userId) {
      queryBuilder.andWhere('activity.userId = :userId', { userId: filters.userId });
    }

    if (filters?.startDate) {
      queryBuilder.andWhere('activity.timestamp >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      queryBuilder.andWhere('activity.timestamp <= :endDate', { endDate: filters.endDate });
    }

    const [activities, total] = await queryBuilder.getManyAndCount();

    return {
      activities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Delete/Archive old activities (for cleanup)
   */
  async archiveOldActivities(daysOld: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Use TypeORM QueryBuilder for proper date comparison
    const result = await this.activityRepository
      .createQueryBuilder()
      .update(ActivityEntity)
      .set({ active: false })
      .where('timestamp < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}



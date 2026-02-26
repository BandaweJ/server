import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not } from 'typeorm';
import { ReportReleaseSettings } from './entities/report-release-settings.entity';
import { CreateReportReleaseDto } from './dto/create-report-release.dto';
import { UpdateReportReleaseDto } from './dto/update-report-release.dto';
import { BulkUpdateReportReleaseDto } from './dto/bulk-update-report-release.dto';
import { AccountsEntity } from '../auth/entities/accounts.entity';
import { TermsEntity } from '../enrolment/entities/term.entity';

@Injectable()
export class ReportReleaseService {
  private readonly logger = new Logger(ReportReleaseService.name);

  constructor(
    @InjectRepository(ReportReleaseSettings)
    private reportReleaseRepository: Repository<ReportReleaseSettings>,
    @InjectRepository(TermsEntity)
    private termsRepository: Repository<TermsEntity>,
  ) {}

  async create(createDto: CreateReportReleaseDto, user?: AccountsEntity): Promise<ReportReleaseSettings> {
    this.logger.log(`Creating report release setting for term ${createDto.termNumber} ${createDto.termYear} ${createDto.examType}`);

    // Check if setting already exists
    const existing = await this.reportReleaseRepository.findOne({
      where: {
        termNumber: createDto.termNumber,
        termYear: createDto.termYear,
        examType: createDto.examType,
      },
    });

    if (existing) {
      throw new Error('Report release setting already exists for this exam session');
    }

    const reportRelease = this.reportReleaseRepository.create({
      ...createDto,
      releasedBy: user?.id,
      releasedByUser: user,
      releaseDate: createDto.isReleased ? new Date() : null,
    });

    const saved = await this.reportReleaseRepository.save(reportRelease);

    // Send notification if enabled and reports are released
    if (createDto.isReleased && createDto.sendNotification) {
      await this.sendReleaseNotification(saved);
    }

    return saved;
  }

  async findAll(): Promise<ReportReleaseSettings[]> {
    return this.reportReleaseRepository.find({
      relations: ['releasedByUser'],
      order: {
        termYear: 'DESC',
        termNumber: 'ASC',
        examType: 'ASC',
      },
    });
  }

  async findOne(id: string): Promise<ReportReleaseSettings> {
    const reportRelease = await this.reportReleaseRepository.findOne({
      where: { id },
      relations: ['releasedByUser'],
    });

    if (!reportRelease) {
      throw new NotFoundException(`Report release setting with ID ${id} not found`);
    }

    return reportRelease;
  }

  async findByExamSession(termNumber: number, termYear: number, examType: string): Promise<ReportReleaseSettings | null> {
    return this.reportReleaseRepository.findOne({
      where: {
        termNumber,
        termYear,
        examType: examType as 'Mid Term' | 'End Of Term',
      },
      relations: ['releasedByUser'],
    });
  }

  async update(id: string, updateDto: UpdateReportReleaseDto, user?: AccountsEntity): Promise<ReportReleaseSettings> {
    const reportRelease = await this.findOne(id);

    const wasReleased = reportRelease.isReleased;
    const willBeReleased = updateDto.isReleased ?? false;

    Object.assign(reportRelease, updateDto);

    // Set release date and user if being released
    if (!wasReleased && willBeReleased) {
      reportRelease.releaseDate = new Date();
      reportRelease.releasedBy = user?.id;
      reportRelease.releasedByUser = user;
    }

    const updated = await this.reportReleaseRepository.save(reportRelease);

    // Send notification if newly released and notifications are enabled
    if (!wasReleased && willBeReleased && updateDto.sendNotification !== false) {
      await this.sendReleaseNotification(updated);
    }

    return updated;
  }

  async bulkUpdate(bulkUpdateDto: BulkUpdateReportReleaseDto, user?: AccountsEntity): Promise<ReportReleaseSettings[]> {
    const results: ReportReleaseSettings[] = [];

    for (const update of bulkUpdateDto.updates) {
      try {
        const updated = await this.update(update.id, {
          isReleased: update.isReleased,
          releaseNotes: update.releaseNotes,
          sendNotification: update.sendNotification,
        }, user);
        results.push(updated);
      } catch (error) {
        this.logger.error(`Failed to update report release ${update.id}: ${error.message}`);
        // Continue with other updates even if one fails
      }
    }

    return results;
  }

  async remove(id: string): Promise<void> {
    const reportRelease = await this.findOne(id);
    await this.reportReleaseRepository.remove(reportRelease);
  }

  async checkReleaseStatus(termNumber: number, termYear: number, examType: string): Promise<boolean> {
    const setting = await this.findByExamSession(termNumber, termYear, examType);
    return setting ? setting.isAvailable() : false;
  }

  async getAvailableExamSessions(): Promise<ReportReleaseSettings[]> {
    return this.reportReleaseRepository.find({
      where: {
        isReleased: true,
      },
      relations: ['releasedByUser'],
      order: {
        termYear: 'DESC',
        termNumber: 'ASC',
        examType: 'ASC',
      },
    });
  }

  async getScheduledReleases(): Promise<ReportReleaseSettings[]> {
    const now = new Date();
    return this.reportReleaseRepository.find({
      where: {
        scheduledReleaseDate: Between(now, new Date(now.getTime() + 24 * 60 * 60 * 1000)), // Next 24 hours
        isReleased: false,
      },
      relations: ['releasedByUser'],
    });
  }

  async processScheduledReleases(): Promise<ReportReleaseSettings[]> {
    const now = new Date();
    const scheduled = await this.reportReleaseRepository.find({
      where: {
        scheduledReleaseDate: Not(null),
        isReleased: false,
      },
      relations: ['releasedByUser'],
    });

    const released: ReportReleaseSettings[] = [];

    for (const setting of scheduled) {
      if (setting.scheduledReleaseDate && setting.scheduledReleaseDate <= now) {
        setting.isReleased = true;
        setting.releaseDate = now;
        const updated = await this.reportReleaseRepository.save(setting);
        released.push(updated);

        if (setting.sendNotification) {
          await this.sendReleaseNotification(updated);
        }
      }
    }

    return released;
  }

  async generateExamSessionsFromTerms(): Promise<ReportReleaseSettings[]> {
    this.logger.log('Generating report release settings from existing terms in database');
    
    // Get all terms from the database
    const terms = await this.termsRepository.find({
      order: {
        year: 'DESC',
        num: 'ASC'
      }
    });

    if (!terms || terms.length === 0) {
      this.logger.warn('No terms found in database to generate report release settings');
      return [];
    }

    const createdSessions: ReportReleaseSettings[] = [];
    const examTypes: ('Mid Term' | 'End Of Term')[] = ['Mid Term', 'End Of Term'];

    for (const term of terms) {
      for (const examType of examTypes) {
        // Check if report release setting already exists for this term/exam type combination
        const existing = await this.reportReleaseRepository.findOne({
          where: {
            termNumber: term.num,
            termYear: term.year,
            examType
          }
        });

        if (!existing) {
          // Create new report release setting
          const reportRelease = this.reportReleaseRepository.create({
            termNumber: term.num,
            termYear: term.year,
            examType,
            isReleased: false,
            sendNotification: true,
          });

          const saved = await this.reportReleaseRepository.save(reportRelease);
          createdSessions.push(saved);
          
          this.logger.log(`Created report release setting for ${examType} Term ${term.num} ${term.year}`);
        }
      }
    }

    this.logger.log(`Generated ${createdSessions.length} new report release settings from ${terms.length} terms`);
    return createdSessions;
  }

  async generateExamSessions(year?: number): Promise<Partial<ReportReleaseSettings>[]> {
    this.logger.log(`Generating exam sessions for year ${year || 'current and next year'}`);
    
    // For backward compatibility, but prefer automatic generation from terms
    const currentYear = year || new Date().getFullYear();
    const sessions: Partial<ReportReleaseSettings>[] = [];

    // Generate for current year and next year
    for (let y = currentYear; y <= currentYear + 1; y++) {
      for (let term = 1; term <= 3; term++) {
        sessions.push(
          {
            termNumber: term,
            termYear: y,
            examType: 'Mid Term',
            isReleased: false,
            sendNotification: true,
          },
          {
            termNumber: term,
            termYear: y,
            examType: 'End Of Term',
            isReleased: false,
            sendNotification: true,
          }
        );
      }
    }

    this.logger.log(`Generated ${sessions.length} exam sessions for manual creation`);
    return sessions;
  }

  private async sendReleaseNotification(reportRelease: ReportReleaseSettings): Promise<void> {
    this.logger.log(`Sending release notification for term ${reportRelease.termNumber} ${reportRelease.termYear} ${reportRelease.examType}`);
    
    // TODO: Implement actual notification system
    // This could integrate with your existing notification system
    // to send emails, push notifications, or in-app notifications
    
    // For now, we'll just log it
    this.logger.log(`Notification sent: Reports for ${reportRelease.examType} Term ${reportRelease.termNumber} ${reportRelease.termYear} have been released`);
  }
}

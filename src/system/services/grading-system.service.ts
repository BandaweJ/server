/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradingSystemEntity } from '../entities/grading-system.entity';

export interface GradeThresholds {
  aStar: number;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
}

@Injectable()
export class GradingSystemService {
  private readonly logger = new Logger(GradingSystemService.name);

  constructor(
    @InjectRepository(GradingSystemEntity)
    private gradingSystemRepository: Repository<GradingSystemEntity>,
  ) {}

  /**
   * Get grading system for a specific level (O Level or A Level)
   */
  async getGradingSystem(level: string): Promise<GradingSystemEntity | null> {
    return await this.gradingSystemRepository.findOne({
      where: { level, active: true },
    });
  }

  /**
   * Get all grading systems
   */
  async getAllGradingSystems(): Promise<GradingSystemEntity[]> {
    return await this.gradingSystemRepository.find({
      where: { active: true },
      order: { level: 'ASC' },
    });
  }

  /**
   * Create or update grading system
   */
  async saveGradingSystem(
    level: string,
    gradeThresholds: GradeThresholds,
    failGrade: string,
  ): Promise<GradingSystemEntity> {
    const existing = await this.gradingSystemRepository.findOne({
      where: { level },
    });

    if (existing) {
      existing.gradeThresholds = gradeThresholds;
      existing.failGrade = failGrade;
      return await this.gradingSystemRepository.save(existing);
    } else {
      const newSystem = this.gradingSystemRepository.create({
        level,
        gradeThresholds,
        failGrade,
        active: true,
      });
      return await this.gradingSystemRepository.save(newSystem);
    }
  }

  /**
   * Compute grade based on mark and class level
   * This replaces the hardcoded computeGrade method
   */
  async computeGrade(mark: number, className: string): Promise<string> {
    const form = className.charAt(0);
    let level: string;

    // Determine level based on form number
    if (form === '5' || form === '6') {
      level = 'A Level';
    } else if (form === '1' || form === '2' || form === '3' || form === '4') {
      level = 'O Level';
    } else {
      // Default to O Level if form is unknown
      this.logger.warn(`Unknown form ${form} for class ${className}, defaulting to O Level`);
      level = 'O Level';
    }

    const gradingSystem = await this.getGradingSystem(level);

    // Fallback to hardcoded values if no grading system is configured
    if (!gradingSystem) {
      this.logger.warn(`No grading system found for ${level}, using default thresholds`);
      return this.computeGradeDefault(mark, level);
    }

    const thresholds = gradingSystem.gradeThresholds;

    if (mark >= thresholds.aStar) return 'A*';
    else if (mark >= thresholds.a) return 'A';
    else if (mark >= thresholds.b) return 'B';
    else if (mark >= thresholds.c) return 'C';
    else if (mark >= thresholds.d) return 'D';
    else if (mark >= thresholds.e) return 'E';
    else return gradingSystem.failGrade || (level === 'A Level' ? 'F' : 'U');
  }

  /**
   * Default grade computation (fallback to original hardcoded logic)
   */
  private computeGradeDefault(mark: number, level: string): string {
    if (level === 'A Level') {
      if (mark >= 90) return 'A*';
      else if (mark >= 75) return 'A';
      else if (mark >= 65) return 'B';
      else if (mark >= 50) return 'C';
      else if (mark >= 40) return 'D';
      else if (mark >= 35) return 'E';
      else return 'F';
    } else {
      // O Level
      if (mark >= 90) return 'A*';
      else if (mark >= 70) return 'A';
      else if (mark >= 60) return 'B';
      else if (mark >= 50) return 'C';
      else if (mark >= 40) return 'D';
      else if (mark >= 35) return 'E';
      else return 'U';
    }
  }

  /**
   * Initialize default grading systems if none exist
   */
  async initializeDefaultGradingSystems(): Promise<void> {
    const existing = await this.gradingSystemRepository.count();
    if (existing > 0) {
      return; // Already initialized
    }

    this.logger.log('Initializing default grading systems...');

    // A Level defaults
    await this.saveGradingSystem(
      'A Level',
      {
        aStar: 90,
        a: 75,
        b: 65,
        c: 50,
        d: 40,
        e: 35,
      },
      'F',
    );

    // O Level defaults
    await this.saveGradingSystem(
      'O Level',
      {
        aStar: 90,
        a: 70,
        b: 60,
        c: 50,
        d: 40,
        e: 35,
      },
      'U',
    );

    this.logger.log('Default grading systems initialized');
  }
}


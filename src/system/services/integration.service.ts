/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IntegrationEntity,
  IntegrationType,
  IntegrationStatus,
} from '../entities/integration.entity';

export interface CreateIntegrationDto {
  type: IntegrationType;
  name: string;
  description?: string;
  configuration?: Record<string, any>;
  isTestMode?: boolean;
}

export interface UpdateIntegrationDto {
  name?: string;
  description?: string;
  status?: IntegrationStatus;
  configuration?: Record<string, any>;
  isTestMode?: boolean;
}

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    @InjectRepository(IntegrationEntity)
    private integrationRepository: Repository<IntegrationEntity>,
  ) {}

  /**
   * Get all integrations
   */
  async getAllIntegrations(): Promise<IntegrationEntity[]> {
    return await this.integrationRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get integrations by type
   */
  async getIntegrationsByType(
    type: IntegrationType,
  ): Promise<IntegrationEntity[]> {
    return await this.integrationRepository.find({
      where: { type },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get active integrations by type
   */
  async getActiveIntegrationsByType(
    type: IntegrationType,
  ): Promise<IntegrationEntity[]> {
    return await this.integrationRepository.find({
      where: { type, status: IntegrationStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get integration by ID
   */
  async getIntegrationById(id: string): Promise<IntegrationEntity> {
    const integration = await this.integrationRepository.findOne({
      where: { id },
    });

    if (!integration) {
      throw new NotFoundException(`Integration with ID ${id} not found`);
    }

    return integration;
  }

  /**
   * Create a new integration
   */
  async createIntegration(
    createDto: CreateIntegrationDto,
  ): Promise<IntegrationEntity> {
    const integration = this.integrationRepository.create({
      ...createDto,
      status: IntegrationStatus.INACTIVE,
      configuration: createDto.configuration || {},
    });

    const saved = await this.integrationRepository.save(integration);
    this.logger.log(`Created integration: ${saved.name} (${saved.type})`);

    return saved;
  }

  /**
   * Update an integration
   */
  async updateIntegration(
    id: string,
    updateDto: UpdateIntegrationDto,
  ): Promise<IntegrationEntity> {
    const integration = await this.getIntegrationById(id);

    // Update fields
    if (updateDto.name !== undefined) {
      integration.name = updateDto.name;
    }
    if (updateDto.description !== undefined) {
      integration.description = updateDto.description;
    }
    if (updateDto.status !== undefined) {
      integration.status = updateDto.status;
    }
    if (updateDto.configuration !== undefined) {
      integration.configuration = {
        ...integration.configuration,
        ...updateDto.configuration,
      };
    }
    if (updateDto.isTestMode !== undefined) {
      integration.isTestMode = updateDto.isTestMode;
    }

    const saved = await this.integrationRepository.save(integration);
    this.logger.log(`Updated integration: ${saved.name} (${saved.type})`);

    return saved;
  }

  /**
   * Delete an integration
   */
  async deleteIntegration(id: string): Promise<void> {
    const integration = await this.getIntegrationById(id);
    await this.integrationRepository.remove(integration);
    this.logger.log(`Deleted integration: ${integration.name} (${integration.type})`);
  }

  /**
   * Test an integration connection
   */
  async testIntegration(id: string): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    const integration = await this.getIntegrationById(id);

    try {
      // Basic validation
      if (!integration.configuration) {
        return {
          success: false,
          message: 'Integration configuration is missing',
        };
      }

      // Type-specific testing would go here
      // For now, just validate configuration exists
      const hasRequiredConfig = this.validateConfiguration(
        integration.type,
        integration.configuration,
      );

      if (!hasRequiredConfig) {
        return {
          success: false,
          message: 'Required configuration fields are missing',
        };
      }

      // Update last sync time
      integration.lastSyncAt = new Date();
      integration.status = IntegrationStatus.ACTIVE;
      integration.lastError = null;
      integration.lastErrorAt = null;
      await this.integrationRepository.save(integration);

      return {
        success: true,
        message: 'Integration test successful',
      };
    } catch (error) {
      integration.status = IntegrationStatus.ERROR;
      integration.lastError = error instanceof Error ? error.message : String(error);
      integration.lastErrorAt = new Date();
      await this.integrationRepository.save(integration);

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Integration test failed',
        details: error,
      };
    }
  }

  /**
   * Validate configuration based on integration type
   */
  private validateConfiguration(
    type: IntegrationType,
    config: Record<string, any>,
  ): boolean {
    switch (type) {
      case IntegrationType.PAYMENT_GATEWAY:
        return !!(config.apiKey && (config.apiSecret || config.publicKey));
      case IntegrationType.SMS_SERVICE:
        return !!(config.apiKey && config.apiSecret);
      case IntegrationType.CLOUD_STORAGE:
        return !!(config.accessKey && config.secretKey);
      case IntegrationType.ACCOUNTING_SOFTWARE:
        return !!(config.apiKey && config.baseUrl);
      default:
        return true; // Other types may have flexible requirements
    }
  }

  /**
   * Get integration status summary
   */
  async getIntegrationStatusSummary(): Promise<{
    total: number;
    active: number;
    inactive: number;
    error: number;
    byType: Record<string, number>;
  }> {
    const integrations = await this.getAllIntegrations();

    const summary = {
      total: integrations.length,
      active: 0,
      inactive: 0,
      error: 0,
      byType: {} as Record<string, number>,
    };

    integrations.forEach((integration) => {
      if (integration.status === IntegrationStatus.ACTIVE) summary.active++;
      if (integration.status === IntegrationStatus.INACTIVE) summary.inactive++;
      if (integration.status === IntegrationStatus.ERROR) summary.error++;

      const typeKey = integration.type;
      summary.byType[typeKey] = (summary.byType[typeKey] || 0) + 1;
    });

    return summary;
  }
}


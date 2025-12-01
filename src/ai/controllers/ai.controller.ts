import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ROLES } from 'src/auth/models/roles.enum';
import { OpenAIService, CommentGenerationRequest, CommentGenerationResponse } from '../services/openai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AIController {
  constructor(private readonly openaiService: OpenAIService) {}

  @Post('generate-comments')
  @Roles(ROLES.teacher, ROLES.hod, ROLES.admin, ROLES.director)
  async generateComments(
    @Body() request: CommentGenerationRequest,
  ): Promise<CommentGenerationResponse> {
    // Validate the request
    if (typeof request.mark !== 'number' || request.mark < 0) {
      return {
        success: false,
        comments: [],
        error: 'Invalid mark provided',
      };
    }

    if (request.maxMark && (typeof request.maxMark !== 'number' || request.maxMark <= 0)) {
      return {
        success: false,
        comments: [],
        error: 'Invalid maximum mark provided',
      };
    }

    try {
      const result = await this.openaiService.generateComments(request);
      
      // If OpenAI fails, provide fallback comments
      if (!result.success) {
        const fallbackComments = this.openaiService.getFallbackComments(
          request.mark, 
          request.maxMark || 100
        );
        
        return {
          success: true,
          comments: fallbackComments,
          error: `OpenAI unavailable, using fallback comments: ${result.error}`,
        };
      }

      return result;
    } catch (error) {
      // Final fallback
      const fallbackComments = this.openaiService.getFallbackComments(
        request.mark, 
        request.maxMark || 100
      );
      
      return {
        success: true,
        comments: fallbackComments,
        error: 'Service error, using fallback comments',
      };
    }
  }
}



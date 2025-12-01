import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface CommentGenerationRequest {
  mark: number;
  maxMark?: number;
  subject?: string;
  studentLevel?: string; // e.g., "O Level", "A Level"
}

export interface CommentGenerationResponse {
  comments: string[];
  success: boolean;
  error?: string;
}

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    if (!apiKey) {
      this.logger.warn('OpenAI API key not found. Comment generation will be disabled.');
      return;
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  async generateComments(request: CommentGenerationRequest): Promise<CommentGenerationResponse> {
    if (!this.openai) {
      return {
        success: false,
        comments: [],
        error: 'OpenAI service not initialized. Please check API key configuration.',
      };
    }

    try {
      const percentage = request.maxMark ? (request.mark / request.maxMark) * 100 : request.mark;
      const performanceLevel = this.getPerformanceLevel(percentage);
      
      const prompt = this.buildPrompt(request, percentage, performanceLevel);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an experienced teacher writing constructive, encouraging comments for student report cards. Keep comments professional, specific, and appropriate for the academic level.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 200,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content;
      
      if (!response) {
        throw new Error('No response received from OpenAI');
      }

      // Parse the response to extract individual comments
      const comments = this.parseComments(response);

      this.logger.log(`Generated ${comments.length} comments for mark ${request.mark}/${request.maxMark || 100}`);

      return {
        success: true,
        comments: comments,
      };

    } catch (error) {
      this.logger.error('Failed to generate comments:', error);
      
      return {
        success: false,
        comments: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private buildPrompt(request: CommentGenerationRequest, percentage: number, performanceLevel: string): string {
    const subject = request.subject ? ` in ${request.subject}` : '';
    const level = request.studentLevel ? ` for ${request.studentLevel} students` : '';
    
    return `
Generate exactly 5 brief, constructive teacher comments for a student who scored ${request.mark}${request.maxMark ? `/${request.maxMark}` : ''} (${percentage.toFixed(1)}%)${subject}${level}.

Performance Level: ${performanceLevel}

Requirements:
- Each comment should be 3-8 words maximum
- Comments should be encouraging yet honest
- Vary the tone and focus (effort, improvement areas, strengths, next steps)
- Use appropriate academic language
- Format as a numbered list (1. 2. 3. 4. 5.)

Examples of good comments:
- "Excellent work, keep it up"
- "Shows good understanding, practice more"
- "Needs improvement in key concepts"
- "Great effort, aim higher next time"
- "Solid foundation, build on strengths"
    `.trim();
  }

  private getPerformanceLevel(percentage: number): string {
    if (percentage >= 80) return 'Excellent';
    if (percentage >= 70) return 'Good';
    if (percentage >= 60) return 'Satisfactory';
    if (percentage >= 50) return 'Fair';
    if (percentage >= 40) return 'Needs Improvement';
    return 'Requires Attention';
  }

  private parseComments(response: string): string[] {
    // Split by numbered list items and clean up
    const lines = response.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove numbering (1. 2. etc.) and clean up
        return line.replace(/^\d+\.\s*/, '').trim();
      })
      .filter(line => line.length > 0 && line.length <= 100); // Filter reasonable length comments

    // Return up to 5 comments
    return lines.slice(0, 5);
  }

  // Fallback method for when OpenAI is unavailable
  getFallbackComments(mark: number, maxMark: number = 100): string[] {
    const percentage = (mark / maxMark) * 100;
    
    if (percentage >= 80) {
      return [
        'Excellent work, keep it up',
        'Outstanding performance shown',
        'Superb effort and results',
        'Exceptional understanding demonstrated',
        'Continue this excellent standard'
      ];
    } else if (percentage >= 70) {
      return [
        'Good work, well done',
        'Shows solid understanding',
        'Pleasing effort and results',
        'Good grasp of concepts',
        'Keep up the good work'
      ];
    } else if (percentage >= 60) {
      return [
        'Satisfactory performance shown',
        'Fair attempt, keep improving',
        'Shows basic understanding',
        'Room for improvement exists',
        'Continue working steadily'
      ];
    } else if (percentage >= 50) {
      return [
        'Needs more focused effort',
        'Requires additional practice',
        'Basic concepts need strengthening',
        'Work harder to improve',
        'Seek help when needed'
      ];
    } else {
      return [
        'Significant improvement needed',
        'Requires intensive support',
        'Must work much harder',
        'Seek immediate assistance',
        'Focus on basic concepts'
      ];
    }
  }
}



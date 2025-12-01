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
            content: 'You are an experienced teacher writing brief, subject-specific, and encouraging comments for student report cards. Comments should be tailored to the subject, honest about performance, and provide specific guidance for improvement. Keep comments positive and motivating while being realistic about the student\'s current level.',
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
    const subjectName = request.subject || 'the subject';
    const subjectContext = request.subject ? ` in ${request.subject}` : '';
    const level = request.studentLevel ? ` for ${request.studentLevel} students` : '';
    
    // Determine guidance based on percentage
    let guidanceInstructions = '';
    if (percentage < 50) {
      guidanceInstructions = `For marks below 50%: Encourage the student to work hard, read more, focus on ${subjectName}, ask teachers for help, and consult with peers. Be supportive but emphasize the need for improvement and effort.`;
    } else if (percentage >= 50 && percentage < 60) {
      guidanceInstructions = `For marks between 50-60%: Encourage the student to push for more improvement. Acknowledge their current effort but motivate them to aim higher and work harder to reach better results in ${subjectName}.`;
    } else {
      guidanceInstructions = `For marks above 60%: Commend the student for their good work in ${subjectName} and encourage them to continue maintaining or improving their performance. Recognize their achievement while motivating them to keep up the good work.`;
    }

    return `
Generate exactly 5 brief, subject-specific, and encouraging teacher comments for a student who scored ${request.mark}${request.maxMark ? `/${request.maxMark}` : ''} (${percentage.toFixed(1)}%)${subjectContext}${level}.

Performance Level: ${performanceLevel}
${guidanceInstructions}

Requirements:
- Each comment must be exactly 5 words maximum
- Comments must be subject-specific (mention or reference "${subjectName}" where appropriate)
- Comments should be encouraging and motivating
- Provide specific, actionable guidance appropriate for the performance level
- Use clear, direct language that students can understand
- Format as a numbered list (1. 2. 3. 4. 5.)

Examples of good comments (5 words max):
- For low marks: "Read more ${subjectName}, ask questions"
- For low marks: "Focus on ${subjectName} basics, seek help"
- For 50-60: "Good progress ${subjectName}, push for more"
- For 50-60: "Keep working hard ${subjectName}, aim higher"
- For 60+: "Excellent ${subjectName} work, keep it up"
- For 60+: "Great effort ${subjectName}, continue improving"
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
      .filter(line => {
        // Filter out empty lines and validate word count (should be 5 words max as per prompt)
        if (line.length === 0 || line.length > 100) {
          return false;
        }
        // Count words - if more than 5, filter it out (AI should follow instructions)
        const wordCount = line.split(/\s+/).filter(word => word.length > 0).length;
        return wordCount <= 5;
      });

    // Return up to 5 comments
    return lines.slice(0, 5);
  }

  // Fallback method for when OpenAI is unavailable
  getFallbackComments(mark: number, maxMark: number = 100, subject?: string): string[] {
    const percentage = (mark / maxMark) * 100;
    const subjectRef = subject ? ` in ${subject}` : '';
    
    if (percentage >= 60) {
      return [
        `Excellent work${subjectRef}, keep it up`,
        `Great effort${subjectRef}, continue improving`,
        `Good progress${subjectRef}, maintain standard`,
        `Well done${subjectRef}, keep going`,
        `Outstanding work${subjectRef}, stay focused`
      ];
    } else if (percentage >= 50) {
      return [
        `Good progress${subjectRef}, push for more`,
        `Keep working hard${subjectRef}, aim higher`,
        `You can improve${subjectRef}, keep trying`,
        `Stay focused${subjectRef}, work harder`,
        `Good effort${subjectRef}, push yourself`
      ];
    } else {
      return [
        `Read more${subjectRef}, ask questions`,
        `Focus on basics${subjectRef}, seek help`,
        `Work harder${subjectRef}, consult teachers`,
        `Study more${subjectRef}, ask for help`,
        `Practice more${subjectRef}, stay focused`
      ];
    }
  }
}



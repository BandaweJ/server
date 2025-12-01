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
      let comments = this.parseComments(response);

      // If we have 3 or fewer comments after filtering, request more
      if (comments.length <= 3) {
        this.logger.log(`Only ${comments.length} valid comments after filtering. Requesting more comments...`);
        
        try {
          const additionalPrompt = this.buildAdditionalCommentsPrompt(request, percentage, performanceLevel, comments.length);
          
          const additionalCompletion = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are an experienced teacher writing brief, subject-specific, and encouraging comments for student report cards. Comments should be tailored to the subject, honest about performance, and provide specific guidance for improvement. Keep comments positive and motivating while being realistic about the student\'s current level.',
              },
              {
                role: 'user',
                content: additionalPrompt,
              },
            ],
            max_tokens: 200,
            temperature: 0.7,
          });

          const additionalResponse = additionalCompletion.choices[0]?.message?.content;
          
          if (additionalResponse) {
            const additionalComments = this.parseComments(additionalResponse);
            const beforeCount = comments.length;
            // Combine comments, avoiding duplicates and limiting to 5 total
            const combinedComments = [...comments];
            for (const comment of additionalComments) {
              if (combinedComments.length >= 5) break;
              // Avoid duplicates
              if (!combinedComments.some(c => c.toLowerCase() === comment.toLowerCase())) {
                combinedComments.push(comment);
              }
            }
            comments = combinedComments;
            this.logger.log(`Added ${comments.length - beforeCount} more comments. Total: ${comments.length}`);
          }
        } catch (error) {
          this.logger.warn('Failed to generate additional comments, using existing ones:', error);
          // Continue with the comments we have
        }
      }

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
- Comments must be subject-specific in their content and context, but do NOT need to include the subject name "${subjectName}" in the comment text
- Make comments clearly related to ${subjectName} through the guidance given (e.g., "Work hard in algebra" for Mathematics, "Practice reading comprehension" for English, "Study chemical reactions" for Chemistry)
- Comments should be encouraging and motivating
- Provide specific, actionable guidance appropriate for the performance level
- Use clear, direct language that students can understand
- Format as a numbered list (1. 2. 3. 4. 5.)

Examples of good subject-specific comments (5 words max) - note they don't mention the subject name but are clearly about the subject:
- For Mathematics (low marks): "Work hard in algebra, ask questions"
- For Mathematics (low marks): "Practice solving equations, seek help"
- For English (50-60): "Read more books, push yourself"
- For English (50-60): "Improve your writing, aim higher"
- For Science (60+): "Excellent lab work, keep it up"
- For Science (60+): "Great scientific thinking, continue improving"
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

  private buildAdditionalCommentsPrompt(
    request: CommentGenerationRequest,
    percentage: number,
    performanceLevel: string,
    existingCount: number
  ): string {
    const subjectName = request.subject || 'the subject';
    const subjectContext = request.subject ? ` in ${request.subject}` : '';
    const level = request.studentLevel ? ` for ${request.studentLevel} students` : '';
    const needed = 5 - existingCount;
    
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
Generate exactly ${needed} more brief, subject-specific, and encouraging teacher comments for a student who scored ${request.mark}${request.maxMark ? `/${request.maxMark}` : ''} (${percentage.toFixed(1)}%)${subjectContext}${level}.

We already have ${existingCount} comments, so generate ${needed} additional unique comments.

Performance Level: ${performanceLevel}
${guidanceInstructions}

Requirements:
- Each comment must be exactly 5 words maximum
- Comments must be subject-specific in their content and context, but do NOT need to include the subject name "${subjectName}" in the comment text
- Make comments clearly related to ${subjectName} through the guidance given (e.g., "Work hard in algebra" for Mathematics, "Practice reading comprehension" for English, "Study chemical reactions" for Chemistry)
- Comments should be encouraging and motivating
- Provide specific, actionable guidance appropriate for the performance level
- Use clear, direct language that students can understand
- Format as a numbered list (1. 2. 3. etc.)
- Make sure these comments are different from the ones already generated

Examples of good subject-specific comments (5 words max) - note they don't mention the subject name but are clearly about the subject:
- For Mathematics (low marks): "Work hard in algebra, ask questions"
- For Mathematics (low marks): "Practice solving equations, seek help"
- For English (50-60): "Read more books, push yourself"
- For English (50-60): "Improve your writing, aim higher"
- For Science (60+): "Excellent lab work, keep it up"
- For Science (60+): "Great scientific thinking, continue improving"
    `.trim();
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



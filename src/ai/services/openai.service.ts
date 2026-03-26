import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface CommentGenerationRequest {
  mark: number;
  maxMark?: number;
  subject?: string;
  studentLevel?: string; // e.g., "O Level", "A Level"
  studentName?: string;
  className?: string;
  examType?: string;
  tone?: 'encouraging' | 'balanced' | 'firm';
  average?: number;
  position?: number;
  classSize?: number;
}

export interface CommentGenerationResponse {
  comments: string[];
  success: boolean;
  error?: string;
  source?: 'openai' | 'fallback';
}

export interface RoleCommentContext {
  role: 'formTeacher' | 'headTeacher';
  studentName: string;
  className: string;
  examType?: string;
  termNumber?: number;
  termYear?: number;
  percentageAverage?: number;
  classPosition?: number;
  classSize?: number;
  subjectsPassed?: number;
  totalSubjects?: number;
  topSubjects: Array<{ subject: string; mark: number; grade?: string }>;
  weakSubjects: Array<{ subject: string; mark: number; grade?: string }>;
  subjectComments: Array<{ subject: string; comment: string }>;
}

export interface RoleCommentResponse {
  success: boolean;
  comment: string;
  error?: string;
  source?: 'openai' | 'fallback';
}

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private static readonly MAX_ROLE_COMMENT_CHARS = 220;
  private openai: OpenAI;
  private readonly bannedGenericPatterns = [
    /well done/i,
    /keep it up/i,
    /good work/i,
    /great effort/i,
    /excellent work/i,
    /outstanding work/i,
  ];

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'OpenAI API key not found. Comment generation will be disabled.',
      );
      return;
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  async generateComments(
    request: CommentGenerationRequest,
  ): Promise<CommentGenerationResponse> {
    if (!this.openai) {
      return {
        success: false,
        comments: [],
        error:
          'OpenAI service not initialized. Please check API key configuration.',
      };
    }

    try {
      const percentage = request.maxMark
        ? (request.mark / request.maxMark) * 100
        : request.mark;
      const performanceLevel = this.getPerformanceLevel(percentage);

      const prompt = this.buildPrompt(request, percentage, performanceLevel);
      const model =
        this.configService.get<string>('OPENAI_COMMENT_MODEL') || 'gpt-4o-mini';

      const completion = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an experienced teacher writing compact report-card comments. You must keep every comment to a maximum of 5 words while still being specific, actionable, and subject-aware.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 200,
        temperature: 0.9,
      });

      const response = completion.choices[0]?.message?.content;

      if (!response) {
        throw new Error('No response received from OpenAI');
      }

      // Parse the response to extract individual comments
      let comments = this.parseComments(response, request.subject);

      // If we have 3 or fewer comments after filtering, request more
      if (comments.length <= 3) {
        this.logger.log(
          `Only ${comments.length} valid comments after filtering. Requesting more comments...`,
        );

        try {
          const additionalPrompt = this.buildAdditionalCommentsPrompt(
            request,
            percentage,
            performanceLevel,
            comments.length,
          );

          const additionalCompletion =
            await this.openai.chat.completions.create({
              model,
              messages: [
                {
                  role: 'system',
                  content:
                    'You are an experienced teacher writing compact report-card comments. You must keep every comment to a maximum of 5 words while still being specific, actionable, and subject-aware.',
                },
                {
                  role: 'user',
                  content: additionalPrompt,
                },
              ],
              max_tokens: 200,
              temperature: 0.95,
            });

          const additionalResponse =
            additionalCompletion.choices[0]?.message?.content;

          if (additionalResponse) {
            const additionalComments = this.parseComments(
              additionalResponse,
              request.subject,
            );
            const beforeCount = comments.length;
            // Combine comments, avoiding duplicates and limiting to 5 total
            const combinedComments = [...comments];
            for (const comment of additionalComments) {
              if (combinedComments.length >= 5) break;
              // Avoid duplicates
              if (
                !combinedComments.some(
                  (c) => c.toLowerCase() === comment.toLowerCase(),
                )
              ) {
                combinedComments.push(comment);
              }
            }
            comments = combinedComments;
            this.logger.log(
              `Added ${comments.length - beforeCount} more comments. Total: ${
                comments.length
              }`,
            );
          }
        } catch (error) {
          this.logger.warn(
            'Failed to generate additional comments, using existing ones:',
            error,
          );
          // Continue with the comments we have
        }
      }

      if (comments.length < 5) {
        comments = this.fillMissingComments(
          comments,
          request,
          performanceLevel,
          percentage,
        );
      }

      this.logger.log(
        `Generated ${comments.length} comments for mark ${request.mark}/${
          request.maxMark || 100
        }`,
      );

      return {
        success: true,
        comments: comments,
        source: 'openai',
      };
    } catch (error) {
      this.logger.error('Failed to generate comments:', error);

      return {
        success: false,
        comments: [],
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
        source: 'fallback',
      };
    }
  }

  private buildPrompt(
    request: CommentGenerationRequest,
    percentage: number,
    performanceLevel: string,
  ): string {
    const subjectName = request.subject || 'the subject';
    const subjectContext = request.subject ? ` in ${request.subject}` : '';
    const level = request.studentLevel
      ? ` for ${request.studentLevel} students`
      : '';
    const studentContext = request.studentName
      ? ` Student name: ${request.studentName}.`
      : '';
    const classContext = request.className
      ? ` Class: ${request.className}.`
      : '';
    const examContext = request.examType
      ? ` Assessment type: ${request.examType}.`
      : '';
    const averageContext =
      typeof request.average === 'number'
        ? ` Class average: ${request.average.toFixed(1)}%.`
        : '';
    const positionContext =
      typeof request.position === 'number' && typeof request.classSize === 'number'
        ? ` Position: ${request.position}/${request.classSize}.`
        : '';
    const tone = request.tone || 'balanced';
    const subjectKeyword = this.getPrimarySubjectKeyword(request.subject);

    // Determine guidance based on percentage
    let guidanceInstructions = '';
    if (percentage < 50) {
      guidanceInstructions = `Performance is below expectation. Use supportive but specific improvement coaching focused on ${subjectKeyword}.`;
    } else if (percentage >= 50 && percentage < 60) {
      guidanceInstructions = `Performance is fair. Acknowledge effort and push a concrete next step focused on ${subjectKeyword}.`;
    } else {
      guidanceInstructions = `Performance is strong. Reinforce strengths while adding a precise next challenge in ${subjectKeyword}.`;
    }
    const toneInstruction =
      tone === 'firm'
        ? 'Tone: direct, high expectations, no fluff.'
        : tone === 'encouraging'
        ? 'Tone: warm, motivating, optimistic.'
        : 'Tone: balanced, constructive, professional.';

    return `
Generate exactly 5 brief, subject-specific, and encouraging teacher comments for a student who scored ${
      request.mark
    }${request.maxMark ? `/${request.maxMark}` : ''} (${percentage.toFixed(
      1,
    )}%)${subjectContext}${level}.

Performance Level: ${performanceLevel}
${guidanceInstructions}
${toneInstruction}
${studentContext}${classContext}${examContext}${averageContext}${positionContext}

Requirements:
- Each comment must be 3 to 5 words only
- Use at least one subject keyword linked to ${subjectName}
- Include one clear action verb (revise, solve, explain, practice, analyze, compare, summarize)
- Avoid generic praise phrases such as "well done", "keep it up", "good work", "great effort"
- Comments should be concise, realistic, and motivating
- All 5 comments must be wording-distinct
- Format as a numbered list (1. 2. 3. 4. 5.)

Examples (style only):
- Solve equations with clear steps
- Analyze causes before answering
- Revise key formulas daily
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

  private parseComments(response: string, subject?: string): string[] {
    // Split by numbered list items and clean up
    const lines = response
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Remove numbering (1. 2. etc.) and clean up
        return line.replace(/^[-*]?\s*\d*[\).\-\s]*/, '').trim();
      })
      .filter((line) => {
        if (line.length === 0 || line.length > 80) {
          return false;
        }
        const wordCount = line
          .split(/\s+/)
          .filter((word) => word.length > 0).length;
        if (wordCount < 3 || wordCount > 5) return false;
        if (this.isGenericComment(line)) return false;
        if (subject && !this.containsSubjectContext(line, subject)) return false;
        return true;
      })
      .map((line) => this.normalizeComment(line));

    const unique: string[] = [];
    for (const line of lines) {
      if (!unique.some((existing) => existing.toLowerCase() === line.toLowerCase())) {
        unique.push(line);
      }
      if (unique.length >= 5) break;
    }
    return unique;
  }

  private buildAdditionalCommentsPrompt(
    request: CommentGenerationRequest,
    percentage: number,
    performanceLevel: string,
    existingCount: number,
  ): string {
    const subjectName = request.subject || 'the subject';
    const subjectContext = request.subject ? ` in ${request.subject}` : '';
    const level = request.studentLevel
      ? ` for ${request.studentLevel} students`
      : '';
    const subjectKeyword = this.getPrimarySubjectKeyword(request.subject);
    const needed = 5 - existingCount;
    const tone = request.tone || 'balanced';

    // Determine guidance based on percentage
    let guidanceInstructions = '';
    if (percentage < 50) {
      guidanceInstructions = `Performance is below expectation. Focus on specific improvement coaching using ${subjectKeyword}.`;
    } else if (percentage >= 50 && percentage < 60) {
      guidanceInstructions = `Performance is fair. Acknowledge effort and give actionable advice using ${subjectKeyword}.`;
    } else {
      guidanceInstructions = `Performance is strong. Reinforce strengths and set precise extension guidance in ${subjectKeyword}.`;
    }
    const toneInstruction =
      tone === 'firm'
        ? 'Tone: direct and accountable.'
        : tone === 'encouraging'
        ? 'Tone: warm and motivating.'
        : 'Tone: balanced and constructive.';

    return `
Generate exactly ${needed} more brief, subject-specific, and encouraging teacher comments for a student who scored ${
      request.mark
    }${request.maxMark ? `/${request.maxMark}` : ''} (${percentage.toFixed(
      1,
    )}%)${subjectContext}${level}.

We already have ${existingCount} comments, so generate ${needed} additional unique comments.

Performance Level: ${performanceLevel}
${guidanceInstructions}
${toneInstruction}

Requirements:
- Each comment must be 3 to 5 words only
- Use at least one subject keyword tied to ${subjectName}
- Include one clear action verb
- Avoid generic praise phrases
- Keep each comment distinct from others
- Format as a numbered list (1. 2. 3. etc.)
- Make sure these comments are different from the ones already generated
    `.trim();
  }

  // Fallback method for when OpenAI is unavailable
  getFallbackComments(
    mark: number,
    maxMark: number = 100,
    subject?: string,
  ): string[] {
    const percentage = (mark / maxMark) * 100;
    const keyword = this.getPrimarySubjectKeyword(subject);

    if (percentage >= 60) {
      return [
        `Strong ${keyword}, sustain this accuracy`,
        `Apply ${keyword} in harder tasks`,
        `Extend ${keyword} through challenge questions`,
        `Maintain precise ${keyword} exam technique`,
        `Refine ${keyword} with timed practice`,
      ];
    } else if (percentage >= 50) {
      return [
        `Improve ${keyword} with daily drills`,
        `Review ${keyword} errors each evening`,
        `Practice ${keyword} using past papers`,
        `Clarify ${keyword} concepts with teacher`,
        `Strengthen ${keyword} through corrections`,
      ];
    } else {
      return [
        `Rebuild ${keyword} foundations stepwise`,
        `Practice ${keyword} basics before tests`,
        `Ask support on ${keyword} misconceptions`,
        `Revise ${keyword} with guided examples`,
        `Correct ${keyword} mistakes immediately`,
      ];
    }
  }

  async generateRoleComment(
    context: RoleCommentContext,
  ): Promise<RoleCommentResponse> {
    if (!this.openai) {
      return {
        success: true,
        comment: this.getRoleCommentFallback(context),
        source: 'fallback',
        error: 'OpenAI unavailable',
      };
    }

    try {
      const model =
        this.configService.get<string>('OPENAI_COMMENT_MODEL') || 'gpt-4o-mini';
      const prompt = this.buildRoleCommentPrompt(context);

      const completion = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a school educator writing concise report-card summary comments. Output must be plain text only, one paragraph, no markdown, no bullet points, no hashtags.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 70,
        temperature: 0.7,
        stop: ['\n'],
      });

      const response = completion.choices[0]?.message?.content?.trim();
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const normalized = this.normalizeRoleComment(response);
      if (!normalized) {
        throw new Error('Response failed validation');
      }

      return { success: true, comment: normalized, source: 'openai' };
    } catch (error) {
      this.logger.warn(
        `Role comment generation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return {
        success: true,
        comment: this.getRoleCommentFallback(context),
        source: 'fallback',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildRoleCommentPrompt(context: RoleCommentContext): string {
    const roleLabel =
      context.role === 'headTeacher' ? "Head's Comment" : 'Form Teacher Comment';
    const top = context.topSubjects
      .slice(0, 3)
      .map((s) => `${s.subject} ${s.mark}%`)
      .join(', ');
    const weak = context.weakSubjects
      .slice(0, 3)
      .map((s) => `${s.subject} ${s.mark}%`)
      .join(', ');
    const classroomEvidence = context.subjectComments
      .slice(0, 5)
      .map((s) => `${s.subject}: ${s.comment}`)
      .join(' | ');

    return `
Write one ${roleLabel} for a report card.

Student: ${context.studentName}
Class: ${context.className}
Exam: ${context.examType || 'N/A'}
Term: ${context.termNumber || 'N/A'}/${context.termYear || 'N/A'}
Average: ${context.percentageAverage?.toFixed(1) || 'N/A'}%
Position: ${context.classPosition || 'N/A'}/${context.classSize || 'N/A'}
Subjects passed: ${context.subjectsPassed || 0}/${context.totalSubjects || 0}
Top subjects: ${top || 'N/A'}
Weak subjects: ${weak || 'N/A'}
Subject comments evidence: ${classroomEvidence || 'N/A'}

Requirements:
- Maximum length: ${OpenAIService.MAX_ROLE_COMMENT_CHARS} characters
- 14 to 30 words total
- Mention at least one strength and one target for improvement
- Use professional school tone
- Plain text only, single paragraph, no line breaks
- Do not mention AI
    `.trim();
  }

  private normalizeRoleComment(value: string): string | null {
    const line = value
      .replace(/\s+/g, ' ')
      .replace(/^["'\-\*\#\d\.\)\s]+/, '')
      .trim();
    const bounded = line.slice(0, OpenAIService.MAX_ROLE_COMMENT_CHARS);
    const wordCount = bounded
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    if (wordCount < 10 || wordCount > 35) return null;
    return bounded;
  }

  private getRoleCommentFallback(context: RoleCommentContext): string {
    const name = context.studentName || 'The student';
    const top =
      context.topSubjects[0]?.subject ||
      context.topSubjects[1]?.subject ||
      'key subjects';
    const weak =
      context.weakSubjects[0]?.subject ||
      context.weakSubjects[1]?.subject ||
      'core areas';

    if (context.role === 'headTeacher') {
      return `${name} shows strong potential, especially in ${top}. Improve consistency in ${weak} through regular revision and focused practice next term.`;
    }

    return `${name} demonstrates good effort with strength in ${top}. Focused practice in ${weak} and consistent corrections will improve overall performance.`;
  }

  private normalizeComment(comment: string): string {
    const cleaned = comment.replace(/[.;:,!?]+$/g, '').trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  private isGenericComment(comment: string): boolean {
    return this.bannedGenericPatterns.some((pattern) => pattern.test(comment));
  }

  private containsSubjectContext(comment: string, subject: string): boolean {
    const keyword = this.getPrimarySubjectKeyword(subject).toLowerCase();
    if (!keyword || keyword === 'concepts') return true;
    return comment.toLowerCase().includes(keyword);
  }

  private fillMissingComments(
    comments: string[],
    request: CommentGenerationRequest,
    performanceLevel: string,
    percentage: number,
  ): string[] {
    const fallback = this.getFallbackComments(
      request.mark,
      request.maxMark || 100,
      request.subject,
    );
    const combined = [...comments];
    for (const candidate of fallback) {
      if (
        combined.length < 5 &&
        !combined.some((existing) => existing.toLowerCase() === candidate.toLowerCase())
      ) {
        combined.push(candidate);
      }
    }

    if (combined.length < 5) {
      this.logger.warn(
        `Comment fill fallback incomplete for ${performanceLevel} (${percentage.toFixed(
          1,
        )}%)`,
      );
    }

    return combined.slice(0, 5);
  }

  private getPrimarySubjectKeyword(subject?: string): string {
    if (!subject) return 'concepts';
    const normalized = subject.toLowerCase();
    if (normalized.includes('math')) return 'equations';
    if (normalized.includes('physics')) return 'calculations';
    if (normalized.includes('chem')) return 'reactions';
    if (normalized.includes('biology')) return 'processes';
    if (normalized.includes('history')) return 'evidence';
    if (normalized.includes('geography')) return 'maps';
    if (normalized.includes('account')) return 'ledgers';
    if (normalized.includes('business')) return 'analysis';
    if (normalized.includes('english')) return 'writing';
    if (normalized.includes('computer')) return 'algorithms';
    return 'concepts';
  }
}

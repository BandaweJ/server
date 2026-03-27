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

type SchoolStage = 'form1to2' | 'form3to4' | 'form5to6' | 'genericSecondary';

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
  private static readonly MAX_FORM_TEACHER_COMMENT_CHARS = 140;
  private openai: OpenAI;
  private readonly bannedGenericPatterns = [
    /well done/i,
    /keep it up/i,
    /good work/i,
    /great effort/i,
    /excellent work/i,
    /outstanding work/i,
  ];
  private readonly stageDisallowedTerms: Record<SchoolStage, string[]> = {
    form1to2: [
      'algorithm',
      'algorithms',
      'derivative',
      'derivatives',
      'integration',
      'integral',
      'stoichiometry',
      'electrolysis',
      'trigonometric',
      'kinematics',
      'organic chemistry',
      'argumentation',
      'evaluation',
      'hypothesis',
      'theorem',
    ],
    form3to4: [
      'derivative',
      'derivatives',
      'integration',
      'integral',
      'electromagnetism',
      'stoichiometry',
      'algorithmic complexity',
    ],
    form5to6: [],
    genericSecondary: [],
  };

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
      const stage = this.inferSchoolStage(request.className, request.studentLevel);
      let comments = this.parseComments(response, request.subject, stage);

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
              stage,
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
    const stage = this.inferSchoolStage(request.className, request.studentLevel);
    const subjectKeyword = this.getPrimarySubjectKeyword(request.subject, stage);
    const stageInstruction = this.getStageInstruction(stage);

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
- Follow Cambridge syllabus expectations for this level
- Keep vocabulary age-appropriate for this stage: ${stageInstruction}
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

  private parseComments(
    response: string,
    subject?: string,
    stage: SchoolStage = 'genericSecondary',
  ): string[] {
    const lines = response
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        return line.replace(/^[-*]?\s*\d*[\).\-\s]*/, '').trim();
      })
      .filter((line) => {
        if (line.length === 0 || line.length > 80) return false;
        const wordCount = line
          .split(/\s+/)
          .filter((word) => word.length > 0).length;
        if (wordCount < 3 || wordCount > 5) return false;
        if (this.isGenericComment(line)) return false;
        if (subject && !this.containsSubjectContext(line, subject)) return false;
        if (this.containsDisallowedTerms(line, stage)) return false;
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
    const stage = this.inferSchoolStage(request.className, request.studentLevel);
    const subjectKeyword = this.getPrimarySubjectKeyword(request.subject, stage);
    const stageInstruction = this.getStageInstruction(stage);
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
- Follow Cambridge syllabus expectations for this level
- Keep vocabulary age-appropriate for this stage: ${stageInstruction}
- Format as a numbered list (1. 2. 3. etc.)
- Make sure these comments are different from the ones already generated
    `.trim();
  }

  // Fallback method for when OpenAI is unavailable
  getFallbackComments(
    mark: number,
    maxMark: number = 100,
    subject?: string,
    className?: string,
    studentLevel?: string,
  ): string[] {
    const percentage = (mark / maxMark) * 100;
    const stage = this.inferSchoolStage(className, studentLevel);
    const keyword = this.getPrimarySubjectKeyword(subject, stage);

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

      const normalized = this.normalizeRoleComment(response, context.role);
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

    const isFormTeacher = context.role === 'formTeacher';
    const maxChars = isFormTeacher
      ? OpenAIService.MAX_FORM_TEACHER_COMMENT_CHARS
      : OpenAIService.MAX_ROLE_COMMENT_CHARS;
    const roleSpecificRequirements =
      context.role === 'formTeacher'
        ? `Form Teacher Focus:
- Comment on behaviour, conduct, discipline, punctuality, and attitude towards work
- You may infer likely conduct trends from marks/consistency, but avoid fabricating incidents
- Keep it to one short sentence only
- Keep wording practical and school-appropriate
- Prefer phrases like: "Positive attitude towards school work."`
        : `Head Teacher Focus:
- Give a concise academic leadership summary with strength and improvement target
- Keep it professional and forward-looking`;

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
- Maximum length: ${maxChars} characters
- ${
      isFormTeacher ? '8 to 16 words total' : '14 to 30 words total'
    }
- ${
      isFormTeacher
        ? 'Focus on behaviour and work attitude; do not include subject-by-subject analysis'
        : 'Mention at least one strength and one target for improvement'
    }
- Use professional school tone
- Plain text only, single paragraph, no line breaks
- Do not mention AI
${roleSpecificRequirements}
    `.trim();
  }

  private normalizeRoleComment(
    value: string,
    role: RoleCommentContext['role'],
  ): string | null {
    const line = value
      .replace(/\s+/g, ' ')
      .replace(/^["'\-\*\#\d\.\)\s]+/, '')
      .trim();
    const maxChars =
      role === 'formTeacher'
        ? OpenAIService.MAX_FORM_TEACHER_COMMENT_CHARS
        : OpenAIService.MAX_ROLE_COMMENT_CHARS;
    const singleSentence =
      role === 'formTeacher' ? this.keepFirstSentence(line) : line;
    const bounded = singleSentence.slice(0, maxChars).trim();
    const wordCount = bounded
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    const minWords = role === 'formTeacher' ? 6 : 10;
    const maxWords = role === 'formTeacher' ? 20 : 35;
    if (wordCount < minWords || wordCount > maxWords) return null;
    return bounded;
  }

  private keepFirstSentence(text: string): string {
    const match = text.match(/^(.+?[.!?])(?:\s|$)/);
    return match ? match[1].trim() : text.trim();
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

    return `Positive attitude towards school work; needs stronger consistency and discipline in ${weak}.`;
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

  private getPrimarySubjectKeywordByStage(
    subject: string | undefined,
    stage: SchoolStage,
  ): string {
    if (!subject) return 'concepts';
    const normalized = subject.toLowerCase();

    const lowStage = stage === 'form1to2';
    const midStage = stage === 'form3to4';
    const highStage = stage === 'form5to6';

    if (normalized.includes('math')) return lowStage ? 'steps' : midStage ? 'equations' : 'problem-solving';
    if (normalized.includes('physics')) return lowStage ? 'units' : midStage ? 'calculations' : 'principles';
    if (normalized.includes('chem')) return lowStage ? 'symbols' : midStage ? 'reactions' : 'concepts';
    if (normalized.includes('biology')) return lowStage ? 'definitions' : midStage ? 'processes' : 'analysis';
    if (normalized.includes('history')) return lowStage ? 'facts' : midStage ? 'evidence' : 'arguments';
    if (normalized.includes('geography')) return lowStage ? 'mapwork' : midStage ? 'maps' : 'case-studies';
    if (normalized.includes('account')) return lowStage ? 'entries' : midStage ? 'ledgers' : 'interpretation';
    if (normalized.includes('business')) return lowStage ? 'key terms' : midStage ? 'analysis' : 'evaluation';
    if (normalized.includes('english') || normalized.includes('language'))
      return lowStage ? 'sentence structure' : midStage ? 'writing' : 'argumentation';
    if (normalized.includes('computer')) return lowStage ? 'logic' : midStage ? 'program structure' : 'algorithms';
    return 'concepts';
  }

  private getPrimarySubjectKeyword(
    subject?: string,
    stage: SchoolStage = 'genericSecondary',
  ): string {
    const keyword = this.getPrimarySubjectKeywordByStage(subject, stage);
    if (this.containsDisallowedTerms(keyword, stage)) {
      return 'concepts';
    }
    return keyword;
  }

  private inferSchoolStage(
    className?: string,
    studentLevel?: string,
  ): SchoolStage {
    const classText = (className || '').toLowerCase();
    const levelText = (studentLevel || '').toLowerCase();

    if (
      levelText.includes('a level') ||
      levelText.includes('as level') ||
      classText.includes('form 5') ||
      classText.includes('form 6') ||
      classText.includes('5 ') ||
      classText.startsWith('5') ||
      classText.includes('6 ') ||
      classText.startsWith('6')
    ) {
      return 'form5to6';
    }

    if (
      classText.includes('form 1') ||
      classText.includes('form 2') ||
      classText.startsWith('1') ||
      classText.startsWith('2')
    ) {
      return 'form1to2';
    }

    if (
      classText.includes('form 3') ||
      classText.includes('form 4') ||
      classText.startsWith('3') ||
      classText.startsWith('4')
    ) {
      return 'form3to4';
    }

    if (levelText.includes('o level') || levelText.includes('igcse')) {
      return 'form3to4';
    }

    return 'genericSecondary';
  }

  private getStageInstruction(stage: SchoolStage): string {
    if (stage === 'form1to2') {
      return 'simple classroom vocabulary for ages about 13-15; avoid advanced technical jargon';
    }
    if (stage === 'form3to4') {
      return 'IGCSE/O-Level appropriate terminology for ages about 15-17';
    }
    if (stage === 'form5to6') {
      return 'A-Level appropriate terminology, still concise and clear';
    }
    return 'secondary-school appropriate and not overly technical';
  }

  private containsDisallowedTerms(text: string, stage: SchoolStage): boolean {
    const disallowed = this.stageDisallowedTerms[stage] || [];
    const normalized = text.toLowerCase();
    return disallowed.some((term) => normalized.includes(term));
  }
}

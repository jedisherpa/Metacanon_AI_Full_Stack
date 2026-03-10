import { type AgentConfig } from './agentConfig.js';
import {
  createBaseExecutor,
  type AgentBoundaryErrorEvent,
  type AgentExecutionAuditEvent,
  type AgentExecutionResult
} from './baseExecutor.js';

const DEFAULT_INTENT = 'skill.content_generation.run';
const DEFAULT_FORMAT = 'article' as const;
const DEFAULT_TONE = 'clear and pragmatic';
const DEFAULT_CHANNEL = 'web';
const DEFAULT_AUDIENCE = 'general';
const DEFAULT_TARGET_WORD_COUNT = 700;
const MIN_TARGET_WORD_COUNT = 80;
const MAX_TARGET_WORD_COUNT = 4_000;
const MAX_LIST_ITEMS = 40;
const MAX_OBJECTIVE_CHARS = 3_000;

type ContentFormat = 'article' | 'post' | 'email' | 'thread' | 'script';

const SUPPORTED_FORMATS: ReadonlySet<ContentFormat> = new Set([
  'article',
  'post',
  'email',
  'thread',
  'script'
]);

export type ContentSourceFact = {
  fact: string;
  source?: string;
};

export type ContentSection = {
  heading: string;
  body: string;
  wordCount: number;
};

export type ContentCitation = {
  label: string;
  source?: string;
};

export type ContentGenerationInput = {
  objective: string;
  format?: ContentFormat;
  channel?: string;
  audience?: string;
  tone?: string;
  targetWordCount?: number;
  keyPoints?: string[];
  sourceFacts?: ContentSourceFact[];
  constraints?: string[];
  includeCallToAction?: boolean;
  publishRequested?: boolean;
  dryRun?: boolean;
};

export type ContentGenerationOutput = {
  objective: string;
  format: ContentFormat;
  channel: string;
  audience: string;
  tone: string;
  targetWordCount: number;
  title: string;
  summary: string;
  body: string;
  wordCount: number;
  sections: ContentSection[];
  citations: ContentCitation[];
  tags: string[];
  callToAction?: string;
  delivery: {
    validationRequired: boolean;
    status: 'not_requested' | 'approved_pending_manual' | 'published' | 'dry_run';
    message: string;
    publishRef?: string;
  };
};

export type ContentActionValidationRequest = {
  action: 'content_delivery' | 'content_publish';
  payload: {
    objective: string;
    format: ContentFormat;
    channel: string;
    title: string;
    wordCount: number;
    publishRequested: boolean;
    contentPreview: string;
  };
};

export type ContentActionValidationResult = {
  allowed: boolean;
  code?: string;
  message?: string;
};

export type ContentActionValidator = (
  request: ContentActionValidationRequest
) => Promise<ContentActionValidationResult> | ContentActionValidationResult;

export type GeneratedContentDraft = {
  title: string;
  summary?: string;
  body: string;
  sections?: Array<{ heading: string; body: string }>;
  citations?: ContentCitation[];
  tags?: string[];
  callToAction?: string;
};

export type ContentGenerator = (input: {
  objective: string;
  format: ContentFormat;
  channel: string;
  audience: string;
  tone: string;
  targetWordCount: number;
  keyPoints: string[];
  sourceFacts: ContentSourceFact[];
  constraints: string[];
  includeCallToAction: boolean;
}) => Promise<GeneratedContentDraft>;

export type ContentPublisher = (params: {
  content: ContentGenerationOutput;
}) => Promise<{ publishRef: string }>;

export class ContentGenerationSkillError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeList(items: string[] | undefined, maxItems = MAX_LIST_ITEMS): string[] {
  return [...new Set((items ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, maxItems);
}

function shouldValidateAction(config: AgentConfig): boolean {
  return config.security?.requireActionValidation ?? true;
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function deriveTitle(objective: string): string {
  const base = objective.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const compact = base.length > 80 ? `${base.slice(0, 77).trim()}...` : base;
  return toTitleCase(compact || 'Generated Content');
}

function normalizeInput(input: ContentGenerationInput): {
  objective: string;
  format: ContentFormat;
  channel: string;
  audience: string;
  tone: string;
  targetWordCount: number;
  keyPoints: string[];
  sourceFacts: ContentSourceFact[];
  constraints: string[];
  includeCallToAction: boolean;
  publishRequested: boolean;
  dryRun: boolean;
} {
  const objective = input.objective?.trim();
  if (!objective) {
    throw new ContentGenerationSkillError('CONTENT_OBJECTIVE_REQUIRED', 'objective is required.');
  }
  if (objective.length > MAX_OBJECTIVE_CHARS) {
    throw new ContentGenerationSkillError(
      'CONTENT_OBJECTIVE_TOO_LONG',
      `objective exceeds ${MAX_OBJECTIVE_CHARS} characters.`
    );
  }

  const format = (input.format ?? DEFAULT_FORMAT).trim().toLowerCase() as ContentFormat;
  if (!SUPPORTED_FORMATS.has(format)) {
    throw new ContentGenerationSkillError(
      'CONTENT_FORMAT_INVALID',
      `Unsupported content format "${input.format ?? ''}".`
    );
  }

  const channel = (input.channel ?? DEFAULT_CHANNEL).trim().toLowerCase() || DEFAULT_CHANNEL;
  const audience = (input.audience ?? DEFAULT_AUDIENCE).trim() || DEFAULT_AUDIENCE;
  const tone = (input.tone ?? DEFAULT_TONE).trim() || DEFAULT_TONE;
  const targetWordCount = clampInt(
    input.targetWordCount ?? DEFAULT_TARGET_WORD_COUNT,
    MIN_TARGET_WORD_COUNT,
    MAX_TARGET_WORD_COUNT
  );
  const keyPoints = normalizeList(input.keyPoints, MAX_LIST_ITEMS);
  const constraints = normalizeList(input.constraints, MAX_LIST_ITEMS);
  const sourceFacts = (input.sourceFacts ?? [])
    .map((factItem) => ({
      fact: factItem.fact?.trim() ?? '',
      source: factItem.source?.trim() || undefined
    }))
    .filter((item) => item.fact.length > 0)
    .slice(0, MAX_LIST_ITEMS);
  const includeCallToAction = input.includeCallToAction ?? true;
  const publishRequested = input.publishRequested ?? false;
  const dryRun = input.dryRun ?? false;

  return {
    objective,
    format,
    channel,
    audience,
    tone,
    targetWordCount,
    keyPoints,
    sourceFacts,
    constraints,
    includeCallToAction,
    publishRequested,
    dryRun
  };
}

function buildHeuristicContent(input: {
  objective: string;
  format: ContentFormat;
  channel: string;
  audience: string;
  tone: string;
  targetWordCount: number;
  keyPoints: string[];
  sourceFacts: ContentSourceFact[];
  constraints: string[];
  includeCallToAction: boolean;
}): GeneratedContentDraft {
  const keyPointText =
    input.keyPoints.length > 0
      ? `Key points: ${input.keyPoints.map((point, index) => `${index + 1}. ${point}`).join(' ')}`
      : 'Key points: clarify the main promise, practical value, and next action.';
  const factsText =
    input.sourceFacts.length > 0
      ? `Supporting facts: ${input.sourceFacts.map((item) => item.fact).join(' ')}`
      : 'Supporting facts: use available context and call out assumptions explicitly.';
  const constraintsText =
    input.constraints.length > 0 ? `Constraints: ${input.constraints.join('; ')}.` : undefined;

  const sections = [
    {
      heading: 'Context',
      body: `Audience: ${input.audience}. Channel: ${input.channel}. Tone: ${input.tone}. Objective: ${input.objective}.`
    },
    {
      heading: 'Core Message',
      body: `${keyPointText} ${factsText}`.trim()
    },
    {
      heading: 'Execution Notes',
      body: `Target length: ${input.targetWordCount} words. ${constraintsText ?? 'No extra constraints provided.'}`.trim()
    }
  ];

  const body = sections.map((section) => `## ${section.heading}\n${section.body}`).join('\n\n').trim();
  const callToAction = input.includeCallToAction
    ? 'Call to action: confirm scope, then publish or hand off for sovereign approval.'
    : undefined;
  const summary = `${sections[0].body} ${sections[1].body}`.slice(0, 320);

  return {
    title: deriveTitle(input.objective),
    summary,
    body,
    sections,
    citations: input.sourceFacts.map((item, index) => ({
      label: `fact_${index + 1}`,
      source: item.source
    })),
    tags: [input.format, input.channel, 'metacanon'],
    callToAction
  };
}

function normalizeGeneratedOutput(
  normalizedInput: ReturnType<typeof normalizeInput>,
  generated: GeneratedContentDraft
): Omit<ContentGenerationOutput, 'delivery'> {
  const title = generated.title?.trim() || deriveTitle(normalizedInput.objective);
  const body = generated.body?.trim();
  if (!body) {
    throw new ContentGenerationSkillError('CONTENT_BODY_REQUIRED', 'Generated content body is empty.');
  }

  const sectionsRaw = (generated.sections ?? [])
    .map((section) => ({
      heading: section.heading?.trim() || 'Section',
      body: section.body?.trim() || ''
    }))
    .filter((section) => section.body.length > 0);

  const sections: ContentSection[] =
    sectionsRaw.length > 0
      ? sectionsRaw.map((section) => ({
          heading: section.heading,
          body: section.body,
          wordCount: countWords(section.body)
        }))
      : [
          {
            heading: 'Draft',
            body,
            wordCount: countWords(body)
          }
        ];

  const citations = (generated.citations ?? [])
    .map((citation) => ({
      label: citation.label?.trim() || '',
      source: citation.source?.trim() || undefined
    }))
    .filter((citation) => citation.label.length > 0)
    .slice(0, MAX_LIST_ITEMS);
  const fallbackCitations =
    citations.length > 0
      ? citations
      : normalizedInput.sourceFacts.map((item, index) => ({
          label: `fact_${index + 1}`,
          source: item.source
        }));

  const tags = normalizeList(generated.tags, 12);
  const summary = generated.summary?.trim() || body.slice(0, 320);

  return {
    objective: normalizedInput.objective,
    format: normalizedInput.format,
    channel: normalizedInput.channel,
    audience: normalizedInput.audience,
    tone: normalizedInput.tone,
    targetWordCount: normalizedInput.targetWordCount,
    title,
    summary,
    body,
    wordCount: countWords(body),
    sections,
    citations: fallbackCitations,
    tags: tags.length > 0 ? tags : [normalizedInput.format, normalizedInput.channel, 'metacanon'],
    callToAction: generated.callToAction?.trim() || undefined
  };
}

async function ensureActionAllowed(params: {
  config: AgentConfig;
  dryRun: boolean;
  validator?: ContentActionValidator;
  request: ContentActionValidationRequest;
}): Promise<void> {
  if (params.dryRun || !shouldValidateAction(params.config)) {
    return;
  }
  if (!params.validator) {
    throw new ContentGenerationSkillError(
      'ACTION_VALIDATOR_REQUIRED',
      `validate_action is required for ${params.request.action}.`
    );
  }
  const result = await params.validator(params.request);
  if (!result.allowed) {
    throw new ContentGenerationSkillError(
      result.code ?? 'ACTION_VALIDATION_REJECTED',
      result.message ?? `${params.request.action} rejected by validator.`
    );
  }
}

export function createContentGenerationSkill(params: {
  config: AgentConfig;
  generateContent?: ContentGenerator;
  validateAction?: ContentActionValidator;
  publishContent?: ContentPublisher;
  auditLog?: (event: AgentExecutionAuditEvent) => Promise<void> | void;
  onBoundaryError?: (event: AgentBoundaryErrorEvent) => Promise<void> | void;
}): {
  execute: (
    input: ContentGenerationInput,
    context?: { traceId?: string; metadata?: Record<string, unknown> }
  ) => Promise<AgentExecutionResult<ContentGenerationOutput>>;
} {
  const executor = createBaseExecutor<ContentGenerationInput, ContentGenerationOutput>({
    validate: async ({ input }) => {
      try {
        normalizeInput(input);
      } catch (error) {
        if (error instanceof ContentGenerationSkillError) {
          return {
            allowed: false,
            code: error.code,
            message: error.message
          };
        }
        return {
          allowed: false,
          code: 'CONTENT_INPUT_INVALID',
          message: 'Invalid content generation input.'
        };
      }
      return { allowed: true };
    },
    execute: async ({ input }) => {
      const normalizedInput = normalizeInput(input);
      const generated = params.generateContent
        ? await params.generateContent(normalizedInput)
        : buildHeuristicContent(normalizedInput);
      const output = normalizeGeneratedOutput(normalizedInput, generated);
      const contentPreview = output.body.slice(0, 280);

      if (!normalizedInput.dryRun) {
        await ensureActionAllowed({
          config: params.config,
          dryRun: false,
          validator: params.validateAction,
          request: {
            action: 'content_delivery',
            payload: {
              objective: output.objective,
              format: output.format,
              channel: output.channel,
              title: output.title,
              wordCount: output.wordCount,
              publishRequested: normalizedInput.publishRequested,
              contentPreview
            }
          }
        });
      }

      let delivery: ContentGenerationOutput['delivery'] = normalizedInput.dryRun
        ? {
            validationRequired: shouldValidateAction(params.config),
            status: 'dry_run',
            message: 'Dry run enabled; content was generated without delivery or publishing.'
          }
        : {
            validationRequired: shouldValidateAction(params.config),
            status: 'not_requested',
            message: 'Content generated and ready for manual review.'
          };

      if (normalizedInput.publishRequested && !normalizedInput.dryRun) {
        await ensureActionAllowed({
          config: params.config,
          dryRun: false,
          validator: params.validateAction,
          request: {
            action: 'content_publish',
            payload: {
              objective: output.objective,
              format: output.format,
              channel: output.channel,
              title: output.title,
              wordCount: output.wordCount,
              publishRequested: true,
              contentPreview
            }
          }
        });

        if (params.publishContent) {
          const published = await params.publishContent({
            content: {
              ...output,
              delivery
            }
          });
          delivery = {
            validationRequired: shouldValidateAction(params.config),
            status: 'published',
            message: 'Content published successfully.',
            publishRef: published.publishRef
          };
        } else {
          delivery = {
            validationRequired: shouldValidateAction(params.config),
            status: 'approved_pending_manual',
            message: 'Content is action-validated and ready for manual publishing.'
          };
        }
      }

      return {
        ...output,
        delivery
      };
    },
    auditLog: params.auditLog,
    onBoundaryError: params.onBoundaryError
  });

  return {
    execute: async (input, context) =>
      executor.execute({
        config: params.config,
        intent: DEFAULT_INTENT,
        input,
        traceId: context?.traceId,
        metadata: context?.metadata
      })
  };
}

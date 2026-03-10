import { type AgentConfig } from './agentConfig.js';
import {
  createBaseExecutor,
  type AgentBoundaryErrorEvent,
  type AgentExecutionAuditEvent,
  type AgentExecutionResult
} from './baseExecutor.js';
import type { MemoryPopulationInput, MemoryPopulationOutput } from './memoryPopulationSkill.js';

const DEFAULT_INTENT = 'skill.transcript_digestion.run';
const DEFAULT_MAX_ITEMS = 100;
const MAX_ALLOWED_ITEMS = 500;
const DEFAULT_MAX_CHUNK_CHARS = 5000;
const MAX_CHUNK_CHARS = 20_000;
const LARGE_AUDIO_BYTES = 100 * 1024 * 1024;

export type TranscriptInputItem = {
  sourceId: string;
  transcriptText?: string;
  audioRef?: string;
  fileSizeBytes?: number;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

export type TranscriptDigest = {
  sourceId: string;
  transcriptLength: number;
  chunkCount: number;
  summary: string;
  keyPoints: string[];
  occurredAt?: string;
};

export type TranscriptDigestionInput = {
  items: TranscriptInputItem[];
  maxItems?: number;
  maxChunkChars?: number;
  autoPopulateMemory?: boolean;
  memoryNamespace?: string;
  memoryTags?: string[];
  dryRunMemory?: boolean;
};

export type TranscriptDigestionOutput = {
  processedCount: number;
  rejectedCount: number;
  digests: TranscriptDigest[];
  sourceErrors: Array<{ sourceId: string; code: string; message: string }>;
  memoryPopulation?: {
    status: AgentExecutionResult<MemoryPopulationOutput>['status'];
    storedCount?: number;
    duplicateCount?: number;
    rejectedCount?: number;
    code?: string;
    message?: string;
  };
};

export type TranscriptionProvider = (params: {
  sourceId: string;
  audioRef: string;
  chunkIndex: number;
  chunkCount: number;
}) => Promise<string>;

export type MemoryPopulationRunner = (
  input: MemoryPopulationInput,
  context?: { traceId?: string; metadata?: Record<string, unknown> }
) => Promise<AgentExecutionResult<MemoryPopulationOutput>>;

export class TranscriptDigestionSkillError extends Error {
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

function splitTranscriptIntoChunks(text: string, maxChunkChars: number): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }
  if (normalized.length <= maxChunkChars) {
    return [normalized];
  }

  const chunks: string[] = [];
  let offset = 0;
  while (offset < normalized.length) {
    const next = normalized.slice(offset, offset + maxChunkChars).trim();
    if (!next) {
      break;
    }
    chunks.push(next);
    offset += maxChunkChars;
  }
  return chunks;
}

function summarizeTranscript(transcript: string): { summary: string; keyPoints: string[] } {
  const normalized = transcript.trim().replace(/\s+/g, ' ');
  const summary = normalized.slice(0, 600);
  const sentenceCandidates = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20);
  const keyPoints = sentenceCandidates.slice(0, 5).map((sentence) => sentence.slice(0, 220));
  return {
    summary: summary || 'No transcript summary available.',
    keyPoints: keyPoints.length > 0 ? keyPoints : [summary || 'No key points extracted.']
  };
}

function normalizeInput(input: TranscriptDigestionInput): {
  items: TranscriptInputItem[];
  maxChunkChars: number;
  autoPopulateMemory: boolean;
  memoryNamespace: string;
  memoryTags: string[];
  dryRunMemory: boolean;
} {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new TranscriptDigestionSkillError('TRANSCRIPT_INPUT_EMPTY', 'items must be a non-empty array.');
  }

  const maxItems = clampInt(input.maxItems ?? DEFAULT_MAX_ITEMS, 1, MAX_ALLOWED_ITEMS);
  const items = input.items.slice(0, maxItems);
  const maxChunkChars = clampInt(input.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS, 1000, MAX_CHUNK_CHARS);
  const autoPopulateMemory = input.autoPopulateMemory ?? true;
  const memoryNamespace = (input.memoryNamespace ?? 'transcripts').trim().toLowerCase() || 'transcripts';
  const memoryTags = [
    ...new Set((input.memoryTags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))
  ];
  const dryRunMemory = input.dryRunMemory ?? false;

  return {
    items,
    maxChunkChars,
    autoPopulateMemory,
    memoryNamespace,
    memoryTags,
    dryRunMemory
  };
}

async function resolveTranscriptText(params: {
  item: TranscriptInputItem;
  transcribeAudio?: TranscriptionProvider;
}): Promise<{ transcriptText: string; chunkCount: number }> {
  const sourceId = params.item.sourceId.trim();
  if (!sourceId) {
    throw new TranscriptDigestionSkillError('TRANSCRIPT_SOURCE_ID_REQUIRED', 'sourceId is required.');
  }

  if (params.item.transcriptText && params.item.transcriptText.trim()) {
    return {
      transcriptText: params.item.transcriptText.trim(),
      chunkCount: 1
    };
  }

  if (!params.item.audioRef?.trim()) {
    throw new TranscriptDigestionSkillError(
      'TRANSCRIPT_SOURCE_MISSING',
      `source "${sourceId}" requires transcriptText or audioRef.`
    );
  }

  if (!params.transcribeAudio) {
    throw new TranscriptDigestionSkillError(
      'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED',
      'transcribeAudio is required when transcriptText is not provided.'
    );
  }

  const audioRef = params.item.audioRef.trim();
  const fileSizeBytes = params.item.fileSizeBytes ?? 0;
  const chunkCount = fileSizeBytes > LARGE_AUDIO_BYTES ? Math.ceil(fileSizeBytes / LARGE_AUDIO_BYTES) : 1;
  const chunkTexts: string[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const chunkText = await params.transcribeAudio({
      sourceId,
      audioRef,
      chunkIndex: index,
      chunkCount
    });
    if (chunkText.trim()) {
      chunkTexts.push(chunkText.trim());
    }
  }

  return {
    transcriptText: chunkTexts.join('\n\n').trim(),
    chunkCount
  };
}

export function getDefaultTranscriptDigestionSchedule(): {
  intervalMinutes: 60;
  skipIfRunning: true;
} {
  return {
    intervalMinutes: 60,
    skipIfRunning: true
  };
}

export function createTranscriptDigestionSkill(params: {
  config: AgentConfig;
  transcribeAudio?: TranscriptionProvider;
  populateMemory?: MemoryPopulationRunner;
  auditLog?: (event: AgentExecutionAuditEvent) => Promise<void> | void;
  onBoundaryError?: (event: AgentBoundaryErrorEvent) => Promise<void> | void;
}): {
  execute: (
    input: TranscriptDigestionInput,
    context?: { traceId?: string; metadata?: Record<string, unknown> }
  ) => Promise<AgentExecutionResult<TranscriptDigestionOutput>>;
} {
  const executor = createBaseExecutor<TranscriptDigestionInput, TranscriptDigestionOutput>({
    validate: async ({ input }) => {
      try {
        const normalized = normalizeInput(input);
        if (normalized.autoPopulateMemory && !params.populateMemory) {
          return {
            allowed: false,
            code: 'MEMORY_POPULATION_NOT_CONFIGURED',
            message: 'populateMemory callback is required when autoPopulateMemory=true.'
          };
        }
      } catch (error) {
        if (error instanceof TranscriptDigestionSkillError) {
          return {
            allowed: false,
            code: error.code,
            message: error.message
          };
        }
        return {
          allowed: false,
          code: 'TRANSCRIPT_INPUT_INVALID',
          message: 'Invalid transcript digestion input.'
        };
      }

      return { allowed: true };
    },
    execute: async ({ input, traceId, metadata }) => {
      const normalized = normalizeInput(input);
      const digests: TranscriptDigest[] = [];
      const sourceErrors: Array<{ sourceId: string; code: string; message: string }> = [];

      for (const item of normalized.items) {
        const sourceId = item.sourceId?.trim() || 'unknown';
        try {
          const transcript = await resolveTranscriptText({
            item,
            transcribeAudio: params.transcribeAudio
          });
          if (!transcript.transcriptText.trim()) {
            sourceErrors.push({
              sourceId,
              code: 'TRANSCRIPT_EMPTY',
              message: 'No transcript text available after ingestion.'
            });
            continue;
          }

          const chunks = splitTranscriptIntoChunks(transcript.transcriptText, normalized.maxChunkChars);
          const allSummaries = chunks.map((chunk) => summarizeTranscript(chunk));
          const summary = allSummaries.map((summaryItem) => summaryItem.summary).join(' ').slice(0, 1000);
          const keyPoints = [...new Set(allSummaries.flatMap((summaryItem) => summaryItem.keyPoints))].slice(0, 10);

          digests.push({
            sourceId,
            transcriptLength: transcript.transcriptText.length,
            chunkCount: Math.max(chunks.length, transcript.chunkCount),
            summary,
            keyPoints,
            occurredAt: item.occurredAt?.trim() || undefined
          });
        } catch (error) {
          const code =
            error instanceof TranscriptDigestionSkillError ? error.code : 'TRANSCRIPT_DIGESTION_FAILED';
          const message = error instanceof Error ? error.message : 'Transcript digestion failed.';
          sourceErrors.push({
            sourceId,
            code,
            message
          });
        }
      }

      let memoryPopulation: TranscriptDigestionOutput['memoryPopulation'] | undefined;
      if (normalized.autoPopulateMemory && params.populateMemory) {
        const memoryEntries = digests.flatMap((digest) =>
          digest.keyPoints.map((point) => ({
            content: point,
            sourceType: 'transcript',
            sourceRef: digest.sourceId,
            occurredAt: digest.occurredAt,
            tags: [...normalized.memoryTags, 'transcript'],
            metadata: {
              summary: digest.summary
            }
          }))
        );

        const memoryResult = await params.populateMemory(
          {
            namespace: normalized.memoryNamespace,
            entries: memoryEntries,
            dedupeByHash: true,
            dryRun: normalized.dryRunMemory
          },
          {
            traceId,
            metadata
          }
        );

        if (memoryResult.status === 'success') {
          memoryPopulation = {
            status: 'success',
            storedCount: memoryResult.output.storedCount,
            duplicateCount: memoryResult.output.duplicateCount,
            rejectedCount: memoryResult.output.rejectedCount
          };
        } else if (memoryResult.status === 'blocked') {
          memoryPopulation = {
            status: 'blocked',
            code: memoryResult.code,
            message: memoryResult.message
          };
        } else {
          memoryPopulation = {
            status: 'error',
            code: memoryResult.code,
            message: memoryResult.message
          };
        }
      }

      return {
        processedCount: digests.length,
        rejectedCount: sourceErrors.length,
        digests,
        sourceErrors,
        memoryPopulation
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

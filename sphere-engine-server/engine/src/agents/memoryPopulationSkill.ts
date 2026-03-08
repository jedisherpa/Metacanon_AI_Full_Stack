import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type AgentConfig } from './agentConfig.js';
import {
  createBaseExecutor,
  type AgentBoundaryErrorEvent,
  type AgentExecutionAuditEvent,
  type AgentExecutionResult
} from './baseExecutor.js';

const DEFAULT_INTENT = 'skill.memory_population.run';
const DEFAULT_NAMESPACE = 'default';
const DEFAULT_MAX_ENTRIES = 200;
const MAX_ALLOWED_ENTRIES = 1000;

export type MemoryInputEntry = {
  content: string;
  sourceType?: string;
  sourceRef?: string;
  occurredAt?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type MemoryPopulationInput = {
  entries: MemoryInputEntry[];
  namespace?: string;
  maxEntries?: number;
  dedupeByHash?: boolean;
  dryRun?: boolean;
};

export type MemoryRecord = {
  recordId: string;
  namespace: string;
  content: string;
  contentHash: string;
  sourceType?: string;
  sourceRef?: string;
  occurredAt?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MemoryPopulationOutput = {
  namespace: string;
  dryRun: boolean;
  dedupeByHash: boolean;
  inputCount: number;
  acceptedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  storedCount: number;
  recordIds: string[];
  storagePath: string;
};

export type MemoryStoreResult = {
  storedRecords: MemoryRecord[];
  duplicateCount: number;
};

export type MemoryRecordStore = {
  persist: (params: {
    namespace: string;
    records: MemoryRecord[];
    dedupeByHash: boolean;
    dryRun: boolean;
  }) => Promise<MemoryStoreResult>;
  storagePath: string;
};

export class MemoryPopulationSkillError extends Error {
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

function normalizeNamespace(rawNamespace: string | undefined): string {
  const namespace = (rawNamespace ?? DEFAULT_NAMESPACE).trim().toLowerCase();
  if (!namespace) {
    return DEFAULT_NAMESPACE;
  }
  if (!/^[a-z0-9._-]+$/.test(namespace)) {
    throw new MemoryPopulationSkillError(
      'INVALID_NAMESPACE',
      'namespace must match [a-z0-9._-]+'
    );
  }
  return namespace;
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

function computeContentHash(namespace: string, content: string): string {
  return createHash('sha256')
    .update(namespace)
    .update('\n')
    .update(content.trim())
    .digest('hex');
}

function createMemoryRecord(namespace: string, entry: MemoryInputEntry): MemoryRecord {
  const content = entry.content.trim();
  const contentHash = computeContentHash(namespace, content);
  const now = new Date().toISOString();

  return {
    recordId: randomUUID(),
    namespace,
    content,
    contentHash,
    sourceType: entry.sourceType?.trim() || undefined,
    sourceRef: entry.sourceRef?.trim() || undefined,
    occurredAt: entry.occurredAt?.trim() || undefined,
    tags: normalizeTags(entry.tags),
    metadata: entry.metadata ?? {},
    createdAt: now
  };
}

function defaultMemoryStoragePath(): string {
  return path.resolve(process.cwd(), '.metacanon_ai', 'memory', 'memory_records.ndjson');
}

async function readExistingRecords(storagePath: string): Promise<MemoryRecord[]> {
  try {
    const content = await readFile(storagePath, 'utf8');
    if (!content.trim()) {
      return [];
    }
    const records: MemoryRecord[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as MemoryRecord;
        if (parsed && typeof parsed === 'object') {
          records.push(parsed);
        }
      } catch {
        // Skip malformed lines instead of failing ingestion.
      }
    }
    return records;
  } catch (error) {
    const code =
      typeof error === 'object' && error != null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
    if (code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export function createFileMemoryRecordStore(storagePath: string = defaultMemoryStoragePath()): MemoryRecordStore {
  return {
    storagePath: path.resolve(storagePath),
    persist: async ({ namespace, records, dedupeByHash, dryRun }): Promise<MemoryStoreResult> => {
      const resolvedPath = path.resolve(storagePath);
      const existingRecords = await readExistingRecords(resolvedPath);
      const existingHashSet = new Set(
        existingRecords
          .filter((record) => record.namespace === namespace)
          .map((record) => record.contentHash)
      );

      const accepted: MemoryRecord[] = [];
      let duplicateCount = 0;
      for (const record of records) {
        if (dedupeByHash && existingHashSet.has(record.contentHash)) {
          duplicateCount += 1;
          continue;
        }
        accepted.push(record);
        existingHashSet.add(record.contentHash);
      }

      if (!dryRun && accepted.length > 0) {
        await mkdir(path.dirname(resolvedPath), { recursive: true });
        const appendLines = accepted.map((record) => JSON.stringify(record)).join('\n') + '\n';
        let existingContent = '';
        try {
          const info = await stat(resolvedPath);
          if (info.isFile()) {
            existingContent = await readFile(resolvedPath, 'utf8');
          }
        } catch (error) {
          const code =
            typeof error === 'object' && error != null && 'code' in error
              ? String((error as { code?: unknown }).code ?? '')
              : '';
          if (code !== 'ENOENT') {
            throw error;
          }
        }

        const finalContent = `${existingContent}${appendLines}`;
        await writeFile(resolvedPath, finalContent, 'utf8');
      }

      return {
        storedRecords: accepted,
        duplicateCount
      };
    }
  };
}

function normalizeInput(input: MemoryPopulationInput): {
  namespace: string;
  entries: MemoryInputEntry[];
  maxEntries: number;
  dedupeByHash: boolean;
  dryRun: boolean;
} {
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    throw new MemoryPopulationSkillError('MEMORY_INPUT_EMPTY', 'entries must be a non-empty array.');
  }

  const maxEntries = clampInt(input.maxEntries ?? DEFAULT_MAX_ENTRIES, 1, MAX_ALLOWED_ENTRIES);
  const namespace = normalizeNamespace(input.namespace);
  const dedupeByHash = input.dedupeByHash ?? true;
  const dryRun = input.dryRun ?? false;

  return {
    namespace,
    entries: input.entries.slice(0, maxEntries),
    maxEntries,
    dedupeByHash,
    dryRun
  };
}

export function getDefaultMemoryPopulationSchedule(): {
  cronUtc: '30 * * * *';
  skipIfRunning: true;
} {
  return {
    cronUtc: '30 * * * *',
    skipIfRunning: true
  };
}

export function createMemoryPopulationSkill(params: {
  config: AgentConfig;
  store?: MemoryRecordStore;
  auditLog?: (event: AgentExecutionAuditEvent) => Promise<void> | void;
  onBoundaryError?: (event: AgentBoundaryErrorEvent) => Promise<void> | void;
}): {
  execute: (
    input: MemoryPopulationInput,
    context?: { traceId?: string; metadata?: Record<string, unknown> }
  ) => Promise<AgentExecutionResult<MemoryPopulationOutput>>;
} {
  const store = params.store ?? createFileMemoryRecordStore();

  const executor = createBaseExecutor<MemoryPopulationInput, MemoryPopulationOutput>({
    validate: async ({ input }) => {
      try {
        normalizeInput(input);
      } catch (error) {
        if (error instanceof MemoryPopulationSkillError) {
          return {
            allowed: false,
            code: error.code,
            message: error.message
          };
        }
        return {
          allowed: false,
          code: 'MEMORY_INPUT_INVALID',
          message: 'Invalid memory population input.'
        };
      }
      return { allowed: true };
    },
    execute: async ({ input }) => {
      const normalized = normalizeInput(input);

      const acceptedEntries: MemoryInputEntry[] = [];
      let rejectedCount = 0;
      for (const entry of normalized.entries) {
        const content = entry.content?.trim() ?? '';
        if (!content) {
          rejectedCount += 1;
          continue;
        }
        acceptedEntries.push(entry);
      }

      const inBatchHashSet = new Set<string>();
      const memoryRecords: MemoryRecord[] = [];
      let duplicateCount = 0;
      for (const entry of acceptedEntries) {
        const record = createMemoryRecord(normalized.namespace, entry);
        if (normalized.dedupeByHash && inBatchHashSet.has(record.contentHash)) {
          duplicateCount += 1;
          continue;
        }
        inBatchHashSet.add(record.contentHash);
        memoryRecords.push(record);
      }

      const persisted = await store.persist({
        namespace: normalized.namespace,
        records: memoryRecords,
        dedupeByHash: normalized.dedupeByHash,
        dryRun: normalized.dryRun
      });

      return {
        namespace: normalized.namespace,
        dryRun: normalized.dryRun,
        dedupeByHash: normalized.dedupeByHash,
        inputCount: normalized.entries.length,
        acceptedCount: acceptedEntries.length,
        rejectedCount,
        duplicateCount: duplicateCount + persisted.duplicateCount,
        storedCount: persisted.storedRecords.length,
        recordIds: persisted.storedRecords.map((record) => record.recordId),
        storagePath: store.storagePath
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

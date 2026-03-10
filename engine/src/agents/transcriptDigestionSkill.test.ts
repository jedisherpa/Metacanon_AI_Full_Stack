import { describe, expect, it, vi } from 'vitest';

import { createAgentConfig } from './agentConfig.js';
import { type AgentExecutionResult } from './baseExecutor.js';
import { type MemoryPopulationOutput } from './memoryPopulationSkill.js';
import {
  createTranscriptDigestionSkill,
  getDefaultTranscriptDigestionSchedule
} from './transcriptDigestionSkill.js';

function createSkillConfig(overrides: Record<string, unknown> = {}) {
  return createAgentConfig({
    agentId: 'agent-transcript',
    skillId: 'transcript_digestion',
    skillKind: 'transcript_digestion',
    ...overrides
  });
}

function memorySuccess(storedCount: number): AgentExecutionResult<MemoryPopulationOutput> {
  return {
    version: 'v1',
    status: 'success',
    output: {
      namespace: 'transcripts',
      dryRun: false,
      dedupeByHash: true,
      inputCount: storedCount,
      acceptedCount: storedCount,
      rejectedCount: 0,
      duplicateCount: 0,
      storedCount,
      recordIds: Array.from({ length: storedCount }).map((_, index) => `r-${index + 1}`),
      storagePath: '/tmp/memory.ndjson'
    },
    durationMs: 1,
    validation: { allowed: true }
  };
}

describe('transcriptDigestionSkill', () => {
  it('returns default schedule contract (hourly, skip if running)', () => {
    expect(getDefaultTranscriptDigestionSchedule()).toEqual({
      intervalMinutes: 60,
      skipIfRunning: true
    });
  });

  it('blocks when autoPopulateMemory is enabled without callback', async () => {
    const skill = createTranscriptDigestionSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      items: [
        {
          sourceId: 't1',
          transcriptText: 'A transcript'
        }
      ]
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('MEMORY_POPULATION_NOT_CONFIGURED');
    }
  });

  it('digests transcript text and populates memory', async () => {
    const populateMemory = vi.fn(async () => memorySuccess(2));
    const skill = createTranscriptDigestionSkill({
      config: createSkillConfig(),
      populateMemory
    });

    const result = await skill.execute({
      items: [
        {
          sourceId: 'meeting-1',
          transcriptText:
            'First point is to move to local-first compute. Second point is to maintain fallback to cloud providers.'
        }
      ]
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.processedCount).toBe(1);
      expect(result.output.rejectedCount).toBe(0);
      expect(result.output.digests[0]?.sourceId).toBe('meeting-1');
      expect(result.output.memoryPopulation?.status).toBe('success');
      expect(result.output.memoryPopulation?.storedCount).toBe(2);
    }
    expect(populateMemory).toHaveBeenCalledTimes(1);
  });

  it('uses transcription provider for audio sources and chunking for large files', async () => {
    const transcribeAudio = vi
      .fn()
      .mockResolvedValueOnce('Chunk 1 transcript text.')
      .mockResolvedValueOnce('Chunk 2 transcript text.')
      .mockResolvedValueOnce('Chunk 3 transcript text.');
    const populateMemory = vi.fn(async () => memorySuccess(1));
    const skill = createTranscriptDigestionSkill({
      config: createSkillConfig(),
      transcribeAudio,
      populateMemory
    });

    const result = await skill.execute({
      items: [
        {
          sourceId: 'audio-1',
          audioRef: 'file:///audio-1.wav',
          fileSizeBytes: 220 * 1024 * 1024
        }
      ]
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.processedCount).toBe(1);
      expect(result.output.digests[0]?.chunkCount).toBe(3);
    }
    expect(transcribeAudio).toHaveBeenCalledTimes(3);
  });

  it('captures per-source errors and keeps processing remaining items', async () => {
    const populateMemory = vi.fn(async () => memorySuccess(1));
    const skill = createTranscriptDigestionSkill({
      config: createSkillConfig(),
      populateMemory
    });

    const result = await skill.execute({
      items: [
        {
          sourceId: 'broken-source'
        },
        {
          sourceId: 'valid-source',
          transcriptText: 'Valid transcript text for digestion.'
        }
      ]
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.processedCount).toBe(1);
      expect(result.output.rejectedCount).toBe(1);
      expect(result.output.sourceErrors[0]?.sourceId).toBe('broken-source');
    }
  });

  it('blocks when human approval is required', async () => {
    const skill = createTranscriptDigestionSkill({
      config: createSkillConfig({
        security: {
          requireHumanApproval: true
        }
      }),
      populateMemory: async () => memorySuccess(1)
    });

    const result = await skill.execute({
      items: [
        {
          sourceId: 'meeting-2',
          transcriptText: 'Need approval first.'
        }
      ]
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('HUMAN_APPROVAL_REQUIRED');
    }
  });
});

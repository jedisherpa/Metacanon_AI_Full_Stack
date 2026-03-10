import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAgentConfig } from './agentConfig.js';
import {
  createFileMemoryRecordStore,
  createMemoryPopulationSkill,
  getDefaultMemoryPopulationSchedule
} from './memoryPopulationSkill.js';
import { removeDirectoryTree } from './fileOrganizationSkill.js';

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createSkillConfig(overrides: Record<string, unknown> = {}) {
  return createAgentConfig({
    agentId: 'agent-memory',
    skillId: 'memory_population',
    skillKind: 'memory_population',
    ...overrides
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => removeDirectoryTree(dir)));
});

describe('memoryPopulationSkill', () => {
  it('returns default schedule contract (:30 hourly, skip if running)', () => {
    expect(getDefaultMemoryPopulationSchedule()).toEqual({
      cronUtc: '30 * * * *',
      skipIfRunning: true
    });
  });

  it('blocks on empty entry list', async () => {
    const skill = createMemoryPopulationSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      entries: []
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('MEMORY_INPUT_EMPTY');
    }
  });

  it('stores deduped memory records to file store', async () => {
    const dir = await createTempDir('memory-skill-');
    const store = createFileMemoryRecordStore(path.join(dir, 'memory.ndjson'));
    const skill = createMemoryPopulationSkill({
      config: createSkillConfig(),
      store
    });

    const run1 = await skill.execute({
      namespace: 'journal',
      entries: [
        { content: 'I want to focus on deep work', tags: ['focus'] },
        { content: 'I want to focus on deep work', tags: ['focus'] },
        { content: 'Prioritize privacy-first compute', tags: ['privacy'] },
        { content: '   ' }
      ]
    });
    expect(run1.status).toBe('success');
    if (run1.status === 'success') {
      expect(run1.output.namespace).toBe('journal');
      expect(run1.output.acceptedCount).toBe(3);
      expect(run1.output.rejectedCount).toBe(1);
      expect(run1.output.duplicateCount).toBe(1);
      expect(run1.output.storedCount).toBe(2);
      expect(run1.output.recordIds).toHaveLength(2);
    }

    const run2 = await skill.execute({
      namespace: 'journal',
      entries: [{ content: 'Prioritize privacy-first compute' }]
    });
    expect(run2.status).toBe('success');
    if (run2.status === 'success') {
      expect(run2.output.storedCount).toBe(0);
      expect(run2.output.duplicateCount).toBe(1);
    }

    const stored = await readFile(path.join(dir, 'memory.ndjson'), 'utf8');
    const lines = stored
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it('supports dry-run without writing records', async () => {
    const dir = await createTempDir('memory-skill-dry-run-');
    const store = createFileMemoryRecordStore(path.join(dir, 'memory.ndjson'));
    const skill = createMemoryPopulationSkill({
      config: createSkillConfig(),
      store
    });

    const result = await skill.execute({
      dryRun: true,
      entries: [{ content: 'A dry run entry' }]
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.dryRun).toBe(true);
      expect(result.output.storedCount).toBe(1);
    }

    await expect(readFile(path.join(dir, 'memory.ndjson'), 'utf8')).rejects.toThrowError();
  });

  it('blocks when skill requires human approval', async () => {
    const skill = createMemoryPopulationSkill({
      config: createSkillConfig({
        security: {
          requireHumanApproval: true
        }
      })
    });

    const result = await skill.execute({
      entries: [{ content: 'Need approval first' }]
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('HUMAN_APPROVAL_REQUIRED');
    }
  });
});

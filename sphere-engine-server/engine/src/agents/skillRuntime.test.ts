import { describe, expect, it } from 'vitest';

import { createAgentConfig } from './agentConfig.js';
import { type AgentExecutionResult } from './baseExecutor.js';
import { createDefaultSkillRuntime, SkillRuntime } from './skillRuntime.js';

function successResult(payload: unknown): AgentExecutionResult<unknown> {
  return {
    version: 'v1',
    status: 'success',
    output: payload,
    durationMs: 1,
    validation: {
      allowed: true
    }
  };
}

describe('SkillRuntime', () => {
  it('registers and lists skills with baseline metadata', () => {
    const runtime = new SkillRuntime();
    const config = createAgentConfig({
      agentId: 'agent-skill-test',
      skillId: 'test_skill',
      skillKind: 'custom',
      displayName: 'Test Skill',
      schedule: {
        intervalMinutes: 15,
        skipIfRunning: true
      }
    });

    runtime.registerSkill({
      skillId: 'test_skill',
      displayName: 'Test Skill',
      config,
      run: async () => successResult({ ok: true })
    });

    const skills = runtime.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      skillId: 'test_skill',
      displayName: 'Test Skill',
      enabled: true,
      running: false,
      schedule: {
        intervalMinutes: 15,
        skipIfRunning: true
      }
    });
  });

  it('returns blocked run when skip_if_running is true', async () => {
    const runtime = new SkillRuntime();
    const config = createAgentConfig({
      agentId: 'agent-skill-test',
      skillId: 'test_skill',
      skillKind: 'custom',
      schedule: {
        intervalMinutes: 5,
        skipIfRunning: true
      }
    });

    let resolveGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    runtime.registerSkill({
      skillId: 'test_skill',
      displayName: 'Test Skill',
      config,
      run: async () => {
        await gate;
        return successResult({ finished: true });
      }
    });

    const firstRunPromise = runtime.runSkill({
      skillId: 'test_skill',
      input: {}
    });
    const secondRun = await runtime.runSkill({
      skillId: 'test_skill',
      input: {},
      traceId: 'trace-blocked'
    });

    expect(secondRun.result.status).toBe('blocked');
    if (secondRun.result.status === 'blocked') {
      expect(secondRun.result.code).toBe('SKILL_ALREADY_RUNNING');
      expect(secondRun.result.traceId).toBe('trace-blocked');
    }

    resolveGate();
    const firstRun = await firstRunPromise;
    expect(firstRun.result.status).toBe('success');
  });

  it('allows concurrent runs when skip_if_running is false', async () => {
    const runtime = new SkillRuntime();
    const config = createAgentConfig({
      agentId: 'agent-skill-test',
      skillId: 'test_skill',
      skillKind: 'custom',
      schedule: {
        intervalMinutes: 5,
        skipIfRunning: false
      }
    });

    runtime.registerSkill({
      skillId: 'test_skill',
      displayName: 'Test Skill',
      config,
      run: async () => {
        await Promise.resolve();
        return successResult({ ok: true });
      }
    });

    const [runA, runB] = await Promise.all([
      runtime.runSkill({ skillId: 'test_skill', input: {} }),
      runtime.runSkill({ skillId: 'test_skill', input: {} })
    ]);

    expect(runA.result.status).toBe('success');
    expect(runB.result.status).toBe('success');
  });

  it('creates default runtime with file and email skills', () => {
    const runtime = createDefaultSkillRuntime();
    const ids = runtime.listSkills().map((item) => item.skillId);
    expect(ids).toEqual([
      'api_integration',
      'code_writing',
      'content_generation',
      'email_checking',
      'file_organization',
      'memory_population',
      'project_planning',
      'transcript_digestion'
    ]);
  });

  it('throws SKILL_NOT_FOUND for unknown skills', async () => {
    const runtime = createDefaultSkillRuntime();
    await expect(
      runtime.runSkill({
        skillId: 'unknown_skill',
        input: {}
      })
    ).rejects.toMatchObject({
      code: 'SKILL_NOT_FOUND',
      statusCode: 404
    });
  });
});

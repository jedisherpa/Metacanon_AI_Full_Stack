import { describe, expect, it, vi } from 'vitest';

import { createAgentConfig } from './agentConfig.js';
import { createCodeWritingSkill } from './codeWritingSkill.js';

function createSkillConfig(overrides: Record<string, unknown> = {}) {
  return createAgentConfig({
    agentId: 'agent-code',
    skillId: 'code_writing',
    skillKind: 'code_writing',
    ...overrides
  });
}

describe('codeWritingSkill', () => {
  it('blocks invalid objective', async () => {
    const skill = createCodeWritingSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      objective: '  ',
      targetFiles: [{ path: 'src/main.ts' }]
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('CODE_OBJECTIVE_REQUIRED');
    }
  });

  it('blocks target path escaping repo root', async () => {
    const skill = createCodeWritingSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      objective: 'Update implementation',
      repoRoot: '/tmp/project',
      targetFiles: [{ path: '../../etc/passwd' }]
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('CODE_TARGET_PATH_OUTSIDE_REPO');
    }
  });

  it('returns heuristic plan with sandbox governance requirements', async () => {
    const validateAction = vi.fn(async () => ({
      allowed: true
    }));
    const skill = createCodeWritingSkill({
      config: createSkillConfig(),
      validateAction
    });

    const result = await skill.execute({
      objective: 'Add runtime route',
      repoRoot: '/tmp/project',
      targetFiles: [{ path: 'src/routes/runtime.ts' }],
      constraints: ['preserve API shape']
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.filePlans).toHaveLength(1);
      expect(result.output.validation.sandboxRequired).toBe(true);
      expect(result.output.validation.sandboxFlags).toEqual(['--network none', '--read-only']);
      expect(result.output.commit?.status).toBe('not_requested');
    }
    expect(validateAction).toHaveBeenCalledTimes(1);
    expect(validateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sandbox_execute'
      })
    );
  });

  it('blocks commit when validator is missing', async () => {
    const skill = createCodeWritingSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      objective: 'Write feature patch',
      repoRoot: '/tmp/project',
      targetFiles: [{ path: 'src/feature.ts' }],
      commitRequested: true,
      runSandboxValidation: false
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('EXECUTION_FAILED');
      expect(result.message).toContain('validate_action is required for commit');
    }
  });

  it('supports approved commit and push callbacks', async () => {
    const validateAction = vi.fn(async () => ({
      allowed: true
    }));
    const runCommit = vi.fn(async () => ({
      commitSha: 'abc123'
    }));
    const runPush = vi.fn(async () => ({
      remoteRef: 'origin/main'
    }));

    const skill = createCodeWritingSkill({
      config: createSkillConfig(),
      validateAction,
      runCommit,
      runPush
    });

    const result = await skill.execute({
      objective: 'Ship runtime patch',
      repoRoot: '/tmp/project',
      targetFiles: [{ path: 'src/runtime.ts' }],
      commitRequested: true,
      pushRequested: true
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.commit?.status).toBe('committed');
      expect(result.output.commit?.commitSha).toBe('abc123');
      expect(result.output.push?.status).toBe('pushed');
      expect(result.output.push?.remoteRef).toBe('origin/main');
    }
    expect(validateAction).toHaveBeenCalledTimes(3);
    expect(runCommit).toHaveBeenCalledTimes(1);
    expect(runPush).toHaveBeenCalledTimes(1);
  });

  it('blocks when human approval policy is enabled', async () => {
    const skill = createCodeWritingSkill({
      config: createSkillConfig({
        security: {
          requireHumanApproval: true
        }
      })
    });

    const result = await skill.execute({
      objective: 'Update files',
      targetFiles: [{ path: 'src/file.ts' }],
      runSandboxValidation: false
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('HUMAN_APPROVAL_REQUIRED');
    }
  });
});

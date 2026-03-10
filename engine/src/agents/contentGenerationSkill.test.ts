import { describe, expect, it, vi } from 'vitest';

import { createAgentConfig } from './agentConfig.js';
import { createContentGenerationSkill } from './contentGenerationSkill.js';

function createSkillConfig(overrides: Record<string, unknown> = {}) {
  return createAgentConfig({
    agentId: 'agent-content',
    skillId: 'content_generation',
    skillKind: 'content_generation',
    ...overrides
  });
}

describe('contentGenerationSkill', () => {
  it('blocks empty objective', async () => {
    const skill = createContentGenerationSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      objective: '   '
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('CONTENT_OBJECTIVE_REQUIRED');
    }
  });

  it('returns heuristic content draft and validates delivery', async () => {
    const validateAction = vi.fn(async () => ({ allowed: true }));
    const skill = createContentGenerationSkill({
      config: createSkillConfig(),
      validateAction
    });

    const result = await skill.execute({
      objective: 'Explain the new installer runtime to advanced users',
      format: 'article',
      channel: 'web',
      keyPoints: ['State architecture changes clearly', 'Call out migration path'],
      sourceFacts: [
        {
          fact: 'Runtime now includes API integration and code writing skill scaffolds',
          source: 'internal changelog'
        }
      ]
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.format).toBe('article');
      expect(result.output.title.length).toBeGreaterThan(0);
      expect(result.output.body.length).toBeGreaterThan(0);
      expect(result.output.delivery.status).toBe('not_requested');
    }
    expect(validateAction).toHaveBeenCalledTimes(1);
    expect(validateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'content_delivery'
      })
    );
  });

  it('supports publish flow with second validation gate', async () => {
    const validateAction = vi.fn(async () => ({ allowed: true }));
    const publishContent = vi.fn(async () => ({ publishRef: 'cms:post:42' }));
    const skill = createContentGenerationSkill({
      config: createSkillConfig(),
      validateAction,
      publishContent
    });

    const result = await skill.execute({
      objective: 'Create a launch post for MetaCanon',
      format: 'post',
      publishRequested: true
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.delivery.status).toBe('published');
      expect(result.output.delivery.publishRef).toBe('cms:post:42');
    }
    expect(validateAction).toHaveBeenCalledTimes(2);
    expect(validateAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'content_delivery'
      })
    );
    expect(validateAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'content_publish'
      })
    );
    expect(publishContent).toHaveBeenCalledTimes(1);
  });

  it('errors when action validator is missing under validation policy', async () => {
    const skill = createContentGenerationSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      objective: 'Generate release update',
      format: 'email'
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('EXECUTION_FAILED');
      expect(result.message).toContain('validate_action is required');
    }
  });

  it('supports dry-run generation without validator', async () => {
    const skill = createContentGenerationSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      objective: 'Draft social thread',
      format: 'thread',
      dryRun: true
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.delivery.status).toBe('dry_run');
      expect(result.output.wordCount).toBeGreaterThan(0);
    }
  });

  it('blocks when human approval policy is enabled', async () => {
    const skill = createContentGenerationSkill({
      config: createSkillConfig({
        security: {
          requireHumanApproval: true
        }
      })
    });

    const result = await skill.execute({
      objective: 'Generate editorial note',
      dryRun: true
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('HUMAN_APPROVAL_REQUIRED');
    }
  });
});

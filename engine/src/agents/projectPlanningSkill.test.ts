import { describe, expect, it, vi } from 'vitest';

import { createAgentConfig } from './agentConfig.js';
import {
  createProjectPlanningSkill,
  getDefaultProjectPlanningSchedule
} from './projectPlanningSkill.js';

function createSkillConfig(overrides: Record<string, unknown> = {}) {
  return createAgentConfig({
    agentId: 'agent-project-plan',
    skillId: 'project_planning',
    skillKind: 'project_planning',
    ...overrides
  });
}

describe('projectPlanningSkill', () => {
  it('returns default schedule contract (weekdays 09:00 UTC)', () => {
    expect(getDefaultProjectPlanningSchedule()).toEqual({
      cronUtc: '0 9 * * 1-5',
      skipIfRunning: true
    });
  });

  it('blocks invalid objective input', async () => {
    const skill = createProjectPlanningSkill({
      config: createSkillConfig()
    });
    const result = await skill.execute({
      objective: '   '
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('PROJECT_OBJECTIVE_REQUIRED');
    }
  });

  it('returns heuristic plan by default', async () => {
    const skill = createProjectPlanningSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      objective: 'Ship a reliable installer and runtime',
      constraints: ['local-first privacy', 'dual-tier observability'],
      deliverables: ['Installer UX', 'runtime API', 'agent training flow'],
      horizonDays: 45,
      maxMilestones: 5
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.milestones).toHaveLength(5);
      expect(result.output.risks.length).toBeGreaterThan(0);
      expect(result.output.summary).toContain('Ship a reliable installer and runtime');
      expect(result.output.horizonDays).toBe(45);
    }
  });

  it('uses custom generatePlan callback when provided', async () => {
    const generatePlan = vi.fn(async () => ({
      objective: 'Custom objective',
      horizonDays: 14,
      summary: 'Custom plan',
      milestones: [
        {
          milestoneId: 'm1',
          title: 'Custom',
          description: 'Custom description',
          targetDay: 7,
          dependencies: []
        }
      ],
      risks: [],
      nextActions: ['Custom action']
    }));

    const skill = createProjectPlanningSkill({
      config: createSkillConfig(),
      generatePlan
    });

    const result = await skill.execute({
      objective: 'Custom objective'
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.summary).toBe('Custom plan');
      expect(result.output.milestones).toHaveLength(1);
    }
    expect(generatePlan).toHaveBeenCalledTimes(1);
  });

  it('blocks when human approval is required', async () => {
    const skill = createProjectPlanningSkill({
      config: createSkillConfig({
        security: {
          requireHumanApproval: true
        }
      })
    });

    const result = await skill.execute({
      objective: 'Plan a release'
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('HUMAN_APPROVAL_REQUIRED');
    }
  });
});

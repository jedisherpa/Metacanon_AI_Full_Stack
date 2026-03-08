import { type AgentConfig } from './agentConfig.js';
import {
  createBaseExecutor,
  type AgentBoundaryErrorEvent,
  type AgentExecutionAuditEvent,
  type AgentExecutionResult
} from './baseExecutor.js';

const DEFAULT_INTENT = 'skill.project_planning.run';
const DEFAULT_HORIZON_DAYS = 30;
const MAX_HORIZON_DAYS = 365;
const DEFAULT_MAX_MILESTONES = 6;
const MAX_MILESTONES = 20;

export type ProjectPlanningInput = {
  objective: string;
  constraints?: string[];
  deliverables?: string[];
  contextNotes?: string;
  horizonDays?: number;
  maxMilestones?: number;
};

export type ProjectMilestone = {
  milestoneId: string;
  title: string;
  description: string;
  targetDay: number;
  dependencies: string[];
};

export type ProjectRisk = {
  riskId: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
};

export type ProjectPlanningOutput = {
  objective: string;
  horizonDays: number;
  summary: string;
  milestones: ProjectMilestone[];
  risks: ProjectRisk[];
  nextActions: string[];
};

export type ProjectPlanGenerator = (input: {
  objective: string;
  constraints: string[];
  deliverables: string[];
  contextNotes?: string;
  horizonDays: number;
  maxMilestones: number;
}) => Promise<ProjectPlanningOutput>;

export class ProjectPlanningSkillError extends Error {
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

function normalizeInput(input: ProjectPlanningInput): {
  objective: string;
  constraints: string[];
  deliverables: string[];
  contextNotes?: string;
  horizonDays: number;
  maxMilestones: number;
} {
  const objective = input.objective?.trim();
  if (!objective) {
    throw new ProjectPlanningSkillError('PROJECT_OBJECTIVE_REQUIRED', 'objective is required.');
  }

  const constraints = (input.constraints ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 20);
  const deliverables = (input.deliverables ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 20);
  const contextNotes = input.contextNotes?.trim() || undefined;
  const horizonDays = clampInt(input.horizonDays ?? DEFAULT_HORIZON_DAYS, 1, MAX_HORIZON_DAYS);
  const maxMilestones = clampInt(input.maxMilestones ?? DEFAULT_MAX_MILESTONES, 2, MAX_MILESTONES);

  return {
    objective,
    constraints,
    deliverables,
    contextNotes,
    horizonDays,
    maxMilestones
  };
}

function heuristicPlan(input: {
  objective: string;
  constraints: string[];
  deliverables: string[];
  contextNotes?: string;
  horizonDays: number;
  maxMilestones: number;
}): ProjectPlanningOutput {
  const milestoneTitles = [
    'Define Scope And Success Metrics',
    'Set Architecture And Dependencies',
    'Build Core Runtime Slices',
    'Integrate Interfaces And Automations',
    'Test Hardening And Reliability',
    'Release Candidate And Handoff'
  ].slice(0, input.maxMilestones);

  const milestoneCount = milestoneTitles.length;
  const spacing = Math.max(1, Math.floor(input.horizonDays / milestoneCount));
  const milestones: ProjectMilestone[] = milestoneTitles.map((title, index) => ({
    milestoneId: `m${index + 1}`,
    title,
    description:
      index === 0
        ? `Translate objective into explicit acceptance criteria for "${input.objective}".`
        : `Complete ${title.toLowerCase()} while preserving constitutional/runtime invariants.`,
    targetDay: Math.min(input.horizonDays, Math.max(1, (index + 1) * spacing)),
    dependencies: index === 0 ? [] : [`m${index}`]
  }));

  const risks: ProjectRisk[] = [
    {
      riskId: 'r1',
      description: 'Scope growth without milestone gating can delay delivery.',
      impact: 'high',
      mitigation: 'Freeze scope per milestone and route expansions to a backlog.'
    },
    {
      riskId: 'r2',
      description: 'Provider/runtime integration drift can break end-to-end flows.',
      impact: 'high',
      mitigation: 'Run contract tests on each integration merge and pin interface versions.'
    },
    {
      riskId: 'r3',
      description: 'Operational setup complexity can block smooth installs.',
      impact: 'medium',
      mitigation: 'Ship a scripted setup path with one-command health checks.'
    }
  ];

  const nextActions = [
    'Confirm non-negotiable success criteria and explicit out-of-scope items.',
    'Lock milestone owners and delivery dates.',
    'Implement the first milestone with contract tests before moving forward.'
  ];

  const summaryParts = [
    `Objective: ${input.objective}.`,
    `Planning horizon: ${input.horizonDays} days.`,
    `Milestones: ${milestones.length}.`,
    input.deliverables.length > 0 ? `Key deliverables: ${input.deliverables.join('; ')}.` : undefined,
    input.constraints.length > 0 ? `Constraints: ${input.constraints.join('; ')}.` : undefined
  ].filter((item): item is string => !!item);

  return {
    objective: input.objective,
    horizonDays: input.horizonDays,
    summary: summaryParts.join(' '),
    milestones,
    risks,
    nextActions
  };
}

export function getDefaultProjectPlanningSchedule(): {
  cronUtc: '0 9 * * 1-5';
  skipIfRunning: true;
} {
  return {
    cronUtc: '0 9 * * 1-5',
    skipIfRunning: true
  };
}

export function createProjectPlanningSkill(params: {
  config: AgentConfig;
  generatePlan?: ProjectPlanGenerator;
  auditLog?: (event: AgentExecutionAuditEvent) => Promise<void> | void;
  onBoundaryError?: (event: AgentBoundaryErrorEvent) => Promise<void> | void;
}): {
  execute: (
    input: ProjectPlanningInput,
    context?: { traceId?: string; metadata?: Record<string, unknown> }
  ) => Promise<AgentExecutionResult<ProjectPlanningOutput>>;
} {
  const executor = createBaseExecutor<ProjectPlanningInput, ProjectPlanningOutput>({
    validate: async ({ input }) => {
      try {
        normalizeInput(input);
      } catch (error) {
        if (error instanceof ProjectPlanningSkillError) {
          return {
            allowed: false,
            code: error.code,
            message: error.message
          };
        }
        return {
          allowed: false,
          code: 'PROJECT_PLAN_INPUT_INVALID',
          message: 'Invalid project planning input.'
        };
      }
      return { allowed: true };
    },
    execute: async ({ input }) => {
      const normalized = normalizeInput(input);
      if (params.generatePlan) {
        return params.generatePlan(normalized);
      }
      return heuristicPlan(normalized);
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

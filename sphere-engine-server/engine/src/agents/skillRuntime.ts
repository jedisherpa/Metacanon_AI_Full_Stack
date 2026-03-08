import { randomUUID } from 'node:crypto';

import { createAgentConfig, type AgentConfig, type AgentScheduleConfig } from './agentConfig.js';
import { type AgentExecutionResult } from './baseExecutor.js';
import {
  createEmailCheckingSkill,
  getDefaultEmailCheckingSchedule,
  type EmailFetcher
} from './emailCheckingSkill.js';
import { createFileOrganizationSkill } from './fileOrganizationSkill.js';
import {
  createFileMemoryRecordStore,
  createMemoryPopulationSkill,
  getDefaultMemoryPopulationSchedule,
  type MemoryRecordStore
} from './memoryPopulationSkill.js';
import {
  createTranscriptDigestionSkill,
  getDefaultTranscriptDigestionSchedule,
  type TranscriptionProvider
} from './transcriptDigestionSkill.js';
import {
  createProjectPlanningSkill,
  getDefaultProjectPlanningSchedule,
  type ProjectPlanGenerator
} from './projectPlanningSkill.js';
import {
  createCodeWritingSkill,
  type ActionValidator as CodeActionValidator,
  type CodePlanGenerator,
  type CommitRunner,
  type PushRunner
} from './codeWritingSkill.js';
import {
  createContentGenerationSkill,
  type ContentActionValidator,
  type ContentGenerator,
  type ContentPublisher
} from './contentGenerationSkill.js';
import {
  createApiIntegrationSkill,
  InMemoryApiRateLimiter,
  type ApiActionValidator,
  type ApiHttpExecutor,
  type ApiRateLimiter,
  type ApiSecretResolver
} from './apiIntegrationSkill.js';

export type SkillRunContext = {
  traceId?: string;
  metadata?: Record<string, unknown>;
  requestedBy?: string;
};

export type SkillRunner = (
  input: unknown,
  context?: { traceId?: string; metadata?: Record<string, unknown> }
) => Promise<AgentExecutionResult<unknown>>;

export type RegisteredSkill = {
  skillId: string;
  displayName: string;
  config: AgentConfig;
  run: SkillRunner;
};

export type SkillStatusSummary = {
  skillId: string;
  displayName: string;
  enabled: boolean;
  skillKind: string;
  running: boolean;
  schedule?: AgentScheduleConfig;
  lastRun?: {
    runId: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    status: AgentExecutionResult<unknown>['status'];
    code?: string;
  };
};

export type SkillRunRecord = {
  runId: string;
  skillId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  requestedBy?: string;
  traceId?: string;
  result: AgentExecutionResult<unknown>;
};

export class SkillRuntimeError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    options: { statusCode?: number; details?: Record<string, unknown> } = {}
  ) {
    super(message);
    this.code = code;
    this.statusCode = options.statusCode ?? 400;
    this.details = options.details;
  }
}

type InternalSkillState = {
  definition: RegisteredSkill;
  running: boolean;
  lastRun?: SkillRunRecord;
};

function createBlockedResult(reason: {
  message: string;
  code: string;
  traceId?: string;
  durationMs?: number;
}): AgentExecutionResult<unknown> {
  return {
    version: 'v1',
    status: 'blocked',
    code: reason.code,
    message: reason.message,
    durationMs: reason.durationMs ?? 0,
    traceId: reason.traceId,
    validation: {
      allowed: false,
      code: reason.code,
      message: reason.message
    }
  };
}

export class SkillRuntime {
  private readonly skills = new Map<string, InternalSkillState>();

  registerSkill(definition: RegisteredSkill): void {
    const id = definition.skillId.trim();
    if (!id) {
      throw new SkillRuntimeError('SKILL_ID_REQUIRED', 'skillId is required.');
    }
    if (this.skills.has(id)) {
      throw new SkillRuntimeError('SKILL_ALREADY_REGISTERED', `Skill "${id}" already exists.`);
    }

    this.skills.set(id, {
      definition: { ...definition, skillId: id },
      running: false
    });
  }

  listSkills(): SkillStatusSummary[] {
    return [...this.skills.values()]
      .map((state) => {
        const { definition, running, lastRun } = state;
        return {
          skillId: definition.skillId,
          displayName: definition.displayName,
          enabled: definition.config.enabled,
          skillKind: definition.config.skillKind,
          running,
          schedule: definition.config.schedule,
          lastRun: lastRun
            ? {
                runId: lastRun.runId,
                startedAt: lastRun.startedAt,
                completedAt: lastRun.completedAt,
                durationMs: lastRun.durationMs,
                status: lastRun.result.status,
                code:
                  lastRun.result.status === 'blocked' || lastRun.result.status === 'error'
                    ? lastRun.result.code
                    : undefined
              }
            : undefined
        };
      })
      .sort((a, b) => a.skillId.localeCompare(b.skillId));
  }

  getSkillStatus(skillId: string): SkillStatusSummary {
    const state = this.skills.get(skillId.trim());
    if (!state) {
      throw new SkillRuntimeError('SKILL_NOT_FOUND', `Skill "${skillId}" not found.`, {
        statusCode: 404
      });
    }
    return this.listSkills().find((item) => item.skillId === state.definition.skillId)!;
  }

  async runSkill(params: {
    skillId: string;
    input: unknown;
    traceId?: string;
    requestedBy?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SkillRunRecord> {
    const skillId = params.skillId.trim();
    const state = this.skills.get(skillId);
    if (!state) {
      throw new SkillRuntimeError('SKILL_NOT_FOUND', `Skill "${skillId}" not found.`, {
        statusCode: 404
      });
    }

    const skipIfRunning = state.definition.config.schedule?.skipIfRunning ?? true;
    const runId = randomUUID();
    const startedAt = new Date();
    if (state.running && skipIfRunning) {
      const blocked = createBlockedResult({
        code: 'SKILL_ALREADY_RUNNING',
        message: `Skill "${skillId}" is already running and skip_if_running=true.`,
        traceId: params.traceId
      });
      const record: SkillRunRecord = {
        runId,
        skillId,
        startedAt: startedAt.toISOString(),
        completedAt: startedAt.toISOString(),
        durationMs: 0,
        requestedBy: params.requestedBy,
        traceId: params.traceId,
        result: blocked
      };
      state.lastRun = record;
      return record;
    }

    state.running = true;
    try {
      const result = await state.definition.run(params.input, {
        traceId: params.traceId,
        metadata: params.metadata
      });
      const completedAt = new Date();
      const record: SkillRunRecord = {
        runId,
        skillId,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        requestedBy: params.requestedBy,
        traceId: params.traceId,
        result
      };
      state.lastRun = record;
      return record;
    } catch (error) {
      const completedAt = new Date();
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Skill execution failed unexpectedly.';
      const result: AgentExecutionResult<unknown> = {
        version: 'v1',
        status: 'error',
        code: 'SKILL_RUNTIME_ERROR',
        message,
        errorKind: 'internal',
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        traceId: params.traceId,
        validation: {
          allowed: true
        }
      };
      const record: SkillRunRecord = {
        runId,
        skillId,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: result.durationMs,
        requestedBy: params.requestedBy,
        traceId: params.traceId,
        result
      };
      state.lastRun = record;
      return record;
    } finally {
      state.running = false;
    }
  }
}

export function createDefaultSkillRuntime(options: {
  emailFetcher?: EmailFetcher;
  memoryStore?: MemoryRecordStore;
  transcribeAudio?: TranscriptionProvider;
  projectPlanGenerator?: ProjectPlanGenerator;
  codePlanGenerator?: CodePlanGenerator;
  codeActionValidator?: CodeActionValidator;
  codeCommitRunner?: CommitRunner;
  codePushRunner?: PushRunner;
  contentGenerator?: ContentGenerator;
  contentActionValidator?: ContentActionValidator;
  contentPublisher?: ContentPublisher;
  apiAllowedHosts?: string[];
  apiExecuteHttp?: ApiHttpExecutor;
  apiResolveSecret?: ApiSecretResolver;
  apiValidateAction?: ApiActionValidator;
  apiRateLimiter?: ApiRateLimiter;
} = {}): SkillRuntime {
  const runtime = new SkillRuntime();

  const fileOrganizationConfig = createAgentConfig({
    agentId: 'agent-skill-file-org',
    skillId: 'file_organization',
    skillKind: 'file_organization',
    displayName: 'File Organization',
    schedule: {
      cronUtc: '0 2 * * *',
      skipIfRunning: true
    }
  });
  const fileOrganizationSkill = createFileOrganizationSkill({
    config: fileOrganizationConfig
  });
  runtime.registerSkill({
    skillId: 'file_organization',
    displayName: 'File Organization',
    config: fileOrganizationConfig,
    run: async (input, context) => {
      return fileOrganizationSkill.execute(input as never, context);
    }
  });

  const emailCheckingSchedule = getDefaultEmailCheckingSchedule();
  const emailCheckingConfig = createAgentConfig({
    agentId: 'agent-skill-email',
    skillId: 'email_checking',
    skillKind: 'email_checking',
    displayName: 'Email Checking',
    schedule: emailCheckingSchedule
  });
  const emailCheckingSkill = createEmailCheckingSkill({
    config: emailCheckingConfig,
    fetchEmails: options.emailFetcher
  });
  runtime.registerSkill({
    skillId: 'email_checking',
    displayName: 'Email Checking',
    config: emailCheckingConfig,
    run: async (input, context) => {
      return emailCheckingSkill.execute(input as never, context);
    }
  });

  const memoryPopulationConfig = createAgentConfig({
    agentId: 'agent-skill-memory',
    skillId: 'memory_population',
    skillKind: 'memory_population',
    displayName: 'Memory Population',
    schedule: getDefaultMemoryPopulationSchedule()
  });
  const memoryPopulationSkill = createMemoryPopulationSkill({
    config: memoryPopulationConfig,
    store: options.memoryStore ?? createFileMemoryRecordStore()
  });
  runtime.registerSkill({
    skillId: 'memory_population',
    displayName: 'Memory Population',
    config: memoryPopulationConfig,
    run: async (input, context) => {
      return memoryPopulationSkill.execute(input as never, context);
    }
  });

  const transcriptDigestionConfig = createAgentConfig({
    agentId: 'agent-skill-transcript',
    skillId: 'transcript_digestion',
    skillKind: 'transcript_digestion',
    displayName: 'Transcript Digestion',
    schedule: getDefaultTranscriptDigestionSchedule()
  });
  const transcriptDigestionSkill = createTranscriptDigestionSkill({
    config: transcriptDigestionConfig,
    transcribeAudio: options.transcribeAudio,
    populateMemory: async (input, context) => {
      return memoryPopulationSkill.execute(input, context);
    }
  });
  runtime.registerSkill({
    skillId: 'transcript_digestion',
    displayName: 'Transcript Digestion',
    config: transcriptDigestionConfig,
    run: async (input, context) => {
      return transcriptDigestionSkill.execute(input as never, context);
    }
  });

  const projectPlanningConfig = createAgentConfig({
    agentId: 'agent-skill-project-plan',
    skillId: 'project_planning',
    skillKind: 'project_planning',
    displayName: 'Project Planning',
    schedule: getDefaultProjectPlanningSchedule()
  });
  const projectPlanningSkill = createProjectPlanningSkill({
    config: projectPlanningConfig,
    generatePlan: options.projectPlanGenerator
  });
  runtime.registerSkill({
    skillId: 'project_planning',
    displayName: 'Project Planning',
    config: projectPlanningConfig,
    run: async (input, context) => {
      return projectPlanningSkill.execute(input as never, context);
    }
  });

  const codeWritingConfig = createAgentConfig({
    agentId: 'agent-skill-code',
    skillId: 'code_writing',
    skillKind: 'code_writing',
    displayName: 'Code Writing'
  });
  const codeWritingSkill = createCodeWritingSkill({
    config: codeWritingConfig,
    generatePlan: options.codePlanGenerator,
    validateAction: options.codeActionValidator,
    runCommit: options.codeCommitRunner,
    runPush: options.codePushRunner
  });
  runtime.registerSkill({
    skillId: 'code_writing',
    displayName: 'Code Writing',
    config: codeWritingConfig,
    run: async (input, context) => {
      return codeWritingSkill.execute(input as never, context);
    }
  });

  const contentGenerationConfig = createAgentConfig({
    agentId: 'agent-skill-content',
    skillId: 'content_generation',
    skillKind: 'content_generation',
    displayName: 'Content Generation'
  });
  const contentGenerationSkill = createContentGenerationSkill({
    config: contentGenerationConfig,
    generateContent: options.contentGenerator,
    validateAction: options.contentActionValidator,
    publishContent: options.contentPublisher
  });
  runtime.registerSkill({
    skillId: 'content_generation',
    displayName: 'Content Generation',
    config: contentGenerationConfig,
    run: async (input, context) => {
      return contentGenerationSkill.execute(input as never, context);
    }
  });

  const apiIntegrationConfig = createAgentConfig({
    agentId: 'agent-skill-api',
    skillId: 'api_integration',
    skillKind: 'api_integration',
    displayName: 'API Integration'
  });
  const apiIntegrationSkill = createApiIntegrationSkill({
    config: apiIntegrationConfig,
    allowedHosts: options.apiAllowedHosts,
    executeHttp: options.apiExecuteHttp,
    resolveSecret: options.apiResolveSecret,
    validateAction: options.apiValidateAction,
    rateLimiter:
      options.apiRateLimiter ??
      new InMemoryApiRateLimiter({
        maxRequests: 60,
        windowMs: 60_000
      })
  });
  runtime.registerSkill({
    skillId: 'api_integration',
    displayName: 'API Integration',
    config: apiIntegrationConfig,
    run: async (input, context) => {
      return apiIntegrationSkill.execute(input as never, context);
    }
  });

  return runtime;
}

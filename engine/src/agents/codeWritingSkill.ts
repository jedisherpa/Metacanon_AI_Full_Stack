import path from 'node:path';

import { type AgentConfig } from './agentConfig.js';
import {
  createBaseExecutor,
  type AgentBoundaryErrorEvent,
  type AgentExecutionAuditEvent,
  type AgentExecutionResult
} from './baseExecutor.js';

const DEFAULT_INTENT = 'skill.code_writing.run';
const DEFAULT_MAX_FILES = 12;
const MAX_FILES = 100;
const DEFAULT_MAX_OBJECTIVE_CHARS = 2_000;

export type CodeTargetFile = {
  path: string;
  purpose?: string;
};

export type CodeFilePlan = {
  path: string;
  summary: string;
  changeType: 'create' | 'modify' | 'delete';
  patchPreview: string;
};

export type CodeWritingInput = {
  objective: string;
  repoRoot?: string;
  targetFiles: CodeTargetFile[];
  constraints?: string[];
  contextNotes?: string;
  commitRequested?: boolean;
  pushRequested?: boolean;
  runSandboxValidation?: boolean;
};

export type CodeWritingOutput = {
  objective: string;
  repoRoot: string;
  targetFiles: string[];
  planSteps: string[];
  filePlans: CodeFilePlan[];
  validation: {
    sandboxRequired: true;
    sandboxFlags: string[];
    commitValidationRequired: true;
    pushValidationRequired: true;
  };
  commit?: {
    status: 'not_requested' | 'approved_pending_manual' | 'committed';
    commitSha?: string;
    message: string;
  };
  push?: {
    status: 'not_requested' | 'approved_pending_manual' | 'pushed';
    remoteRef?: string;
    message: string;
  };
};

export type ActionValidationRequest = {
  action: 'commit' | 'push' | 'sandbox_execute';
  payload: Record<string, unknown>;
};

export type ActionValidationResult = {
  allowed: boolean;
  code?: string;
  message?: string;
};

export type ActionValidator = (
  request: ActionValidationRequest
) => Promise<ActionValidationResult> | ActionValidationResult;

export type CommitRunner = (params: {
  objective: string;
  targetFiles: string[];
}) => Promise<{ commitSha: string }>;

export type PushRunner = (params: {
  objective: string;
  targetFiles: string[];
}) => Promise<{ remoteRef: string }>;

export type CodePlanGenerator = (params: {
  objective: string;
  repoRoot: string;
  targetFiles: string[];
  constraints: string[];
  contextNotes?: string;
}) => Promise<{
  planSteps: string[];
  filePlans: CodeFilePlan[];
}>;

export class CodeWritingSkillError extends Error {
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

function resolveRepoRoot(rawRepoRoot: string | undefined): string {
  const base = rawRepoRoot?.trim() || process.cwd();
  return path.resolve(base);
}

function ensureTargetPathSafe(targetPath: string, repoRoot: string): string {
  const trimmed = targetPath.trim();
  if (!trimmed) {
    throw new CodeWritingSkillError('CODE_TARGET_PATH_INVALID', 'target file path cannot be empty.');
  }
  if (trimmed.includes('\0')) {
    throw new CodeWritingSkillError('CODE_TARGET_PATH_INVALID', 'target file path contains invalid characters.');
  }

  const candidate = path.resolve(repoRoot, trimmed);
  if (!(candidate === repoRoot || candidate.startsWith(`${repoRoot}${path.sep}`))) {
    throw new CodeWritingSkillError(
      'CODE_TARGET_PATH_OUTSIDE_REPO',
      `target file path "${targetPath}" is outside repo root.`
    );
  }
  return path.relative(repoRoot, candidate).replace(/\\/g, '/');
}

function normalizeInput(input: CodeWritingInput): {
  objective: string;
  repoRoot: string;
  targetFiles: string[];
  constraints: string[];
  contextNotes?: string;
  commitRequested: boolean;
  pushRequested: boolean;
  runSandboxValidation: boolean;
} {
  const objective = input.objective?.trim();
  if (!objective) {
    throw new CodeWritingSkillError('CODE_OBJECTIVE_REQUIRED', 'objective is required.');
  }
  if (objective.length > DEFAULT_MAX_OBJECTIVE_CHARS) {
    throw new CodeWritingSkillError(
      'CODE_OBJECTIVE_TOO_LONG',
      `objective exceeds ${DEFAULT_MAX_OBJECTIVE_CHARS} characters.`
    );
  }

  if (!Array.isArray(input.targetFiles) || input.targetFiles.length === 0) {
    throw new CodeWritingSkillError(
      'CODE_TARGET_FILES_REQUIRED',
      'targetFiles must include at least one path.'
    );
  }

  const repoRoot = resolveRepoRoot(input.repoRoot);
  const maxFiles = clampInt(input.targetFiles.length, 1, MAX_FILES);
  const targetFiles = input.targetFiles
    .slice(0, maxFiles)
    .map((file) => ensureTargetPathSafe(file.path, repoRoot));

  const constraints = (input.constraints ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
  const contextNotes = input.contextNotes?.trim() || undefined;

  const commitRequested = input.commitRequested ?? false;
  const pushRequested = input.pushRequested ?? false;
  const runSandboxValidation = input.runSandboxValidation ?? true;

  if (pushRequested && !commitRequested) {
    throw new CodeWritingSkillError(
      'CODE_PUSH_REQUIRES_COMMIT',
      'pushRequested requires commitRequested=true.'
    );
  }

  return {
    objective,
    repoRoot,
    targetFiles,
    constraints,
    contextNotes,
    commitRequested,
    pushRequested,
    runSandboxValidation
  };
}

function buildHeuristicPlan(input: {
  objective: string;
  targetFiles: string[];
  constraints: string[];
}): {
  planSteps: string[];
  filePlans: CodeFilePlan[];
} {
  const constraintHints = input.constraints.join('; ');
  const planSteps = [
    'Review target files and current interfaces before generating edits.',
    'Draft minimal patch set to satisfy objective while preserving behavior.',
    'Run sandboxed validation (`docker --network none --read-only`) before any commit.',
    'Send diff to constitutional validator (`validate_action`) before commit/push.'
  ];
  const filePlans = input.targetFiles
    .slice(0, DEFAULT_MAX_FILES)
    .map((filePath, index) => ({
      path: filePath,
      summary: `Implement objective changes in ${filePath}.`,
      changeType: 'modify' as const,
      patchPreview: [
        `# File ${index + 1}: ${filePath}`,
        `# Objective: ${input.objective}`,
        constraintHints ? `# Constraints: ${constraintHints}` : undefined,
        '// TODO: apply focused implementation patch'
      ]
        .filter((line): line is string => !!line)
        .join('\n')
    }));
  return {
    planSteps,
    filePlans
  };
}

async function ensureActionAllowed(params: {
  validator?: ActionValidator;
  action: ActionValidationRequest['action'];
  payload: Record<string, unknown>;
}): Promise<void> {
  if (!params.validator) {
    throw new CodeWritingSkillError(
      'ACTION_VALIDATOR_REQUIRED',
      `validate_action is required for ${params.action}.`
    );
  }
  const result = await params.validator({
    action: params.action,
    payload: params.payload
  });
  if (!result.allowed) {
    throw new CodeWritingSkillError(
      result.code ?? 'ACTION_VALIDATION_REJECTED',
      result.message ?? `${params.action} rejected by validator.`
    );
  }
}

export function createCodeWritingSkill(params: {
  config: AgentConfig;
  generatePlan?: CodePlanGenerator;
  validateAction?: ActionValidator;
  runCommit?: CommitRunner;
  runPush?: PushRunner;
  auditLog?: (event: AgentExecutionAuditEvent) => Promise<void> | void;
  onBoundaryError?: (event: AgentBoundaryErrorEvent) => Promise<void> | void;
}): {
  execute: (
    input: CodeWritingInput,
    context?: { traceId?: string; metadata?: Record<string, unknown> }
  ) => Promise<AgentExecutionResult<CodeWritingOutput>>;
} {
  const executor = createBaseExecutor<CodeWritingInput, CodeWritingOutput>({
    validate: async ({ input }) => {
      try {
        normalizeInput(input);
      } catch (error) {
        if (error instanceof CodeWritingSkillError) {
          return {
            allowed: false,
            code: error.code,
            message: error.message
          };
        }
        return {
          allowed: false,
          code: 'CODE_WRITING_INPUT_INVALID',
          message: 'Invalid code writing input.'
        };
      }
      return {
        allowed: true
      };
    },
    execute: async ({ input }) => {
      const normalized = normalizeInput(input);
      const generated = params.generatePlan
        ? await params.generatePlan({
            objective: normalized.objective,
            repoRoot: normalized.repoRoot,
            targetFiles: normalized.targetFiles,
            constraints: normalized.constraints,
            contextNotes: normalized.contextNotes
          })
        : buildHeuristicPlan({
            objective: normalized.objective,
            targetFiles: normalized.targetFiles,
            constraints: normalized.constraints
          });

      if (normalized.runSandboxValidation) {
        await ensureActionAllowed({
          validator: params.validateAction,
          action: 'sandbox_execute',
          payload: {
            objective: normalized.objective,
            targetFiles: normalized.targetFiles,
            sandboxFlags: ['--network none', '--read-only']
          }
        });
      }

      let commit: CodeWritingOutput['commit'] = {
        status: 'not_requested',
        message: 'Commit not requested.'
      };
      if (normalized.commitRequested) {
        await ensureActionAllowed({
          validator: params.validateAction,
          action: 'commit',
          payload: {
            objective: normalized.objective,
            targetFiles: normalized.targetFiles,
            filePlans: generated.filePlans
          }
        });

        if (params.runCommit) {
          const commitResult = await params.runCommit({
            objective: normalized.objective,
            targetFiles: normalized.targetFiles
          });
          commit = {
            status: 'committed',
            commitSha: commitResult.commitSha,
            message: 'Commit executed after validate_action approval.'
          };
        } else {
          commit = {
            status: 'approved_pending_manual',
            message: 'Commit approved; manual commit execution pending.'
          };
        }
      }

      let push: CodeWritingOutput['push'] = {
        status: 'not_requested',
        message: 'Push not requested.'
      };
      if (normalized.pushRequested) {
        await ensureActionAllowed({
          validator: params.validateAction,
          action: 'push',
          payload: {
            objective: normalized.objective,
            targetFiles: normalized.targetFiles,
            commitStatus: commit.status
          }
        });

        if (params.runPush) {
          const pushResult = await params.runPush({
            objective: normalized.objective,
            targetFiles: normalized.targetFiles
          });
          push = {
            status: 'pushed',
            remoteRef: pushResult.remoteRef,
            message: 'Push executed after validate_action approval.'
          };
        } else {
          push = {
            status: 'approved_pending_manual',
            message: 'Push approved; manual push execution pending.'
          };
        }
      }

      return {
        objective: normalized.objective,
        repoRoot: normalized.repoRoot,
        targetFiles: normalized.targetFiles,
        planSteps: generated.planSteps,
        filePlans: generated.filePlans,
        validation: {
          sandboxRequired: true,
          sandboxFlags: ['--network none', '--read-only'],
          commitValidationRequired: true,
          pushValidationRequired: true
        },
        commit,
        push
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

import { type AgentConfig } from './agentConfig.js';

export const AGENT_EXECUTOR_VERSION = 'v1' as const;

export type AgentExecutionStatus = 'success' | 'blocked' | 'error';
export type AgentErrorKind = 'ffi' | 'internal';
export type AgentExecutionStage = 'validation' | 'execution';

export type AgentExecutionRequest<TInput> = {
  config: AgentConfig;
  intent: string;
  input: TInput;
  traceId?: string;
  metadata?: Record<string, unknown>;
};

export type AgentValidationResult = {
  allowed: boolean;
  code?: string;
  message?: string;
  requiresHumanApproval?: boolean;
  metadata?: Record<string, unknown>;
};

export type AgentExecutionAuditEvent = {
  version: typeof AGENT_EXECUTOR_VERSION;
  timestamp: string;
  agentId: string;
  skillId: string;
  skillKind: string;
  intent: string;
  status: AgentExecutionStatus;
  durationMs: number;
  traceId?: string;
  code?: string;
  message?: string;
  errorKind?: AgentErrorKind;
  metadata?: Record<string, unknown>;
};

type AgentExecutionBaseResult = {
  version: typeof AGENT_EXECUTOR_VERSION;
  durationMs: number;
  traceId?: string;
  validation: AgentValidationResult;
};

export type AgentExecutionSuccess<TOutput> = AgentExecutionBaseResult & {
  status: 'success';
  output: TOutput;
};

export type AgentExecutionBlocked = AgentExecutionBaseResult & {
  status: 'blocked';
  code: string;
  message: string;
};

export type AgentExecutionError = AgentExecutionBaseResult & {
  status: 'error';
  code: string;
  message: string;
  errorKind: AgentErrorKind;
};

export type AgentExecutionResult<TOutput> =
  | AgentExecutionSuccess<TOutput>
  | AgentExecutionBlocked
  | AgentExecutionError;

export type AgentValidator<TInput> = (
  request: AgentExecutionRequest<TInput>
) => Promise<AgentValidationResult> | AgentValidationResult;

export type AgentExecutor<TInput, TOutput> = (
  request: AgentExecutionRequest<TInput>
) => Promise<TOutput>;

export type AgentBoundaryErrorEvent = {
  stage: AgentExecutionStage;
  code: string;
  message: string;
  errorKind: AgentErrorKind;
  request: Pick<AgentExecutionRequest<unknown>, 'traceId' | 'intent'> & {
    agentId: string;
    skillId: string;
    skillKind: string;
  };
  cause: unknown;
};

export type BaseExecutorOptions<TInput, TOutput> = {
  validate?: AgentValidator<TInput>;
  execute: AgentExecutor<TInput, TOutput>;
  auditLog?: (event: AgentExecutionAuditEvent) => Promise<void> | void;
  onBoundaryError?: (event: AgentBoundaryErrorEvent) => Promise<void> | void;
  now?: () => number;
  defaultTimeoutMs?: number;
};

type NormalizedExecutorError = {
  code: string;
  message: string;
  errorKind: AgentErrorKind;
};

function readErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }
  return 'Unknown execution error.';
}

function hasErrorCode(err: unknown): boolean {
  if (typeof err !== 'object' || err == null) {
    return false;
  }
  return 'code' in err && typeof (err as { code?: unknown }).code === 'string';
}

function readErrorCode(err: unknown): string | undefined {
  if (!hasErrorCode(err)) {
    return undefined;
  }
  return ((err as { code: string }).code ?? '').trim() || undefined;
}

function isFfiBoundaryError(err: unknown): boolean {
  const code = readErrorCode(err)?.toLowerCase() ?? '';
  if (code.includes('ffi') || code.includes('napi') || code.includes('native')) {
    return true;
  }

  const message = readErrorMessage(err).toLowerCase();
  if (
    message.includes('ffi') ||
    message.includes('napi') ||
    message.includes('native module') ||
    message.includes('rust bridge') ||
    message.includes('napi-rs')
  ) {
    return true;
  }

  if (err instanceof Error) {
    const name = err.name.toLowerCase();
    if (name.includes('ffi') || name.includes('napi')) {
      return true;
    }
  }

  return false;
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function normalizeError(stage: AgentExecutionStage, err: unknown): NormalizedExecutorError {
  const message = readErrorMessage(err);
  if (isFfiBoundaryError(err)) {
    return {
      code: stage === 'validation' ? 'FFI_VALIDATION_ERROR' : 'FFI_EXECUTION_ERROR',
      message,
      errorKind: 'ffi'
    };
  }

  if (message.toLowerCase().includes('timed out')) {
    return {
      code: 'AGENT_TIMEOUT',
      message,
      errorKind: 'internal'
    };
  }

  return {
    code: stage === 'validation' ? 'VALIDATION_FAILED' : 'EXECUTION_FAILED',
    message,
    errorKind: 'internal'
  };
}

async function safeAudit(
  auditLog: BaseExecutorOptions<never, never>['auditLog'] | undefined,
  event: AgentExecutionAuditEvent
): Promise<void> {
  if (!auditLog) {
    return;
  }
  try {
    await auditLog(event);
  } catch {
    // Audit logging should never crash execution.
  }
}

async function safeBoundaryError(
  onBoundaryError: BaseExecutorOptions<never, never>['onBoundaryError'] | undefined,
  event: AgentBoundaryErrorEvent
): Promise<void> {
  if (!onBoundaryError) {
    return;
  }
  try {
    await onBoundaryError(event);
  } catch {
    // Boundary error hooks are best-effort and intentionally non-fatal.
  }
}

export function createBaseExecutor<TInput, TOutput>(options: BaseExecutorOptions<TInput, TOutput>): {
  readonly version: typeof AGENT_EXECUTOR_VERSION;
  execute: (request: AgentExecutionRequest<TInput>) => Promise<AgentExecutionResult<TOutput>>;
} {
  const now = options.now ?? Date.now;

  return {
    version: AGENT_EXECUTOR_VERSION,
    execute: async (request: AgentExecutionRequest<TInput>): Promise<AgentExecutionResult<TOutput>> => {
      const startedAt = now();
      const auditBase = {
        version: AGENT_EXECUTOR_VERSION,
        timestamp: new Date().toISOString(),
        agentId: request.config.agentId,
        skillId: request.config.skillId,
        skillKind: request.config.skillKind,
        intent: request.intent,
        traceId: request.traceId
      };

      const finalizeDuration = (): number => Math.max(0, now() - startedAt);

      if (!request.config.enabled) {
        const validation: AgentValidationResult = {
          allowed: false,
          code: 'AGENT_DISABLED',
          message: 'Agent is disabled and cannot execute tasks.'
        };
        const result: AgentExecutionBlocked = {
          version: AGENT_EXECUTOR_VERSION,
          status: 'blocked',
          code: validation.code ?? 'BLOCKED',
          message: validation.message ?? 'Execution blocked.',
          durationMs: finalizeDuration(),
          traceId: request.traceId,
          validation
        };
        await safeAudit(options.auditLog, {
          ...auditBase,
          status: result.status,
          code: result.code,
          message: result.message,
          durationMs: result.durationMs
        });
        return result;
      }

      let validation: AgentValidationResult = { allowed: true };
      if (options.validate) {
        try {
          validation = await options.validate(request);
        } catch (err) {
          const normalized = normalizeError('validation', err);
          const durationMs = finalizeDuration();
          const result: AgentExecutionError = {
            version: AGENT_EXECUTOR_VERSION,
            status: 'error',
            code: normalized.code,
            message: normalized.message,
            errorKind: normalized.errorKind,
            durationMs,
            traceId: request.traceId,
            validation: { allowed: false, code: normalized.code, message: normalized.message }
          };

          await safeBoundaryError(options.onBoundaryError, {
            stage: 'validation',
            code: normalized.code,
            message: normalized.message,
            errorKind: normalized.errorKind,
            request: {
              agentId: request.config.agentId,
              skillId: request.config.skillId,
              skillKind: request.config.skillKind,
              intent: request.intent,
              traceId: request.traceId
            },
            cause: err
          });

          await safeAudit(options.auditLog, {
            ...auditBase,
            status: result.status,
            code: result.code,
            message: result.message,
            durationMs: result.durationMs,
            errorKind: result.errorKind
          });
          return result;
        }
      }

      const requiresHumanApproval =
        validation.requiresHumanApproval || request.config.security?.requireHumanApproval;
      if (!validation.allowed || requiresHumanApproval) {
        const blockedCode = requiresHumanApproval
          ? 'HUMAN_APPROVAL_REQUIRED'
          : (validation.code ?? 'VALIDATION_BLOCKED');
        const blockedMessage = requiresHumanApproval
          ? 'Execution requires explicit human approval.'
          : (validation.message ?? 'Execution blocked by validation policy.');

        const result: AgentExecutionBlocked = {
          version: AGENT_EXECUTOR_VERSION,
          status: 'blocked',
          code: blockedCode,
          message: blockedMessage,
          durationMs: finalizeDuration(),
          traceId: request.traceId,
          validation: {
            ...validation,
            allowed: false,
            code: blockedCode,
            message: blockedMessage
          }
        };

        await safeAudit(options.auditLog, {
          ...auditBase,
          status: result.status,
          code: result.code,
          message: result.message,
          durationMs: result.durationMs
        });
        return result;
      }

      try {
        const timeoutMs = request.config.compute?.timeoutMs ?? options.defaultTimeoutMs;
        const output =
          timeoutMs && timeoutMs > 0
            ? await runWithTimeout(options.execute(request), timeoutMs)
            : await options.execute(request);

        const result: AgentExecutionSuccess<TOutput> = {
          version: AGENT_EXECUTOR_VERSION,
          status: 'success',
          output,
          durationMs: finalizeDuration(),
          traceId: request.traceId,
          validation
        };
        await safeAudit(options.auditLog, {
          ...auditBase,
          status: result.status,
          durationMs: result.durationMs
        });
        return result;
      } catch (err) {
        const normalized = normalizeError('execution', err);
        const result: AgentExecutionError = {
          version: AGENT_EXECUTOR_VERSION,
          status: 'error',
          code: normalized.code,
          message: normalized.message,
          errorKind: normalized.errorKind,
          durationMs: finalizeDuration(),
          traceId: request.traceId,
          validation
        };

        await safeBoundaryError(options.onBoundaryError, {
          stage: 'execution',
          code: normalized.code,
          message: normalized.message,
          errorKind: normalized.errorKind,
          request: {
            agentId: request.config.agentId,
            skillId: request.config.skillId,
            skillKind: request.config.skillKind,
            intent: request.intent,
            traceId: request.traceId
          },
          cause: err
        });

        await safeAudit(options.auditLog, {
          ...auditBase,
          status: result.status,
          code: result.code,
          message: result.message,
          durationMs: result.durationMs,
          errorKind: result.errorKind
        });
        return result;
      }
    }
  };
}

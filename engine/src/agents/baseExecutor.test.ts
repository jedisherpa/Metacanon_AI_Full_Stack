import { describe, expect, it, vi } from 'vitest';

import { createAgentConfig } from './agentConfig.js';
import { AGENT_EXECUTOR_VERSION, createBaseExecutor } from './baseExecutor.js';

function buildConfig(overrides: Record<string, unknown> = {}) {
  return createAgentConfig({
    agentId: 'agent-alpha',
    skillId: 'skill-001',
    skillKind: 'custom',
    ...overrides
  });
}

describe('createBaseExecutor', () => {
  it('returns success with validation and audit events', async () => {
    const validate = vi.fn().mockResolvedValue({ allowed: true });
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const auditLog = vi.fn().mockResolvedValue(undefined);

    const executor = createBaseExecutor({
      validate,
      execute,
      auditLog
    });

    const result = await executor.execute({
      config: buildConfig(),
      intent: 'skill.run',
      input: { query: 'hello' },
      traceId: 'trace-1'
    });

    expect(executor.version).toBe(AGENT_EXECUTOR_VERSION);
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.version).toBe(AGENT_EXECUTOR_VERSION);
      expect(result.output).toEqual({ ok: true });
      expect(result.validation).toEqual({ allowed: true });
    }
    expect(validate).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        agentId: 'agent-alpha',
        skillId: 'skill-001',
        intent: 'skill.run'
      })
    );
  });

  it('blocks execution when agent is disabled', async () => {
    const execute = vi.fn();
    const auditLog = vi.fn().mockResolvedValue(undefined);
    const executor = createBaseExecutor({
      execute,
      auditLog
    });

    const result = await executor.execute({
      config: buildConfig({ enabled: false }),
      intent: 'skill.run',
      input: {}
    });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('AGENT_DISABLED');
    }
    expect(execute).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it('blocks execution when validation denies the action', async () => {
    const validate = vi.fn().mockResolvedValue({
      allowed: false,
      code: 'POLICY_DENIED',
      message: 'Denied by policy.'
    });
    const execute = vi.fn();
    const executor = createBaseExecutor({
      validate,
      execute
    });

    const result = await executor.execute({
      config: buildConfig(),
      intent: 'tool.call',
      input: {}
    });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('POLICY_DENIED');
      expect(result.message).toBe('Denied by policy.');
    }
    expect(validate).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns ffi execution error without throwing and emits boundary event', async () => {
    const onBoundaryError = vi.fn().mockResolvedValue(undefined);
    const auditLog = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockRejectedValue(
      Object.assign(new Error('napi bridge unavailable'), {
        code: 'NAPI_CALL_FAILED'
      })
    );
    const executor = createBaseExecutor({
      execute,
      onBoundaryError,
      auditLog
    });

    const result = await executor.execute({
      config: buildConfig(),
      intent: 'tool.call',
      input: { payload: true },
      traceId: 'trace-ffi'
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('FFI_EXECUTION_ERROR');
      expect(result.errorKind).toBe('ffi');
      expect(result.message).toContain('napi bridge unavailable');
    }
    expect(onBoundaryError).toHaveBeenCalledTimes(1);
    expect(onBoundaryError).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'execution',
        code: 'FFI_EXECUTION_ERROR',
        errorKind: 'ffi'
      })
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        code: 'FFI_EXECUTION_ERROR',
        errorKind: 'ffi'
      })
    );
  });

  it('returns validation ffi error when validator crashes', async () => {
    const validate = vi.fn().mockRejectedValue(
      Object.assign(new Error('ffi validation unavailable'), {
        code: 'FFI_DOWN'
      })
    );
    const execute = vi.fn();
    const onBoundaryError = vi.fn().mockResolvedValue(undefined);
    const executor = createBaseExecutor({
      validate,
      execute,
      onBoundaryError
    });

    const result = await executor.execute({
      config: buildConfig(),
      intent: 'skill.validate',
      input: {}
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('FFI_VALIDATION_ERROR');
      expect(result.errorKind).toBe('ffi');
    }
    expect(execute).not.toHaveBeenCalled();
    expect(onBoundaryError).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'validation',
        code: 'FFI_VALIDATION_ERROR'
      })
    );
  });

  it('treats audit logger failures as non-fatal', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const auditLog = vi.fn().mockRejectedValue(new Error('audit backend down'));
    const executor = createBaseExecutor({
      execute,
      auditLog
    });

    const result = await executor.execute({
      config: buildConfig(),
      intent: 'skill.run',
      input: {}
    });

    expect(result.status).toBe('success');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it('enforces timeout from compute policy', async () => {
    const execute = vi.fn(
      async () => await new Promise((resolve) => setTimeout(() => resolve('done'), 35))
    );
    const executor = createBaseExecutor({
      execute
    });

    const result = await executor.execute({
      config: buildConfig({
        compute: {
          timeoutMs: 10
        }
      }),
      intent: 'skill.run',
      input: {}
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('AGENT_TIMEOUT');
      expect(result.errorKind).toBe('internal');
    }
  });
});

import { describe, expect, it, vi } from 'vitest';

import { createAgentConfig } from './agentConfig.js';
import { createApiIntegrationSkill, InMemoryApiRateLimiter } from './apiIntegrationSkill.js';

function createSkillConfig(overrides: Record<string, unknown> = {}) {
  return createAgentConfig({
    agentId: 'agent-api',
    skillId: 'api_integration',
    skillKind: 'api_integration',
    ...overrides
  });
}

describe('apiIntegrationSkill', () => {
  it('blocks invalid endpoint host outside allowlist', async () => {
    const skill = createApiIntegrationSkill({
      config: createSkillConfig(),
      allowedHosts: ['api.example.com']
    });

    const result = await skill.execute({
      integrationId: 'test',
      endpoint: 'https://evil.example.net/data',
      method: 'GET'
    });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('API_HOST_NOT_ALLOWED');
    }
  });

  it('supports dry-run request planning without validator', async () => {
    const executeHttp = vi.fn();
    const skill = createApiIntegrationSkill({
      config: createSkillConfig(),
      executeHttp
    });

    const result = await skill.execute({
      integrationId: 'github',
      endpoint: 'https://api.github.com/repos/meta/project',
      method: 'GET',
      headers: {
        Authorization: 'Bearer abc'
      },
      dryRun: true
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.attempts).toBe(0);
      expect(result.output.request.dryRun).toBe(true);
      expect(result.output.request.headers.authorization).toBe('[REDACTED]');
    }
    expect(executeHttp).not.toHaveBeenCalled();
  });

  it('blocks outbound call without validate_action when required', async () => {
    const skill = createApiIntegrationSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      integrationId: 'github',
      endpoint: 'https://api.github.com/repos/meta/project',
      method: 'GET'
    });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('ACTION_VALIDATOR_NOT_CONFIGURED');
    }
  });

  it('executes API call with validator + secret resolution + query', async () => {
    const executeHttp = vi.fn(async () => ({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-ratelimit-remaining': '42'
      },
      bodyText: '{"ok":true,"message":"done"}'
    }));
    const validateAction = vi.fn(async () => ({
      allowed: true
    }));
    const resolveSecret = vi.fn(async () => 'resolved-token');

    const skill = createApiIntegrationSkill({
      config: createSkillConfig(),
      executeHttp,
      validateAction,
      resolveSecret
    });

    const result = await skill.execute({
      integrationId: 'github',
      endpoint: 'https://api.github.com/repos/meta/project',
      method: 'GET',
      query: {
        per_page: 10
      },
      authRef: 'secret://github/token'
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.attempts).toBe(1);
      expect(result.output.response?.status).toBe(200);
      expect(result.output.response?.body).toEqual({
        ok: true,
        message: 'done'
      });
      expect(result.output.rateLimit?.remaining).toBe(42);
      expect(result.output.request.url).toContain('per_page=10');
    }

    expect(validateAction).toHaveBeenCalledTimes(1);
    expect(resolveSecret).toHaveBeenCalledWith('secret://github/token');
    expect(executeHttp).toHaveBeenCalledTimes(1);
    expect(executeHttp).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer resolved-token'
        })
      })
    );
  });

  it('retries on 429 and succeeds on subsequent attempt', async () => {
    const executeHttp = vi
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        headers: {
          'retry-after': '1'
        },
        bodyText: 'rate limited'
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        bodyText: '{"ok":true}'
      });
    const skill = createApiIntegrationSkill({
      config: createSkillConfig(),
      executeHttp,
      validateAction: async () => ({ allowed: true }),
      sleep: async () => {}
    });

    const result = await skill.execute({
      integrationId: 'vercel',
      endpoint: 'https://api.vercel.com/v1/projects',
      method: 'GET',
      maxRetries: 2
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.attempts).toBe(2);
      expect(result.output.response?.status).toBe(200);
    }
  });

  it('enforces per-integration rate limiter', async () => {
    const limiter = new InMemoryApiRateLimiter({
      maxRequests: 1,
      windowMs: 60_000,
      now: () => 1000
    });
    const skill = createApiIntegrationSkill({
      config: createSkillConfig(),
      rateLimiter: limiter,
      validateAction: async () => ({ allowed: true }),
      executeHttp: async () => ({
        status: 200,
        headers: {},
        bodyText: '{}'
      })
    });

    const first = await skill.execute({
      integrationId: 'github',
      endpoint: 'https://api.github.com/user',
      method: 'GET'
    });
    expect(first.status).toBe('success');

    const second = await skill.execute({
      integrationId: 'github',
      endpoint: 'https://api.github.com/user',
      method: 'GET'
    });
    expect(second.status).toBe('blocked');
    if (second.status === 'blocked') {
      expect(second.code).toBe('API_RATE_LIMITED');
    }
  });

  it('blocks when human approval is required', async () => {
    const skill = createApiIntegrationSkill({
      config: createSkillConfig({
        security: {
          requireHumanApproval: true
        }
      }),
      validateAction: async () => ({ allowed: true }),
      executeHttp: async () => ({
        status: 200,
        headers: {},
        bodyText: '{}'
      })
    });

    const result = await skill.execute({
      integrationId: 'github',
      endpoint: 'https://api.github.com/user',
      method: 'GET'
    });
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('HUMAN_APPROVAL_REQUIRED');
    }
  });
});

import { describe, expect, it, vi } from 'vitest';

import { createAgentConfig } from './agentConfig.js';
import { createEmailCheckingSkill, getDefaultEmailCheckingSchedule } from './emailCheckingSkill.js';

function createSkillConfig(overrides: Record<string, unknown> = {}) {
  return createAgentConfig({
    agentId: 'agent-email',
    skillId: 'skill-email-checking',
    skillKind: 'email_checking',
    ...overrides
  });
}

function buildMessages(count: number) {
  return Array.from({ length: count }).map((_, index) => ({
    messageId: `m-${index + 1}`,
    from: `sender-${index + 1}@example.com`,
    subject: index % 10 === 0 ? 'Action required now' : `Subject ${index + 1}`,
    preview: `Preview ${index + 1}`,
    receivedAt: new Date(2026, 2, 1, 10, 0, index).toISOString()
  }));
}

describe('emailCheckingSkill', () => {
  it('exposes default schedule contract (30 minutes, skip if running)', () => {
    const schedule = getDefaultEmailCheckingSchedule();
    expect(schedule).toEqual({
      intervalMinutes: 30,
      skipIfRunning: true
    });
  });

  it('blocks execution when fetch adapter is not configured', async () => {
    const skill = createEmailCheckingSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      accountId: 'primary',
      credentialRef: 'secret://mail/main'
    });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('EMAIL_FETCHER_NOT_CONFIGURED');
    }
  });

  it('blocks invalid credential reference format', async () => {
    const skill = createEmailCheckingSkill({
      config: createSkillConfig(),
      fetchEmails: async () => ({ messages: [] })
    });

    const result = await skill.execute({
      accountId: 'primary',
      credentialRef: 'plaintext-token'
    });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('INVALID_CREDENTIAL_REF');
    }
  });

  it('enforces batch size ceiling of 50 and summarizes in batches', async () => {
    const allMessages = buildMessages(120);
    const fetchCalls: Array<{ cursor?: string; limit: number }> = [];
    const summarizeBatch = vi.fn(async ({ batchIndex, messages }) => ({
      batchIndex,
      messageCount: messages.length,
      summary: `Batch ${batchIndex} has ${messages.length} messages`,
      urgentMessageIds: []
    }));

    const skill = createEmailCheckingSkill({
      config: createSkillConfig(),
      fetchEmails: async ({ cursor, limit }) => {
        fetchCalls.push({ cursor, limit });
        const offset = cursor ? Number(cursor) : 0;
        const page = allMessages.slice(offset, offset + limit);
        const nextCursor = offset + page.length < allMessages.length ? String(offset + page.length) : undefined;
        return {
          messages: page,
          nextCursor
        };
      },
      summarizeBatch
    });

    const result = await skill.execute({
      accountId: 'primary',
      credentialRef: 'secret://mail/main',
      batchSize: 90,
      maxMessages: 120
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.batchSize).toBe(50);
      expect(result.output.totalFetched).toBe(120);
      expect(result.output.totalBatches).toBe(3);
      expect(result.output.summaries.map((batch) => batch.messageCount)).toEqual([50, 50, 20]);
    }
    expect(summarizeBatch).toHaveBeenCalledTimes(3);
    expect(fetchCalls.map((call) => call.limit)).toEqual([50, 50, 20]);
  });

  it('retries with exponential backoff and eventually succeeds', async () => {
    const sleepCalls: number[] = [];
    const fetchEmails = vi
      .fn()
      .mockRejectedValueOnce(new Error('imap timeout #1'))
      .mockRejectedValueOnce(new Error('imap timeout #2'))
      .mockResolvedValueOnce({
        messages: buildMessages(2),
        nextCursor: undefined
      });

    const skill = createEmailCheckingSkill({
      config: createSkillConfig(),
      fetchEmails,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      }
    });

    const result = await skill.execute({
      accountId: 'primary',
      credentialRef: 'secret://mail/main',
      maxMessages: 2,
      maxRetries: 3
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.totalFetched).toBe(2);
      expect(result.output.fetchAttempts).toBe(3);
    }
    expect(fetchEmails).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([250, 500]);
  });

  it('returns non-throwing error when fetch keeps failing', async () => {
    const skill = createEmailCheckingSkill({
      config: createSkillConfig(),
      fetchEmails: async () => {
        throw new Error('imap auth failed');
      },
      sleep: async () => {}
    });

    const result = await skill.execute({
      accountId: 'primary',
      credentialRef: 'secret://mail/main',
      maxRetries: 1
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('EXECUTION_FAILED');
      expect(result.message).toContain('imap auth failed');
    }
  });

  it('blocks when security policy requires human approval', async () => {
    const skill = createEmailCheckingSkill({
      config: createSkillConfig({
        security: {
          requireHumanApproval: true
        }
      }),
      fetchEmails: async () => ({
        messages: buildMessages(1)
      })
    });

    const result = await skill.execute({
      accountId: 'primary',
      credentialRef: 'secret://mail/main'
    });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('HUMAN_APPROVAL_REQUIRED');
    }
  });
});

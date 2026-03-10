import { describe, expect, it, vi } from 'vitest';

import {
  createEnvSecretResolver,
  createHttpEmailFetcher,
  EmailSkillProviderError
} from './emailSkillProviders.js';

describe('emailSkillProviders', () => {
  it('resolves secret from static map first', async () => {
    const resolver = createEnvSecretResolver({
      staticMap: {
        'secret://mail/main': 'imap-user:imap-pass'
      }
    });

    await expect(resolver('secret://mail/main')).resolves.toBe('imap-user:imap-pass');
  });

  it('resolves secret from env key derived from credentialRef', async () => {
    const resolver = createEnvSecretResolver({
      envVars: {
        METACANON_SECRET_MAIL_MAIN: 'env-secret-value'
      }
    });

    await expect(resolver('secret://mail/main')).resolves.toBe('env-secret-value');
  });

  it('throws SECRET_NOT_FOUND for missing references', async () => {
    const resolver = createEnvSecretResolver({
      envVars: {}
    });

    await expect(resolver('secret://mail/missing')).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND'
    });
  });

  it('throws SECRET_MAP_JSON_INVALID when JSON map is malformed', () => {
    expect(() =>
      createEnvSecretResolver({
        secretMapJson: '{not-valid'
      })
    ).toThrowError(EmailSkillProviderError);
  });

  it('calls email adapter with resolved credential and token', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://email-adapter.local/fetch');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)?.authorization).toBe('Bearer adapter-token');
      const body = JSON.parse(String(init?.body));
      expect(body.credential).toBe('resolved-secret');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            {
              id: 'm-1',
              from: 'owner@example.com',
              subject: 'Hello',
              snippet: 'preview',
              received_at: '2026-03-06T10:00:00.000Z'
            }
          ],
          nextCursor: 'cursor-2'
        })
      } as Response;
    });

    const fetcher = createHttpEmailFetcher({
      adapterUrl: 'https://email-adapter.local',
      adapterToken: 'adapter-token',
      secretResolver: async () => 'resolved-secret',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const page = await fetcher({
      accountId: 'primary',
      credentialRef: 'secret://mail/main',
      limit: 50
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(page.messages).toEqual([
      {
        messageId: 'm-1',
        from: 'owner@example.com',
        subject: 'Hello',
        preview: 'preview',
        receivedAt: '2026-03-06T10:00:00.000Z',
        threadId: undefined
      }
    ]);
    expect(page.nextCursor).toBe('cursor-2');
  });

  it('throws EMAIL_ADAPTER_HTTP_ERROR on non-2xx response', async () => {
    const fetcher = createHttpEmailFetcher({
      adapterUrl: 'https://email-adapter.local',
      secretResolver: async () => 'resolved-secret',
      fetchImpl: (async () =>
        ({
          ok: false,
          status: 503,
          text: async () => 'Service unavailable'
        }) as Response) as typeof fetch
    });

    await expect(
      fetcher({
        accountId: 'primary',
        credentialRef: 'secret://mail/main',
        limit: 10
      })
    ).rejects.toMatchObject({
      code: 'EMAIL_ADAPTER_HTTP_ERROR'
    });
  });
});

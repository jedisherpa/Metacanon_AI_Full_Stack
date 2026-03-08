import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import {
  createEmailAdapterApp,
  createProviderFromEnv,
  createProxyEmailProvider,
  createStubEmailProvider,
  EmailAdapterServiceError
} from './service.js';

describe('emailAdapter service', () => {
  it('returns health response', async () => {
    const app = createEmailAdapterApp({
      provider: createStubEmailProvider()
    });

    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      service: 'metacanon-email-adapter'
    });
  });

  it('requires bearer token when adapter token configured', async () => {
    const app = createEmailAdapterApp({
      provider: createStubEmailProvider(),
      adapterToken: 'adapter-token'
    });

    const response = await request(app).post('/fetch').send({
      accountId: 'primary',
      credential: 'secret',
      limit: 1
    });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('EMAIL_ADAPTER_AUTH_REQUIRED');
  });

  it('returns page results from stub provider with cursor', async () => {
    const app = createEmailAdapterApp({
      provider: createStubEmailProvider({
        inboxByAccount: {
          primary: [
            {
              messageId: 'm1',
              from: 'a@example.com',
              subject: 'one',
              receivedAt: '2026-03-06T12:00:00.000Z'
            },
            {
              id: 'm2',
              from: 'b@example.com',
              snippet: 'preview',
              received_at: '2026-03-06T12:01:00.000Z'
            }
          ]
        }
      })
    });

    const first = await request(app).post('/fetch').send({
      accountId: 'primary',
      credential: 'x',
      limit: 1
    });
    expect(first.status).toBe(200);
    expect(first.body.messages).toHaveLength(1);
    expect(first.body.nextCursor).toBe('1');

    const second = await request(app).post('/fetch').send({
      accountId: 'primary',
      credential: 'x',
      limit: 1,
      cursor: first.body.nextCursor
    });
    expect(second.status).toBe(200);
    expect(second.body.messages).toHaveLength(1);
    expect(second.body.nextCursor).toBeUndefined();
  });

  it('returns 400 for invalid payload shape', async () => {
    const app = createEmailAdapterApp({
      provider: createStubEmailProvider()
    });

    const response = await request(app).post('/fetch').send({
      accountId: '',
      credential: 'x',
      limit: 99
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('EMAIL_ADAPTER_INPUT_INVALID');
  });

  it('supports proxy provider and normalizes result', async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            {
              id: 'm-1',
              from: 'x@example.com',
              snippet: 'hello',
              received_at: '2026-03-06T13:00:00.000Z'
            }
          ],
          nextCursor: 'next-1'
        })
      } as Response;
    });

    const provider = createProxyEmailProvider({
      upstreamUrl: 'https://upstream.local',
      upstreamToken: 'upstream-token',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const output = await provider.fetchInbox({
      accountId: 'primary',
      credential: 'x',
      limit: 10
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(output.messages).toEqual([
      {
        messageId: 'm-1',
        from: 'x@example.com',
        preview: 'hello',
        receivedAt: '2026-03-06T13:00:00.000Z'
      }
    ]);
    expect(output.nextCursor).toBe('next-1');
  });

  it('creates provider from env in stub mode', async () => {
    const provider = createProviderFromEnv({
      env: {
        EMAIL_ADAPTER_PROVIDER: 'stub',
        EMAIL_ADAPTER_STUB_INBOX_JSON: JSON.stringify({
          primary: [
            {
              messageId: 'm1',
              from: 'x@example.com',
              receivedAt: '2026-03-06T13:10:00.000Z'
            }
          ]
        })
      }
    });

    const output = await provider.fetchInbox({
      accountId: 'primary',
      credential: 'x',
      limit: 10
    });
    expect(output.messages).toHaveLength(1);
  });

  it('throws on invalid provider mode in env', () => {
    expect(() =>
      createProviderFromEnv({
        env: {
          EMAIL_ADAPTER_PROVIDER: 'unsupported'
        }
      })
    ).toThrowError(EmailAdapterServiceError);
  });

  it('creates imap provider from env mode', () => {
    const provider = createProviderFromEnv({
      env: {
        EMAIL_ADAPTER_PROVIDER: 'imap'
      }
    });
    expect(provider).toBeDefined();
    expect(typeof provider.fetchInbox).toBe('function');
  });
});

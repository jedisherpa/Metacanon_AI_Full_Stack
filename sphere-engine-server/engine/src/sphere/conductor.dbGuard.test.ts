import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

function setEnv(): void {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://council:council@localhost:5432/council';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
  process.env.LENS_PACK = process.env.LENS_PACK || 'hands-of-the-void';
  process.env.ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'test-password';
  process.env.KIMI_API_KEY = process.env.KIMI_API_KEY || 'test-kimi-key';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token';
  process.env.WS_TOKEN_SECRET =
    process.env.WS_TOKEN_SECRET || '12345678901234567890123456789012';
}

describe('SphereConductor DB write guard', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  beforeAll(() => {
    setEnv();
  });

  it('routes sphere_events writes through metacanon_append_sphere_event', async () => {
    const { SphereConductor } = await import('./conductor.js');
    const conductor = Object.create(SphereConductor.prototype) as {
      appendSphereEvent: (
        client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
        params: {
          threadId: string;
          sequence: number;
          messageId: string;
          authorDid: string;
          intent: string;
          timestamp: string;
          clientEnvelope: Record<string, unknown>;
          ledgerEnvelope: Record<string, unknown>;
          payload: Record<string, unknown>;
          entryHash: string;
        }
      ) => Promise<void>;
    };
    const query = vi.fn<(sql: string, params: unknown[]) => Promise<void>>(
      async (_sql, _params) => undefined
    );
    const client = {
      query
    };

    await conductor.appendSphereEvent(client, {
      threadId: '11111111-1111-4111-8111-111111111111',
      sequence: 1,
      messageId: '22222222-2222-4222-8222-222222222222',
      authorDid: 'did:example:agent',
      intent: 'MISSION_REPORT',
      timestamp: '2026-03-07T00:00:00.000Z',
      clientEnvelope: { messageId: '22222222-2222-4222-8222-222222222222' },
      ledgerEnvelope: { sequence: 1 },
      payload: { ok: true },
      entryHash: 'abc123'
    });

    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('metacanon_append_sphere_event');
    expect(query.mock.calls[0]?.[1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      1,
      '22222222-2222-4222-8222-222222222222',
      'did:example:agent',
      'MISSION_REPORT',
      '2026-03-07T00:00:00.000Z',
      JSON.stringify({ messageId: '22222222-2222-4222-8222-222222222222' }),
      JSON.stringify({ sequence: 1 }),
      JSON.stringify({ ok: true }),
      'abc123'
    ]);
  });

  it('installs sphere_events trigger guard in schema bootstrap SQL', async () => {
    const poolQuery = vi.fn<(sql: string) => Promise<void>>(async (_sql) => undefined);
    vi.doMock('../db/client.js', () => ({
      pool: {
        query: poolQuery
      }
    }));

    const { SphereConductor } = await import('./conductor.js');
    const conductor = Object.create(SphereConductor.prototype) as {
      ensureSchema: () => Promise<void>;
    };

    await conductor.ensureSchema();

    expect(poolQuery).toHaveBeenCalledTimes(1);
    const schemaSql = String(poolQuery.mock.calls[0][0]);
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS sphere_event_write_tokens');
    expect(schemaSql).toContain('metacanon_append_sphere_event');
    expect(schemaSql).toContain('REVOKE ALL ON FUNCTION metacanon_append_sphere_event');
    expect(schemaSql).toContain('metacanon_apply_sphere_app_role_grants');
    expect(schemaSql).toContain('REVOKE ALL ON FUNCTION metacanon_apply_sphere_app_role_grants(TEXT)');
    expect(schemaSql).toContain('enforce_sphere_events_conductor_guard');
    expect(schemaSql).toContain('FROM sphere_event_write_tokens');
    expect(schemaSql).toContain('CREATE TRIGGER trg_sphere_events_conductor_guard');
  });
});

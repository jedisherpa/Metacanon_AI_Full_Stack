import { beforeAll, describe, expect, it } from 'vitest';

let normalizeSetLikeStrings: (values: string[] | undefined) => string[];
let createGovernanceHashSnapshot: (
  value:
    | {
        highRiskRegistryHash?: string;
        contactLensPackHash?: string;
        governanceConfigHash?: string;
      }
    | undefined
) => {
  highRiskRegistryHash: string;
  contactLensPackHash: string;
  governanceConfigHash: string;
};

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

describe('conductor set-like canonicalization', () => {
  beforeAll(async () => {
    setEnv();
    const conductorModule = await import('./conductor.js');
    normalizeSetLikeStrings = conductorModule.normalizeSetLikeStrings as (
      values: string[] | undefined
    ) => string[];
    createGovernanceHashSnapshot = conductorModule.createGovernanceHashSnapshot as typeof createGovernanceHashSnapshot;
  });

  it('normalizes set-like string arrays deterministically', () => {
    const base = ['did:example:counselor-2', 'did:example:counselor-1'];
    const permuted = [' did:example:counselor-1 ', 'did:example:counselor-2', ''];

    expect(normalizeSetLikeStrings(base)).toEqual([
      'did:example:counselor-1',
      'did:example:counselor-2'
    ]);
    expect(normalizeSetLikeStrings(permuted)).toEqual([
      'did:example:counselor-1',
      'did:example:counselor-2'
    ]);
  });

  it('deduplicates and drops empty values', () => {
    expect(
      normalizeSetLikeStrings([
        'did:example:counselor-1',
        'did:example:counselor-1',
        '  ',
        '',
        'did:example:counselor-2'
      ])
    ).toEqual(['did:example:counselor-1', 'did:example:counselor-2']);
  });

  it('creates governance hash snapshot with deterministic fallbacks for missing values', () => {
    const snapshotA = createGovernanceHashSnapshot(undefined);
    const snapshotB = createGovernanceHashSnapshot({
      highRiskRegistryHash: '   ',
      contactLensPackHash: '',
      governanceConfigHash: ' '
    });

    expect(snapshotA.highRiskRegistryHash).toBe(snapshotA.contactLensPackHash);
    expect(snapshotA.contactLensPackHash).toBe(snapshotA.governanceConfigHash);
    expect(snapshotB).toEqual(snapshotA);
  });

  it('preserves provided governance hashes', () => {
    const snapshot = createGovernanceHashSnapshot({
      highRiskRegistryHash: 'aaa',
      contactLensPackHash: 'bbb',
      governanceConfigHash: 'ccc'
    });

    expect(snapshot).toEqual({
      highRiskRegistryHash: 'aaa',
      contactLensPackHash: 'bbb',
      governanceConfigHash: 'ccc'
    });
  });
});

import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://council:council@localhost:5432/council';
  process.env.ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'test-password';
  process.env.MORPHEUS_BASE_URL = process.env.MORPHEUS_BASE_URL || 'https://api.mor.org/api/v1';
  process.env.MORPHEUS_API_KEY = process.env.MORPHEUS_API_KEY || 'test';
  process.env.MORPHEUS_MODEL = process.env.MORPHEUS_MODEL || 'model';
  process.env.MORPHEUS_ORCHESTRATOR_MODEL = process.env.MORPHEUS_ORCHESTRATOR_MODEL || 'model';
  process.env.MORPHEUS_FALLBACK_MODEL = process.env.MORPHEUS_FALLBACK_MODEL || 'model';
  process.env.GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test';
  process.env.GROQ_MODEL = process.env.GROQ_MODEL || 'model';
  process.env.GROQ_ORCHESTRATOR_MODEL = process.env.GROQ_ORCHESTRATOR_MODEL || 'model';
  process.env.GROQ_FALLBACK_API_KEY = process.env.GROQ_FALLBACK_API_KEY || 'test';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
  process.env.LENS_PACK = process.env.LENS_PACK || 'hands-of-the-void';
});

describe('queue constants', () => {
  it('uses expected queue name', async () => {
    const mod = await import('./boss.js');
    expect(mod.GAME_COMMAND_QUEUE).toBe('game.command');
  });
});

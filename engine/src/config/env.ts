import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  LLM_PROVIDER_DEFAULT: z.enum(['morpheus', 'groq', 'kimi', 'auto']).default('kimi'),
  RUNTIME_ENV: z.enum(['local', 'staging', 'production']).default(
    process.env.NODE_ENV === 'production' ? 'production' : 'local'
  ),
  MISSION_STUB_FALLBACK_ENABLED: z.coerce.boolean().default(true),
  GOVERNANCE_DIR: z.string().optional(),
  GOVERNANCE_CONFIG_PATH: z.string().default('governance/governance.yaml'),
  CONDUCTOR_PRIVATE_KEY: z.string().min(1).default('dev-conductor-secret'),

  // Morpheus (optional, kept for backward compat)
  MORPHEUS_BASE_URL: z.string().url().optional().default('https://api.openai.com/v1'),
  MORPHEUS_API_KEY: z.string().min(1).optional().default('placeholder'),
  MORPHEUS_MODEL: z.string().min(1).optional().default('gpt-4o-mini'),
  MORPHEUS_ORCHESTRATOR_MODEL: z.string().min(1).optional().default('gpt-4o-mini'),
  MORPHEUS_FALLBACK_MODEL: z.string().min(1).optional().default('gpt-4o-mini'),

  // Groq (optional)
  GROQ_BASE_URL: z.string().url().optional().default('https://api.groq.com/openai/v1'),
  GROQ_API_KEY: z.string().min(1).optional().default('placeholder'),
  GROQ_MODEL: z.string().min(1).optional().default('llama-3.3-70b-versatile'),
  GROQ_ORCHESTRATOR_MODEL: z.string().min(1).optional().default('llama-3.3-70b-versatile'),
  GROQ_FALLBACK_API_KEY: z.string().min(1).optional().default('placeholder'),

  // Kimi (Moonshot AI) — primary provider
  KIMI_BASE_URL: z.string().url().default('https://api.moonshot.cn/v1'),
  KIMI_API_KEY: z.string().min(1),
  KIMI_MODEL: z.string().min(1).default('moonshot-v1-8k'),
  KIMI_ORCHESTRATOR_MODEL: z.string().min(1).default('moonshot-v1-32k'),
  KIMI_FALLBACK_MODEL: z.string().min(1).default('moonshot-v1-8k'),

  LLM_RETRY_DELAY_MS: z.coerce.number().int().positive().default(1000),
  LLM_HEALTH_CHECK_DELAY_MS: z.coerce.number().int().positive().default(15000),

  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGINS: z.string().min(1),

  LENS_PACK: z.string().min(1),
  DEFAULT_GROUP_SIZE: z.coerce.number().int().min(3).max(12).default(6),
  POSITION_REVEAL_SECONDS: z.coerce.number().int().min(5).max(120).default(15),

  ADMIN_PANEL_PASSWORD: z.string().min(8),
  ADMIN_SESSION_COOKIE: z.string().min(1).default('admin_session'),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  SESSION_SECURE_COOKIES: z.coerce.boolean().default(true),

  PG_BOSS_SCHEMA: z.string().min(1).default('pgboss'),
  COMMAND_MAX_RETRIES: z.coerce.number().int().min(0).max(20).default(5),
  INLINE_WORKER_ENABLED: z.coerce.boolean().default(true),

  // Telegram Mini App
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  WS_TOKEN_SECRET: z.string().min(32),

  SENTRY_DSN: z.string().optional()
});

const parsedEnv = envSchema.parse(process.env);

if (parsedEnv.RUNTIME_ENV === 'production' && parsedEnv.MISSION_STUB_FALLBACK_ENABLED) {
  throw new Error(
    'MISSION_STUB_FALLBACK_ENABLED must be false in production. Stub fallback is only permitted in local/staging.'
  );
}

export const env = parsedEnv;

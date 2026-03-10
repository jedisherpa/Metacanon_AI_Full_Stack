import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const strictBoolEnv = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === '') {
      return false;
    }
  }
  return value;
}, z.boolean());

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  return value;
}, z.string().min(1).optional());

const optionalIsoDatetimeString = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  return value;
}, z.string().datetime().optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  LLM_PROVIDER_DEFAULT: z.enum(['morpheus', 'groq', 'kimi', 'auto']).default('kimi'),
  RUNTIME_ENV: z.enum(['local', 'staging', 'production']).default(
    process.env.NODE_ENV === 'production' ? 'production' : 'local'
  ),
  MISSION_STUB_FALLBACK_ENABLED: strictBoolEnv.default(true),
  GOVERNANCE_DIR: z.string().optional(),
  GOVERNANCE_CONFIG_PATH: z.string().default('governance/governance.yaml'),
  CONDUCTOR_PRIVATE_KEY: z.string().min(1).default('dev-conductor-secret'),
  CONDUCTOR_ED25519_PRIVATE_KEY: optionalNonEmptyString,
  CONDUCTOR_ED25519_KEY_ID: optionalNonEmptyString,
  CONDUCTOR_ED25519_PUBLIC_KEYS_JSON: optionalNonEmptyString,
  SPHERE_BFF_SERVICE_TOKEN: z.string().min(16).default('dev-sphere-bff-service-token'),
  SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES: strictBoolEnv.default(false),
  SPHERE_BFF_AGENT_API_KEYS: z.string().default(''),
  SPHERE_THREAD_ENABLED: strictBoolEnv.default(true),
  SPHERE_C2_ALIAS_ENABLED: strictBoolEnv.default(true),
  SPHERE_SIGNATURE_VERIFICATION: z.enum(['off', 'did_key', 'strict']).default('did_key'),
  SPHERE_LEDGER_REQUIRE_V2_SIGNATURE: strictBoolEnv.default(false),
  SPHERE_LEDGER_V2_ACTIVATION_AT: optionalIsoDatetimeString,
  SPHERE_LEDGER_V2_GRACE_DAYS: z.coerce.number().int().min(0).default(0),
  SPHERE_ACK_REQUIRE_VERIFIED_SIGNATURES: strictBoolEnv.default(false),
  SPHERE_ACK_VERIFIED_SIGNATURES_ACTIVATION_AT: optionalIsoDatetimeString,
  SPHERE_ACK_VERIFIED_SIGNATURES_GRACE_DAYS: z.coerce.number().int().min(0).default(0),
  SPHERE_DB_ENFORCE_ROLE_SEPARATION: strictBoolEnv.default(false),
  SPHERE_DB_APP_ROLE: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .optional(),

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
  HYBRID_EXEC_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  HYBRID_EXTERNAL_PROVIDERS: z.string().min(1).default('morpheus,groq'),
  EXTERNAL_AGENT_ADAPTER_URL: z.string().url().optional(),
  EXTERNAL_AGENT_ADAPTER_TOKEN: z.string().min(1).optional(),

  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGINS: z.string().min(1),

  LENS_PACK: z.string().min(1),
  DEFAULT_GROUP_SIZE: z.coerce.number().int().min(3).max(12).default(6),
  POSITION_REVEAL_SECONDS: z.coerce.number().int().min(5).max(120).default(15),

  ADMIN_PANEL_PASSWORD: z.string().min(8),
  ADMIN_SESSION_COOKIE: z.string().min(1).default('admin_session'),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  SESSION_SECURE_COOKIES: strictBoolEnv.default(true),

  PG_BOSS_SCHEMA: z.string().min(1).default('pgboss'),
  COMMAND_MAX_RETRIES: z.coerce.number().int().min(0).max(20).default(5),
  INLINE_WORKER_ENABLED: strictBoolEnv.default(true),

  // Telegram Mini App
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  WS_TOKEN_SECRET: z.string().min(32),
  TELEGRAM_AUTH_DEV_BYPASS_ENABLED: strictBoolEnv.default(false),
  TELEGRAM_AUTH_DEV_BYPASS_USER_ID: z.string().default('900000001'),
  TELEGRAM_AUTH_DEV_BYPASS_FIRST_NAME: z.string().default('Local'),
  TELEGRAM_AUTH_DEV_BYPASS_USERNAME: z.string().default('local_dev'),
  TELEGRAM_MESSAGE_BRIDGE_ENABLED: strictBoolEnv.default(false),
  TELEGRAM_BRIDGE_POLL_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(50).default(30),
  TELEGRAM_BRIDGE_ERROR_BACKOFF_MS: z.coerce.number().int().positive().default(3000),

  // Agent skills (optional adapter wiring)
  EMAIL_SKILL_ADAPTER_URL: z.string().url().optional(),
  EMAIL_SKILL_ADAPTER_TOKEN: z.string().min(1).optional(),
  EMAIL_SKILL_SECRET_MAP_JSON: z.string().optional(),

  SENTRY_DSN: z.string().optional()
});

const parsedEnv = envSchema.parse(process.env);

if (parsedEnv.RUNTIME_ENV === 'production' && parsedEnv.MISSION_STUB_FALLBACK_ENABLED) {
  throw new Error(
    'MISSION_STUB_FALLBACK_ENABLED must be false in production. Stub fallback is only permitted in local/staging.'
  );
}

if (parsedEnv.RUNTIME_ENV === 'production' && parsedEnv.CONDUCTOR_PRIVATE_KEY === 'dev-conductor-secret') {
  throw new Error('CONDUCTOR_PRIVATE_KEY must be set to a non-default value in production.');
}

if (parsedEnv.RUNTIME_ENV === 'production' && parsedEnv.SPHERE_SIGNATURE_VERIFICATION !== 'strict') {
  throw new Error('SPHERE_SIGNATURE_VERIFICATION must be strict in production.');
}

if (
  Boolean(parsedEnv.CONDUCTOR_ED25519_PRIVATE_KEY) !== Boolean(parsedEnv.CONDUCTOR_ED25519_KEY_ID)
) {
  throw new Error(
    'CONDUCTOR_ED25519_PRIVATE_KEY and CONDUCTOR_ED25519_KEY_ID must both be set together.'
  );
}

if (
  parsedEnv.RUNTIME_ENV === 'production' &&
  parsedEnv.SPHERE_DB_ENFORCE_ROLE_SEPARATION &&
  !parsedEnv.SPHERE_DB_APP_ROLE
) {
  throw new Error(
    'SPHERE_DB_APP_ROLE must be set when SPHERE_DB_ENFORCE_ROLE_SEPARATION is true.'
  );
}

export const env = parsedEnv;

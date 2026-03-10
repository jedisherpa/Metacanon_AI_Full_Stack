import { defineConfig, devices } from '@playwright/test';

const ENGINE_PORT = Number(process.env.ENGINE_PORT || 3101);
const ENGINE_URL = `http://localhost:${ENGINE_PORT}`;
const TMA_PORT = Number(process.env.TMA_PORT || 4173);
const TMA_URL = `http://localhost:${TMA_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'npm run dev -w engine',
      url: `${ENGINE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(ENGINE_PORT),
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://council:council@localhost:5432/council',
        ADMIN_PANEL_PASSWORD: 'test-password',
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-bot-token',
        WS_TOKEN_SECRET: process.env.WS_TOKEN_SECRET || 'test-ws-token-secret-123456789012345',
        KIMI_API_KEY: process.env.KIMI_API_KEY || 'test-kimi-key',
        LLM_PROVIDER_DEFAULT: 'morpheus',
        MORPHEUS_BASE_URL: 'https://api.mor.org/api/v1',
        MORPHEUS_API_KEY: 'test',
        MORPHEUS_MODEL: 'hermes-3-llama-3.1-405b',
        MORPHEUS_ORCHESTRATOR_MODEL: 'venice:web',
        MORPHEUS_FALLBACK_MODEL: 'qwen3-235b',
        GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
        GROQ_API_KEY: 'test',
        GROQ_MODEL: 'llama-3.3-70b-versatile',
        GROQ_ORCHESTRATOR_MODEL: 'llama-3.3-70b-versatile',
        GROQ_FALLBACK_API_KEY: 'test',
        CORS_ORIGINS: 'http://localhost:5173',
        LENS_PACK: 'hands-of-the-void',
        LLM_HEALTH_CHECK_DELAY_MS: '1000',
        LLM_RETRY_DELAY_MS: '200',
        INLINE_WORKER_ENABLED: 'true',
        SESSION_SECURE_COOKIES: 'false'
      }
    },
    {
      command: 'npm run dev -w skins/council-nebula -- --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_ENGINE_URL: ENGINE_URL,
        VITE_ENGINE_WS_URL: `ws://localhost:${ENGINE_PORT}`
      }
    },
    {
      command: `npm --prefix tma run dev -- --port ${TMA_PORT}`,
      url: TMA_URL,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_BASE: ''
      }
    }
  ]
});

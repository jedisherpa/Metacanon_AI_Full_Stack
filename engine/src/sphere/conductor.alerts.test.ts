import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GovernanceAlertStateTracker } from './governanceAlertNotifier.js';
import { GovernanceTelemetry } from './governanceTelemetry.js';

let SphereConductor: any;

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
  process.env.RUNTIME_ENV = process.env.RUNTIME_ENV || 'local';
}

describe('SphereConductor governance alert delivery', () => {
  beforeAll(async () => {
    setEnv();
    const conductorModule = await import('./conductor.js');
    SphereConductor = conductorModule.SphereConductor;
  });

  it('notifies only when governance alert state transitions', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const conductor = Object.create(SphereConductor.prototype) as any;

    conductor.governanceTelemetry = new GovernanceTelemetry({ lensMissingTotal: 1 });
    conductor.governanceAlertStateTracker = new GovernanceAlertStateTracker();
    conductor.governanceAlertNotificationQueue = Promise.resolve();
    conductor.governanceAlertNotifier = {
      isEnabled: () => true,
      notify,
      getStatus: () => ({
        enabled: true,
        destination: 'webhook',
        destinationHost: 'alerts.example.com',
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: null,
        lastEventType: null,
        lastDeliveredAlertCodes: []
      })
    };

    conductor.scheduleGovernanceAlertNotifications();
    await conductor.governanceAlertNotificationQueue;
    expect(notify).not.toHaveBeenCalled();

    conductor.governanceTelemetry.recordIntentRejected({
      code: 'LENS_NOT_FOUND',
      isBreakGlassAttempt: false
    });
    conductor.scheduleGovernanceAlertNotifications();
    await conductor.governanceAlertNotificationQueue;

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toMatchObject({
      eventType: 'activated'
    });
    expect(notify.mock.calls[0]?.[0].alerts.map((alert: { code: string }) => alert.code)).toEqual([
      'lens_missing_total'
    ]);

    conductor.scheduleGovernanceAlertNotifications();
    await conductor.governanceAlertNotificationQueue;
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

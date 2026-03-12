import { describe, expect, it, vi } from 'vitest';
import {
  GovernanceAlertStateTracker,
  WebhookGovernanceAlertNotifier
} from './governanceAlertNotifier.js';
import type { GovernanceTelemetrySnapshot } from './governanceTelemetry.js';

function createSnapshot(alertCodes: GovernanceTelemetrySnapshot['alerts'][number]['code'][]): GovernanceTelemetrySnapshot {
  return {
    generatedAt: '2026-03-11T00:00:00.000Z',
    counters: {
      intentAttemptTotal: 0,
      intentCommittedTotal: 0,
      intentRejectedTotal: 0,
      intentRejectedByCode: {},
      lensMissingTotal: 0,
      breakGlassFailedTotal: 0,
      signatureVerificationFailureTotal: 0,
      materialImpactQuorumFailureTotal: 0,
      auditFailureTotal: 0,
      breakGlassAttemptTotal: 0,
      breakGlassAttemptAllowedTotal: 0,
      breakGlassAttemptDeniedTotal: 0
    },
    latencyMs: {
      sampleCount: 0,
      min: null,
      max: null,
      avg: null,
      p95: null
    },
    alerts: alertCodes.map((code) => ({
      code,
      severity:
        code === 'lens_missing_total' || code === 'break_glass_failed_total' ? 'warn' : 'critical',
      threshold: 1,
      current: 1,
      message: `${code} fired`
    }))
  };
}

describe('GovernanceAlertStateTracker', () => {
  it('emits activation and resolution events only on state transitions', () => {
    const tracker = new GovernanceAlertStateTracker();

    const initial = tracker.diff(createSnapshot([]));
    expect(initial).toHaveLength(0);

    const activated = tracker.diff(
      createSnapshot(['lens_missing_total', 'signature_verification_failure_total'])
    );
    expect(activated).toHaveLength(1);
    expect(activated[0]?.eventType).toBe('activated');
    expect(activated[0]?.alerts.map((alert) => alert.code)).toEqual([
      'signature_verification_failure_total',
      'lens_missing_total'
    ]);

    const steadyState = tracker.diff(
      createSnapshot(['lens_missing_total', 'signature_verification_failure_total'])
    );
    expect(steadyState).toHaveLength(0);

    const resolved = tracker.diff(createSnapshot(['signature_verification_failure_total']));
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.eventType).toBe('resolved');
    expect(resolved[0]?.alerts.map((alert) => alert.code)).toEqual(['lens_missing_total']);
  });
});

describe('WebhookGovernanceAlertNotifier', () => {
  it('posts alert events with optional secret token and updates delivery status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202
    });
    const notifier = new WebhookGovernanceAlertNotifier({
      webhookUrl: 'https://alerts.example.com/metacanon',
      secretToken: 'test-secret',
      timeoutMs: 2500,
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    await notifier.notify({
      eventId: '11111111-1111-4111-8111-111111111111',
      eventType: 'activated',
      generatedAt: '2026-03-11T00:00:00.000Z',
      alerts: createSnapshot(['audit_failure_total']).alerts,
      snapshot: createSnapshot(['audit_failure_total'])
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://alerts.example.com/metacanon',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-metacanon-alert-token': 'test-secret'
        })
      })
    );

    const status = notifier.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.destination).toBe('webhook');
    expect(status.destinationHost).toBe('alerts.example.com');
    expect(status.lastSuccessAt).not.toBeNull();
    expect(status.lastError).toBeNull();
    expect(status.lastDeliveredAlertCodes).toEqual(['audit_failure_total']);
  });

  it('records delivery errors when webhook transport fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    const notifier = new WebhookGovernanceAlertNotifier({
      webhookUrl: 'https://alerts.example.com/metacanon',
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    await expect(
      notifier.notify({
        eventId: '22222222-2222-4222-8222-222222222222',
        eventType: 'activated',
        generatedAt: '2026-03-11T00:00:00.000Z',
        alerts: createSnapshot(['material_impact_quorum_failure_total']).alerts,
        snapshot: createSnapshot(['material_impact_quorum_failure_total'])
      })
    ).rejects.toThrow('network down');

    expect(notifier.getStatus().lastError).toBe('network down');
  });
});

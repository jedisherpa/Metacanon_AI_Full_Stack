import { describe, expect, it } from 'vitest';
import { PrometheusConductorMetrics } from './prometheusMetrics.js';

describe('PrometheusConductorMetrics', () => {
  it('records quorum counters with outcome and reason labels', async () => {
    const metrics = new PrometheusConductorMetrics();

    metrics.recordQuorumAttempt({ outcome: 'success', reason: 'verified_quorum_met' });
    metrics.recordQuorumAttempt({ outcome: 'fail', reason: 'insufficient_verified_quorum' });

    const rendered = await metrics.renderMetrics();
    expect(rendered).toContain('metacanon_quorum_attempt_total');
    expect(rendered).toContain('outcome="success",reason="verified_quorum_met"');
    expect(rendered).toContain('outcome="fail",reason="insufficient_verified_quorum"');
  });

  it('tracks signature verification fail-rate gauge by context/source', async () => {
    const metrics = new PrometheusConductorMetrics();

    metrics.recordSignatureVerification({
      context: 'ack',
      source: 'did_key',
      outcome: 'success',
      reason: 'none'
    });
    metrics.recordSignatureVerification({
      context: 'ack',
      source: 'did_key',
      outcome: 'fail',
      reason: 'invalid_signature'
    });

    const rendered = await metrics.renderMetrics();
    expect(rendered).toContain('metacanon_signature_verification_total');
    expect(rendered).toContain(
      'metacanon_signature_verify_fail_rate{context="ack",source="did_key"} 0.5'
    );
  });
});


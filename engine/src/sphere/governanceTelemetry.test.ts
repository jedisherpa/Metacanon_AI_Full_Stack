import { describe, expect, it } from 'vitest'
import { GovernanceTelemetry } from './governanceTelemetry.js'

describe('GovernanceTelemetry', () => {
  it('tracks intent outcomes and break-glass counters', () => {
    const telemetry = new GovernanceTelemetry()

    telemetry.recordIntentAttempt({ isBreakGlassAttempt: false })
    telemetry.recordIntentCommitted({ isBreakGlassAttempt: false })

    telemetry.recordIntentAttempt({ isBreakGlassAttempt: true })
    telemetry.recordIntentRejected({
      code: 'BREAK_GLASS_AUTH_FAILED',
      isBreakGlassAttempt: true
    })

    telemetry.recordIntentAttempt({ isBreakGlassAttempt: false })
    telemetry.recordIntentRejected({
      code: 'LENS_NOT_FOUND',
      isBreakGlassAttempt: false
    })

    const snapshot = telemetry.getSnapshot()

    expect(snapshot.counters.intentAttemptTotal).toBe(3)
    expect(snapshot.counters.intentCommittedTotal).toBe(1)
    expect(snapshot.counters.intentRejectedTotal).toBe(2)
    expect(snapshot.counters.intentRejectedByCode.BREAK_GLASS_AUTH_FAILED).toBe(1)
    expect(snapshot.counters.intentRejectedByCode.LENS_NOT_FOUND).toBe(1)
    expect(snapshot.counters.breakGlassAttemptTotal).toBe(1)
    expect(snapshot.counters.breakGlassAttemptAllowedTotal).toBe(0)
    expect(snapshot.counters.breakGlassAttemptDeniedTotal).toBe(1)
    expect(snapshot.counters.breakGlassFailedTotal).toBe(1)
    expect(snapshot.counters.lensMissingTotal).toBe(1)
  })

  it('summarizes dispatch latency using min/max/avg/p95', () => {
    const telemetry = new GovernanceTelemetry()

    telemetry.recordDispatchLatency(10)
    telemetry.recordDispatchLatency(30)
    telemetry.recordDispatchLatency(20)
    telemetry.recordDispatchLatency(50)

    const snapshot = telemetry.getSnapshot()

    expect(snapshot.latencyMs.sampleCount).toBe(4)
    expect(snapshot.latencyMs.min).toBe(10)
    expect(snapshot.latencyMs.max).toBe(50)
    expect(snapshot.latencyMs.avg).toBe(27.5)
    expect(snapshot.latencyMs.p95).toBe(50)
  })

  it('emits configured alerts when thresholds are reached', () => {
    const telemetry = new GovernanceTelemetry({
      lensMissingTotal: 1,
      breakGlassFailedTotal: 1,
      signatureVerificationFailureTotal: 1,
      materialImpactQuorumFailureTotal: 1,
      auditFailureTotal: 1
    })

    telemetry.recordIntentAttempt({ isBreakGlassAttempt: false })
    telemetry.recordIntentRejected({ code: 'LENS_NOT_FOUND', isBreakGlassAttempt: false })
    telemetry.recordIntentRejected({
      code: 'BREAK_GLASS_AUTH_FAILED',
      isBreakGlassAttempt: true
    })
    telemetry.recordSignatureVerificationFailure()
    telemetry.recordMaterialImpactQuorumFailure()
    telemetry.recordAuditFailure()

    const alertCodes = telemetry.getSnapshot().alerts.map((alert) => alert.code)

    expect(alertCodes).toContain('lens_missing_total')
    expect(alertCodes).toContain('break_glass_failed_total')
    expect(alertCodes).toContain('signature_verification_failure_total')
    expect(alertCodes).toContain('material_impact_quorum_failure_total')
    expect(alertCodes).toContain('audit_failure_total')
  })
})

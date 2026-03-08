export type SignatureVerificationMode = 'off' | 'did_key' | 'strict'

export type GovernanceTelemetryAlertSeverity = 'warn' | 'critical'

export type GovernanceTelemetryAlert = {
  code:
    | 'lens_missing_total'
    | 'break_glass_failed_total'
    | 'signature_verification_failure_total'
    | 'material_impact_quorum_failure_total'
    | 'audit_failure_total'
  severity: GovernanceTelemetryAlertSeverity
  threshold: number
  current: number
  message: string
}

export type GovernanceTelemetryThresholds = {
  lensMissingTotal: number
  breakGlassFailedTotal: number
  signatureVerificationFailureTotal: number
  materialImpactQuorumFailureTotal: number
  auditFailureTotal: number
}

export type GovernanceTelemetrySnapshot = {
  generatedAt: string
  counters: {
    intentAttemptTotal: number
    intentCommittedTotal: number
    intentRejectedTotal: number
    intentRejectedByCode: Record<string, number>
    lensMissingTotal: number
    breakGlassFailedTotal: number
    signatureVerificationFailureTotal: number
    materialImpactQuorumFailureTotal: number
    auditFailureTotal: number
    breakGlassAttemptTotal: number
    breakGlassAttemptAllowedTotal: number
    breakGlassAttemptDeniedTotal: number
  }
  latencyMs: {
    sampleCount: number
    min: number | null
    max: number | null
    avg: number | null
    p95: number | null
  }
  alerts: GovernanceTelemetryAlert[]
}

const DEFAULT_THRESHOLDS: GovernanceTelemetryThresholds = {
  lensMissingTotal: 1,
  breakGlassFailedTotal: 3,
  signatureVerificationFailureTotal: 3,
  materialImpactQuorumFailureTotal: 1,
  auditFailureTotal: 1
}

const MAX_LATENCY_SAMPLES = 2048

type LatencySummary = {
  min: number | null
  max: number | null
  avg: number | null
  p95: number | null
}

function incrementCounter(store: Record<string, number>, key: string): void {
  store[key] = (store[key] ?? 0) + 1
}

function summarizeLatency(samples: number[]): LatencySummary {
  if (samples.length === 0) {
    return {
      min: null,
      max: null,
      avg: null,
      p95: null
    }
  }

  const sorted = [...samples].sort((left, right) => left - right)
  const sum = sorted.reduce((accumulator, value) => accumulator + value, 0)
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Number((sum / sorted.length).toFixed(2)),
    p95: sorted[p95Index]
  }
}

export class GovernanceTelemetry {
  private readonly thresholds: GovernanceTelemetryThresholds
  private intentAttemptTotal = 0
  private intentCommittedTotal = 0
  private intentRejectedTotal = 0
  private readonly intentRejectedByCode: Record<string, number> = {}
  private lensMissingTotal = 0
  private breakGlassFailedTotal = 0
  private signatureVerificationFailureTotal = 0
  private materialImpactQuorumFailureTotal = 0
  private auditFailureTotal = 0
  private breakGlassAttemptTotal = 0
  private breakGlassAttemptAllowedTotal = 0
  private breakGlassAttemptDeniedTotal = 0
  private readonly dispatchLatencySamplesMs: number[] = []

  constructor(thresholdOverrides?: Partial<GovernanceTelemetryThresholds>) {
    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...(thresholdOverrides ?? {})
    }
  }

  recordIntentAttempt(input: { isBreakGlassAttempt: boolean }): void {
    this.intentAttemptTotal += 1
    if (input.isBreakGlassAttempt) {
      this.breakGlassAttemptTotal += 1
    }
  }

  recordIntentCommitted(input: { isBreakGlassAttempt: boolean }): void {
    this.intentCommittedTotal += 1
    if (input.isBreakGlassAttempt) {
      this.breakGlassAttemptAllowedTotal += 1
    }
  }

  recordIntentRejected(input: { code: string; isBreakGlassAttempt: boolean }): void {
    this.intentRejectedTotal += 1
    incrementCounter(this.intentRejectedByCode, input.code)

    if (input.code === 'LENS_NOT_FOUND') {
      this.lensMissingTotal += 1
    }

    if (input.code === 'BREAK_GLASS_AUTH_FAILED') {
      this.breakGlassFailedTotal += 1
    }

    if (input.isBreakGlassAttempt) {
      this.breakGlassAttemptDeniedTotal += 1
    }
  }

  recordSignatureVerificationFailure(): void {
    this.signatureVerificationFailureTotal += 1
  }

  recordMaterialImpactQuorumFailure(): void {
    this.materialImpactQuorumFailureTotal += 1
  }

  recordAuditFailure(): void {
    this.auditFailureTotal += 1
  }

  recordDispatchLatency(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return
    }

    this.dispatchLatencySamplesMs.push(Math.round(durationMs))
    if (this.dispatchLatencySamplesMs.length > MAX_LATENCY_SAMPLES) {
      this.dispatchLatencySamplesMs.shift()
    }
  }

  getSnapshot(): GovernanceTelemetrySnapshot {
    const alerts: GovernanceTelemetryAlert[] = []

    if (this.lensMissingTotal >= this.thresholds.lensMissingTotal) {
      alerts.push({
        code: 'lens_missing_total',
        severity: 'warn',
        threshold: this.thresholds.lensMissingTotal,
        current: this.lensMissingTotal,
        message:
          'One or more intent attempts were rejected because no contact lens was configured.'
      })
    }

    if (this.breakGlassFailedTotal >= this.thresholds.breakGlassFailedTotal) {
      alerts.push({
        code: 'break_glass_failed_total',
        severity: 'warn',
        threshold: this.thresholds.breakGlassFailedTotal,
        current: this.breakGlassFailedTotal,
        message: 'Break-glass authorization failures exceeded the configured threshold.'
      })
    }

    if (
      this.signatureVerificationFailureTotal >= this.thresholds.signatureVerificationFailureTotal
    ) {
      alerts.push({
        code: 'signature_verification_failure_total',
        severity: 'critical',
        threshold: this.thresholds.signatureVerificationFailureTotal,
        current: this.signatureVerificationFailureTotal,
        message: 'Signature verification failures exceeded the configured threshold.'
      })
    }

    if (
      this.materialImpactQuorumFailureTotal >= this.thresholds.materialImpactQuorumFailureTotal
    ) {
      alerts.push({
        code: 'material_impact_quorum_failure_total',
        severity: 'critical',
        threshold: this.thresholds.materialImpactQuorumFailureTotal,
        current: this.materialImpactQuorumFailureTotal,
        message:
          'Material-impact intents were rejected due to missing signed counselor ACK quorum.'
      })
    }

    if (this.auditFailureTotal >= this.thresholds.auditFailureTotal) {
      alerts.push({
        code: 'audit_failure_total',
        severity: 'critical',
        threshold: this.thresholds.auditFailureTotal,
        current: this.auditFailureTotal,
        message: 'Audit-critical failures exceeded the configured threshold.'
      })
    }

    const latency = summarizeLatency(this.dispatchLatencySamplesMs)

    return {
      generatedAt: new Date().toISOString(),
      counters: {
        intentAttemptTotal: this.intentAttemptTotal,
        intentCommittedTotal: this.intentCommittedTotal,
        intentRejectedTotal: this.intentRejectedTotal,
        intentRejectedByCode: { ...this.intentRejectedByCode },
        lensMissingTotal: this.lensMissingTotal,
        breakGlassFailedTotal: this.breakGlassFailedTotal,
        signatureVerificationFailureTotal: this.signatureVerificationFailureTotal,
        materialImpactQuorumFailureTotal: this.materialImpactQuorumFailureTotal,
        auditFailureTotal: this.auditFailureTotal,
        breakGlassAttemptTotal: this.breakGlassAttemptTotal,
        breakGlassAttemptAllowedTotal: this.breakGlassAttemptAllowedTotal,
        breakGlassAttemptDeniedTotal: this.breakGlassAttemptDeniedTotal
      },
      latencyMs: {
        sampleCount: this.dispatchLatencySamplesMs.length,
        min: latency.min,
        max: latency.max,
        avg: latency.avg,
        p95: latency.p95
      },
      alerts
    }
  }
}

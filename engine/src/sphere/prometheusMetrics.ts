import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import type {
  ConductorPrometheusMetrics,
  QuorumAttemptMetric,
  SignatureVerificationMetric
} from './conductor.js';

type MetricsOptions = {
  collectProcessMetrics?: boolean;
  registry?: Registry;
};

function signatureRateKey(context: string, source: string): string {
  return `${context}|${source}`;
}

export class PrometheusConductorMetrics implements ConductorPrometheusMetrics {
  readonly registry: Registry;
  readonly contentType: string;

  private readonly quorumAttemptTotal: Counter<'outcome' | 'reason'>;
  private readonly signatureVerificationTotal: Counter<'context' | 'source' | 'outcome' | 'reason'>;
  private readonly signatureVerifyFailRate: Gauge<'context' | 'source'>;
  private readonly signatureAttemptsByKey = new Map<string, number>();
  private readonly signatureFailuresByKey = new Map<string, number>();

  constructor(options?: MetricsOptions) {
    this.registry = options?.registry ?? new Registry();
    this.contentType = this.registry.contentType;

    if (options?.collectProcessMetrics) {
      collectDefaultMetrics({ register: this.registry, prefix: 'metacanon_process_' });
    }

    this.quorumAttemptTotal = new Counter({
      name: 'metacanon_quorum_attempt_total',
      help: 'Total number of material-impact quorum evaluations.',
      labelNames: ['outcome', 'reason'],
      registers: [this.registry]
    });

    this.signatureVerificationTotal = new Counter({
      name: 'metacanon_signature_verification_total',
      help: 'Total signature verification outcomes across dispatch/ack paths.',
      labelNames: ['context', 'source', 'outcome', 'reason'],
      registers: [this.registry]
    });

    this.signatureVerifyFailRate = new Gauge({
      name: 'metacanon_signature_verify_fail_rate',
      help: 'Rolling ratio of failed signature verifications per context/source.',
      labelNames: ['context', 'source'],
      registers: [this.registry]
    });
  }

  recordQuorumAttempt(metric: QuorumAttemptMetric): void {
    this.quorumAttemptTotal.labels(metric.outcome, metric.reason).inc();
  }

  recordSignatureVerification(metric: SignatureVerificationMetric): void {
    this.signatureVerificationTotal
      .labels(metric.context, metric.source, metric.outcome, metric.reason)
      .inc();

    const key = signatureRateKey(metric.context, metric.source);
    const attempts = (this.signatureAttemptsByKey.get(key) ?? 0) + 1;
    const failures =
      (this.signatureFailuresByKey.get(key) ?? 0) + (metric.outcome === 'fail' ? 1 : 0);

    this.signatureAttemptsByKey.set(key, attempts);
    this.signatureFailuresByKey.set(key, failures);
    this.signatureVerifyFailRate.labels(metric.context, metric.source).set(failures / attempts);
  }

  async renderMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}


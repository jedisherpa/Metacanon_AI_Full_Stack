import { randomUUID } from 'node:crypto';
import type {
  GovernanceTelemetryAlert,
  GovernanceTelemetryAlertSeverity,
  GovernanceTelemetrySnapshot
} from './governanceTelemetry.js';

export type GovernanceAlertCode = GovernanceTelemetryAlert['code'];

export type GovernanceAlertDeliveryEvent = {
  eventId: string;
  eventType: 'activated' | 'resolved';
  generatedAt: string;
  alerts: GovernanceTelemetryAlert[];
  snapshot: GovernanceTelemetrySnapshot;
};

export type GovernanceAlertDeliveryStatus = {
  enabled: boolean;
  destination: 'none' | 'webhook';
  destinationHost: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastEventType: GovernanceAlertDeliveryEvent['eventType'] | null;
  lastDeliveredAlertCodes: GovernanceAlertCode[];
};

export type GovernanceAlertNotifier = {
  isEnabled(): boolean;
  notify(event: GovernanceAlertDeliveryEvent): Promise<void>;
  getStatus(): GovernanceAlertDeliveryStatus;
};

type WebhookGovernanceAlertNotifierOptions = {
  webhookUrl: string;
  secretToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type AlertMap = Map<GovernanceAlertCode, GovernanceTelemetryAlert>;

function createAlertMap(alerts: GovernanceTelemetryAlert[]): AlertMap {
  return new Map(alerts.map((alert) => [alert.code, alert]));
}

function sortAlertsBySeverityAndCode(alerts: GovernanceTelemetryAlert[]): GovernanceTelemetryAlert[] {
  const severityOrder: Record<GovernanceTelemetryAlertSeverity, number> = {
    critical: 0,
    warn: 1
  };

  return [...alerts].sort((left, right) => {
    const severityDelta = severityOrder[left.severity] - severityOrder[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return left.code.localeCompare(right.code);
  });
}

function buildResolvedAlerts(previousAlerts: AlertMap, currentAlerts: AlertMap): GovernanceTelemetryAlert[] {
  const resolved: GovernanceTelemetryAlert[] = [];
  for (const [code, previousAlert] of previousAlerts.entries()) {
    if (!currentAlerts.has(code)) {
      resolved.push(previousAlert);
    }
  }
  return sortAlertsBySeverityAndCode(resolved);
}

function buildActivatedAlerts(previousAlerts: AlertMap, currentAlerts: AlertMap): GovernanceTelemetryAlert[] {
  const activated: GovernanceTelemetryAlert[] = [];
  for (const [code, currentAlert] of currentAlerts.entries()) {
    if (!previousAlerts.has(code)) {
      activated.push(currentAlert);
    }
  }
  return sortAlertsBySeverityAndCode(activated);
}

export class GovernanceAlertStateTracker {
  private activeAlerts: AlertMap = new Map();

  diff(snapshot: GovernanceTelemetrySnapshot): GovernanceAlertDeliveryEvent[] {
    const currentAlerts = createAlertMap(snapshot.alerts);
    const activatedAlerts = buildActivatedAlerts(this.activeAlerts, currentAlerts);
    const resolvedAlerts = buildResolvedAlerts(this.activeAlerts, currentAlerts);
    const events: GovernanceAlertDeliveryEvent[] = [];

    if (activatedAlerts.length > 0) {
      events.push({
        eventId: randomUUID(),
        eventType: 'activated',
        generatedAt: new Date().toISOString(),
        alerts: activatedAlerts,
        snapshot
      });
    }

    if (resolvedAlerts.length > 0) {
      events.push({
        eventId: randomUUID(),
        eventType: 'resolved',
        generatedAt: new Date().toISOString(),
        alerts: resolvedAlerts,
        snapshot
      });
    }

    this.activeAlerts = currentAlerts;
    return events;
  }
}

export class WebhookGovernanceAlertNotifier implements GovernanceAlertNotifier {
  private readonly webhookUrl: string;
  private readonly destinationHost: string;
  private readonly secretToken?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly status: GovernanceAlertDeliveryStatus;

  constructor(options: WebhookGovernanceAlertNotifierOptions) {
    const parsedUrl = new URL(options.webhookUrl);
    this.webhookUrl = parsedUrl.toString();
    this.destinationHost = parsedUrl.host;
    this.secretToken = options.secretToken?.trim() || undefined;
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 5000);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.status = {
      enabled: true,
      destination: 'webhook',
      destinationHost: this.destinationHost,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      lastEventType: null,
      lastDeliveredAlertCodes: []
    };
  }

  isEnabled(): boolean {
    return true;
  }

  getStatus(): GovernanceAlertDeliveryStatus {
    return {
      ...this.status,
      lastDeliveredAlertCodes: [...this.status.lastDeliveredAlertCodes]
    };
  }

  async notify(event: GovernanceAlertDeliveryEvent): Promise<void> {
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };
    if (this.secretToken) {
      headers['x-metacanon-alert-token'] = this.secretToken;
    }

    this.status.lastAttemptAt = new Date().toISOString();
    this.status.lastEventType = event.eventType;
    this.status.lastDeliveredAlertCodes = event.alerts.map((alert) => alert.code);

    try {
      const response = await this.fetchImpl(this.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: 'sphere-thread-engine',
          event
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!response.ok) {
        throw new Error(`Webhook returned HTTP ${response.status}`);
      }

      this.status.lastSuccessAt = new Date().toISOString();
      this.status.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown governance alert delivery error.';
      this.status.lastError = message;
      throw error;
    }
  }
}

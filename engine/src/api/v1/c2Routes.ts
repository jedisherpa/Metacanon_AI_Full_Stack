import type { Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import type { GovernancePolicies } from '../../governance/policyLoader.js';
import type { DidRegistry } from '../../sphere/didRegistry.js';
import { ConductorError, SphereConductor } from '../../sphere/conductor.js';
import {
  CYCLE_EVENT_TYPES,
  allowedCycleTransitionsFrom,
  cycleEventIntentToType,
  cycleEventTypeToIntent,
  isAllowedCycleTransition
} from '../../sphere/cycleEventTaxonomy.js';
import { generateMissionReport, MissionServiceError } from '../../agents/missionService.js';
import { resolveTraceId, sendSphereError } from './sphereApi.js';
import { sphereServiceAuthMiddleware } from '../../middleware/sphereServiceAuth.js';

const dispatchMissionSchema = z.object({
  threadId: z.string().uuid().optional(),
  missionId: z.string().uuid().optional(),
  messageId: z.string().uuid(),
  agentDid: z.string().min(1),
  intent: z.literal('DISPATCH_MISSION'),
  objective: z.string().min(3),
  provider: z.enum(['morpheus', 'groq', 'kimi', 'auto']).default('auto'),
  attestation: z.array(z.string().min(1)),
  schemaVersion: z.literal('3.0'),
  agentSignature: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
  traceId: z.string().uuid(),
  prismHolderApproved: z.boolean().optional()
});

const submitMessageSchema = z.object({
  threadId: z.string().uuid(),
  missionId: z.string().uuid().optional(),
  authorAgentId: z.string().min(1),
  messageId: z.string().uuid(),
  traceId: z.string().uuid(),
  intent: z.string().min(1),
  attestation: z.array(z.string().min(1)),
  schemaVersion: z.literal('3.0'),
  protocolVersion: z.string().min(1).default('3.0'),
  causationId: z.array(z.string().uuid()).default([]),
  idempotencyKey: z.string().min(1).optional(),
  agentSignature: z.string().min(1),
  prismHolderApproved: z.boolean().optional(),
  payload: z.record(z.string(), z.unknown()).default({})
});

const submitCycleEventSchema = z.object({
  threadId: z.string().uuid(),
  missionId: z.string().uuid().optional(),
  authorAgentId: z.string().min(1),
  messageId: z.string().uuid(),
  traceId: z.string().uuid(),
  eventType: z.enum(CYCLE_EVENT_TYPES),
  attestation: z.array(z.string().min(1)),
  schemaVersion: z.literal('3.0'),
  protocolVersion: z.string().min(1).default('3.0'),
  causationId: z.array(z.string().uuid()).default([]),
  idempotencyKey: z.string().min(1).optional(),
  agentSignature: z.string().min(1),
  prismHolderApproved: z.boolean().optional(),
  payload: z.record(z.string(), z.unknown()).default({})
});

const cycleSeatTakenPayloadSchema = z
  .object({
    objective: z.string().trim().min(1).max(500).optional(),
    actor: z.string().trim().min(1).max(160).optional(),
    seatId: z.string().trim().min(1).max(160).optional(),
    cycleId: z.string().trim().min(1).max(160).optional(),
    at: z.string().datetime().optional(),
    cycleEventType: z.string().optional()
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (!value.objective && !value.seatId && !value.cycleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['objective'],
        message: 'seat_taken payload requires objective, seatId, or cycleId.'
      });
    }
  });

const cyclePerspectivePayloadSchema = z
  .object({
    content: z.string().trim().min(1).max(5000).optional(),
    perspective: z.string().trim().min(1).max(5000).optional(),
    cycleId: z.string().trim().min(1).max(160).optional(),
    at: z.string().datetime().optional(),
    cycleEventType: z.string().optional()
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (!value.content && !value.perspective) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'perspective_submitted payload requires content or perspective.'
      });
    }
  });

const cycleSynthesisPayloadSchema = z
  .object({
    synthesis: z.string().trim().min(1).max(5000).optional(),
    summary: z.string().trim().min(1).max(5000).optional(),
    lensName: z.string().trim().min(1).max(200).optional(),
    synthesisId: z.string().uuid().optional(),
    cycleId: z.string().trim().min(1).max(160).optional(),
    at: z.string().datetime().optional(),
    cycleEventType: z.string().optional()
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (!value.synthesis && !value.summary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['synthesis'],
        message: 'synthesis_returned payload requires synthesis or summary.'
      });
    }
  });

const cycleLensUpgradePayloadSchema = z
  .object({
    note: z.string().trim().min(1).max(1000).nullable().optional(),
    activeLensId: z.string().trim().min(1).max(160).nullable().optional(),
    selectedLensId: z.string().trim().min(1).max(160).nullable().optional(),
    previousLensVersion: z.string().trim().min(1).max(120).optional(),
    nextLensVersion: z.string().trim().min(1).max(120).optional(),
    ruleId: z.string().trim().min(1).max(200).optional(),
    cycleId: z.string().trim().min(1).max(160).optional(),
    at: z.string().datetime().optional(),
    cycleEventType: z.string().optional()
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (!value.note && !value.selectedLensId && !value.nextLensVersion && !value.ruleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message:
          'lens_upgraded payload requires note, selectedLensId, nextLensVersion, or ruleId.'
      });
    }
  });

const streamAckSchema = z
  .object({
    actorDid: z.string().min(1),
    targetSequence: z.number().int().positive().optional(),
    targetMessageId: z.string().uuid().optional(),
    ackMessageId: z.string().uuid().optional(),
    traceId: z.string().uuid(),
    intent: z.literal('ACK_ENTRY').default('ACK_ENTRY'),
    schemaVersion: z.literal('3.0'),
    attestation: z.array(z.string().min(1)),
    agentSignature: z.string().min(1),
    receivedAt: z.string().datetime().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.targetSequence && !value.targetMessageId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetSequence'],
        message: 'ACK requires targetSequence or targetMessageId.'
      });
    }
  });

const haltAllSchema = z.object({
  actorDid: z.string().min(1),
  actorRole: z.string().min(1),
  reason: z.string().min(3),
  confirmerDid: z.string().min(1).optional(),
  confirmerRole: z.string().min(1).optional(),
  emergencyCredential: z.string().min(1).optional(),
  messageId: z.string().uuid(),
  traceId: z.string().uuid(),
  intent: z.literal('EMERGENCY_SHUTDOWN'),
  attestation: z.array(z.string().min(1)),
  schemaVersion: z.literal('3.0'),
  agentSignature: z.string().min(1),
  prismHolderApproved: z.boolean().optional()
});

const didUpsertSchema = z.object({
  did: z.string().min(1),
  label: z.string().min(1).max(255).optional(),
  publicKey: z.string().min(1).optional()
});

const rotateConductorKeySchema = z.object({
  keyId: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .regex(/^[a-z0-9._:-]+$/i)
    .optional(),
  verificationGraceDays: z.number().int().min(0).max(3650).optional()
});

const retireConductorKeySchema = z.object({
  keyId: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .regex(/^[a-z0-9._:-]+$/i),
  verificationGraceDays: z.number().int().min(0).max(3650).optional()
});

type SphereRouteOptions = {
  conductor: SphereConductor;
  didRegistry: DidRegistry;
  governancePolicies?: GovernancePolicies;
  includeLegacyAlias?: boolean;
};

const CANONICAL_SPHERE_BASE = '/api/v1/sphere';
const LEGACY_ALIAS_BASE = '/api/v1/c2';

const missionWriteRequiredFields = [
  'messageId',
  'traceId',
  'intent',
  'attestation[]',
  'schemaVersion',
  'threadId|missionId',
  'agentSignature'
] as const;

const messageWriteRequiredFields = [
  'threadId',
  'messageId',
  'traceId',
  'intent',
  'attestation[]',
  'schemaVersion',
  'agentSignature'
] as const;

const cycleEventWriteRequiredFields = [
  'threadId',
  'messageId',
  'traceId',
  'eventType',
  'attestation[]',
  'schemaVersion',
  'agentSignature'
] as const;

const ackWriteRequiredFields = [
  'traceId',
  'intent',
  'schemaVersion',
  'attestation[]',
  'agentSignature',
  'targetSequence|targetMessageId'
] as const;

type CycleEventType = (typeof CYCLE_EVENT_TYPES)[number];
type LensUpgradePayload = z.infer<typeof cycleLensUpgradePayloadSchema>;
const lensUpgradeRuleTupleFields = ['ruleId', 'previousLensVersion', 'nextLensVersion'] as const;
const cycleStateStartEventTypes: CycleEventType[] = ['seat_taken'];

type LensProgressionUpgrade = {
  sequence: number;
  messageId: string | null;
  traceId: string | null;
  ruleId: string | null;
  fromVersion: string;
  toVersion: string;
  selectedLensId: string | null;
  timestamp: string | null;
};

type CycleStateCounts = Record<CycleEventType, number>;

type CycleStateLastEvent = {
  eventType: CycleEventType;
  sequence: number;
  messageId: string | null;
  traceId: string | null;
  timestamp: string | null;
};

const cycleEventPayloadContracts: Record<
  CycleEventType,
  {
    requiredAnyOf: readonly string[];
    optional: readonly string[];
    notes: string;
  }
> = {
  seat_taken: {
    requiredAnyOf: ['objective', 'seatId', 'cycleId'],
    optional: ['actor', 'at'],
    notes: 'At least one seat anchor is required to start a cycle thread.'
  },
  perspective_submitted: {
    requiredAnyOf: ['content', 'perspective'],
    optional: ['cycleId', 'at'],
    notes: 'Perspective payload must include substantive participant text.'
  },
  synthesis_returned: {
    requiredAnyOf: ['synthesis', 'summary'],
    optional: ['synthesisId', 'lensName', 'cycleId', 'at'],
    notes: 'Synthesis stage requires generated synthesis text or summary.'
  },
  lens_upgraded: {
    requiredAnyOf: ['note', 'selectedLensId', 'nextLensVersion', 'ruleId'],
    optional: ['activeLensId', 'previousLensVersion', 'cycleId', 'at'],
    notes: 'Lens upgrade requires a meaningful progression delta.'
  }
};

function parseCycleEventPayload(eventType: CycleEventType, payload: Record<string, unknown>) {
  switch (eventType) {
    case 'seat_taken':
      return cycleSeatTakenPayloadSchema.safeParse(payload);
    case 'perspective_submitted':
      return cyclePerspectivePayloadSchema.safeParse(payload);
    case 'synthesis_returned':
      return cycleSynthesisPayloadSchema.safeParse(payload);
    case 'lens_upgraded':
      return cycleLensUpgradePayloadSchema.safeParse(payload);
    default:
      return z.never().safeParse(undefined);
  }
}

function resolveLatestCycleEventType(entries: Array<Record<string, unknown>>): CycleEventType | null {
  let latest: CycleEventType | null = null;
  let latestSequence = Number.NEGATIVE_INFINITY;

  for (const entry of entries) {
    const ledgerEnvelope =
      entry.ledgerEnvelope && typeof entry.ledgerEnvelope === 'object' && !Array.isArray(entry.ledgerEnvelope)
        ? (entry.ledgerEnvelope as Record<string, unknown>)
        : null;
    const clientEnvelope =
      entry.clientEnvelope && typeof entry.clientEnvelope === 'object' && !Array.isArray(entry.clientEnvelope)
        ? (entry.clientEnvelope as Record<string, unknown>)
        : null;
    const intent = valueAsNonEmptyString(clientEnvelope?.intent);
    if (!intent) {
      continue;
    }

    const cycleType = cycleEventIntentToType(intent);
    if (!cycleType) {
      continue;
    }

    const sequence = Number(ledgerEnvelope?.sequence ?? Number.NEGATIVE_INFINITY);
    if (Number.isNaN(sequence)) {
      continue;
    }

    if (sequence >= latestSequence) {
      latestSequence = sequence;
      latest = cycleType;
    }
  }

  return latest;
}

function computeCycleState(entries: Array<Record<string, unknown>>): {
  phase: CycleEventType | null;
  expectedNextEventTypes: CycleEventType[];
  cycleStarted: boolean;
  completedRounds: number;
  eventCounts: CycleStateCounts;
  lastEvent: CycleStateLastEvent | null;
} {
  const counts: CycleStateCounts = {
    seat_taken: 0,
    perspective_submitted: 0,
    synthesis_returned: 0,
    lens_upgraded: 0
  };

  let phase: CycleEventType | null = null;
  let latestSequence = Number.NEGATIVE_INFINITY;
  let lastEvent: CycleStateLastEvent | null = null;

  for (const entry of entries) {
    const ledgerEnvelope =
      entry.ledgerEnvelope && typeof entry.ledgerEnvelope === 'object' && !Array.isArray(entry.ledgerEnvelope)
        ? (entry.ledgerEnvelope as Record<string, unknown>)
        : null;
    const clientEnvelope =
      entry.clientEnvelope && typeof entry.clientEnvelope === 'object' && !Array.isArray(entry.clientEnvelope)
        ? (entry.clientEnvelope as Record<string, unknown>)
        : null;
    const intent = valueAsNonEmptyString(clientEnvelope?.intent);
    if (!intent) {
      continue;
    }

    const cycleType = cycleEventIntentToType(intent);
    if (!cycleType) {
      continue;
    }

    counts[cycleType] += 1;
    const sequence = Number(ledgerEnvelope?.sequence ?? Number.NEGATIVE_INFINITY);
    if (Number.isNaN(sequence)) {
      continue;
    }

    if (sequence >= latestSequence) {
      latestSequence = sequence;
      phase = cycleType;
      lastEvent = {
        eventType: cycleType,
        sequence,
        messageId: valueAsNonEmptyString(clientEnvelope?.messageId) ?? null,
        traceId: valueAsNonEmptyString(clientEnvelope?.traceId) ?? null,
        timestamp: valueAsNonEmptyString(ledgerEnvelope?.timestamp) ?? null
      };
    }
  }

  return {
    phase,
    expectedNextEventTypes: [...allowedCycleTransitionsFrom(phase)],
    cycleStarted: phase !== null,
    completedRounds: counts.lens_upgraded,
    eventCounts: counts,
    lastEvent
  };
}

function validateCyclePhaseTransition(params: {
  entries: Array<Record<string, unknown>>;
  eventType: CycleEventType;
}):
  | { ok: true }
  | { ok: false; message: string; details: Record<string, unknown> } {
  const previousEventType = resolveLatestCycleEventType(params.entries);
  const expectedNextEventTypes = [...allowedCycleTransitionsFrom(previousEventType)];

  if (isAllowedCycleTransition(previousEventType, params.eventType)) {
    return { ok: true };
  }

  const message =
    previousEventType === null
      ? 'Cycle thread must begin with seat_taken.'
      : `Invalid cycle transition: ${previousEventType} -> ${params.eventType}.`;

  return {
    ok: false,
    message,
    details: {
      previousEventType,
      expectedNextEventTypes,
      receivedEventType: params.eventType
    }
  };
}

function normalizeRuleId(value: string): string {
  return value.trim().toLowerCase();
}

function parseSemverParts(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) {
    return null;
  }

  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10)
  ];
}

function compareSemver(left: string, right: string): number {
  const leftParts = parseSemverParts(left);
  const rightParts = parseSemverParts(right);
  if (!leftParts || !rightParts) {
    return 0;
  }

  for (let index = 0; index < 3; index += 1) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function resolveInitialLensVersion(governancePolicies?: GovernancePolicies): string {
  const fromVersions = (governancePolicies?.lensUpgradeRegistry.rules ?? [])
    .map((rule) => rule.fromVersion)
    .filter((version) => Boolean(parseSemverParts(version)));
  if (fromVersions.length === 0) {
    return '1.0.0';
  }

  return fromVersions.sort(compareSemver)[0];
}

function valueAsNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function computeLensProgression(params: {
  entries: Array<Record<string, unknown>>;
  governancePolicies?: GovernancePolicies;
}): {
  initialVersion: string;
  currentVersion: string;
  upgrades: LensProgressionUpgrade[];
} {
  const initialVersion = resolveInitialLensVersion(params.governancePolicies);
  let currentVersion = initialVersion;
  const upgrades: LensProgressionUpgrade[] = [];

  const sortedEntries = [...params.entries].sort((left, right) => {
    const leftSequence = Number((left.ledgerEnvelope as Record<string, unknown> | undefined)?.sequence ?? 0);
    const rightSequence = Number((right.ledgerEnvelope as Record<string, unknown> | undefined)?.sequence ?? 0);
    return leftSequence - rightSequence;
  });

  for (const entry of sortedEntries) {
    const clientEnvelope =
      entry.clientEnvelope && typeof entry.clientEnvelope === 'object' && !Array.isArray(entry.clientEnvelope)
        ? (entry.clientEnvelope as Record<string, unknown>)
        : null;
    const payload =
      entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
        ? (entry.payload as Record<string, unknown>)
        : {};
    const ledgerEnvelope =
      entry.ledgerEnvelope && typeof entry.ledgerEnvelope === 'object' && !Array.isArray(entry.ledgerEnvelope)
        ? (entry.ledgerEnvelope as Record<string, unknown>)
        : null;

    const intent = valueAsNonEmptyString(clientEnvelope?.intent)?.toUpperCase();
    if (intent !== 'LENS_UPGRADED') {
      continue;
    }

    const ruleId = valueAsNonEmptyString(payload.ruleId) ?? null;
    const previousLensVersion = valueAsNonEmptyString(payload.previousLensVersion);
    const nextLensVersion = valueAsNonEmptyString(payload.nextLensVersion);
    const selectedLensId =
      valueAsNonEmptyString(payload.selectedLensId) ??
      valueAsNonEmptyString(payload.activeLensId) ??
      null;
    const boundRule =
      ruleId && params.governancePolicies
        ? params.governancePolicies.lensUpgradeRuleById.get(normalizeRuleId(ruleId))
        : undefined;

    const fromVersion = previousLensVersion ?? boundRule?.fromVersion ?? currentVersion;
    const toVersion = nextLensVersion ?? boundRule?.toVersion ?? currentVersion;
    currentVersion = toVersion;

    upgrades.push({
      sequence: Number(ledgerEnvelope?.sequence ?? 0),
      messageId: valueAsNonEmptyString(clientEnvelope?.messageId) ?? null,
      traceId: valueAsNonEmptyString(clientEnvelope?.traceId) ?? null,
      ruleId,
      fromVersion,
      toVersion,
      selectedLensId,
      timestamp: valueAsNonEmptyString(ledgerEnvelope?.timestamp) ?? null
    });
  }

  return {
    initialVersion,
    currentVersion,
    upgrades
  };
}

function validateLensUpgradeRuleBinding(params: {
  payload: LensUpgradePayload;
  governancePolicies?: GovernancePolicies;
}):
  | { ok: true }
  | { ok: false; message: string; details?: Record<string, unknown> } {
  const hasRuleId = Boolean(params.payload.ruleId?.trim());
  const hasPreviousVersion = Boolean(params.payload.previousLensVersion?.trim());
  const hasNextVersion = Boolean(params.payload.nextLensVersion?.trim());
  const hasRuleTupleField = hasRuleId || hasPreviousVersion || hasNextVersion;

  if (!hasRuleTupleField) {
    return { ok: true };
  }

  const missing: string[] = [];
  if (!hasRuleId) {
    missing.push('ruleId');
  }
  if (!hasPreviousVersion) {
    missing.push('previousLensVersion');
  }
  if (!hasNextVersion) {
    missing.push('nextLensVersion');
  }

  if (missing.length > 0) {
    return {
      ok: false,
      message:
        'lens_upgraded rule-bound upgrades require ruleId, previousLensVersion, and nextLensVersion together.',
      details: {
        missingFields: missing
      }
    };
  }

  if (!params.governancePolicies) {
    return { ok: true };
  }

  const normalizedRuleId = normalizeRuleId(params.payload.ruleId!);
  const rule = params.governancePolicies.lensUpgradeRuleById.get(normalizedRuleId);
  if (!rule) {
    return {
      ok: false,
      message: `Unknown lens upgrade ruleId: ${params.payload.ruleId}.`,
      details: {
        ruleId: params.payload.ruleId
      }
    };
  }

  if (
    rule.fromVersion !== params.payload.previousLensVersion ||
    rule.toVersion !== params.payload.nextLensVersion
  ) {
    return {
      ok: false,
      message: `lens_upgraded payload version tuple does not match governance rule ${rule.ruleId}.`,
      details: {
        ruleId: rule.ruleId,
        expected: {
          previousLensVersion: rule.fromVersion,
          nextLensVersion: rule.toVersion
        },
        received: {
          previousLensVersion: params.payload.previousLensVersion,
          nextLensVersion: params.payload.nextLensVersion
        }
      }
    };
  }

  if (
    Array.isArray(rule.permittedLensIds) &&
    rule.permittedLensIds.length > 0 &&
    params.payload.selectedLensId &&
    !rule.permittedLensIds.includes(params.payload.selectedLensId)
  ) {
    return {
      ok: false,
      message: `Lens ${params.payload.selectedLensId} is not permitted for governance rule ${rule.ruleId}.`,
      details: {
        ruleId: rule.ruleId,
        selectedLensId: params.payload.selectedLensId,
        permittedLensIds: rule.permittedLensIds
      }
    };
  }

  return { ok: true };
}

function isDidKeyDid(value: string): boolean {
  return value.startsWith('did:key:z');
}

function hasNonEmptyPublicKey(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

async function ensureVerifiableSigner(params: {
  req: Request;
  res: Response;
  didRegistry: DidRegistry;
  signerDid: string;
}): Promise<Response | null> {
  if (env.SPHERE_SIGNATURE_VERIFICATION === 'off') {
    await params.didRegistry.register({ did: params.signerDid });
    return null;
  }

  if (isDidKeyDid(params.signerDid)) {
    return null;
  }

  const identity = await params.didRegistry.get(params.signerDid);
  if (!identity || !hasNonEmptyPublicKey(identity.publicKey)) {
    return sendSphereError(params.req, params.res, 401, {
      code: 'SPHERE_ERR_SIGNER_KEY_REQUIRED',
      message: 'Signer DID must be did:key or a registered DID with an Ed25519 public key.',
      retryable: false,
      details: {
        signerDid: params.signerDid,
        verificationMode: env.SPHERE_SIGNATURE_VERIFICATION
      }
    });
  }

  return null;
}

function parseBooleanHeader(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

function parseCursor(req: Request): number {
  if (typeof req.query.from_sequence === 'string') {
    const fromSequence = Number.parseInt(req.query.from_sequence, 10);
    if (!Number.isNaN(fromSequence) && fromSequence > 0) {
      return fromSequence - 1;
    }
  }

  const cursorRaw =
    typeof req.query.cursor === 'string'
      ? req.query.cursor
      : req.header('last-event-id') ?? req.header('x-replay-cursor') ?? '0';
  const parsed = Number.parseInt(String(cursorRaw), 10);
  return Number.isNaN(parsed) ? 0 : Math.max(parsed, 0);
}

function parseAckCursor(req: Request): number {
  const cursorRaw =
    typeof req.query.ack_cursor === 'string'
      ? req.query.ack_cursor
      : typeof req.query.cursor === 'string'
        ? req.query.cursor
      : req.header('x-ack-replay-cursor') ?? '0';
  const parsed = Number.parseInt(String(cursorRaw), 10);
  return Number.isNaN(parsed) ? 0 : Math.max(parsed, 0);
}

function applyTraceId(req: Request, res: Response): string {
  const traceId = resolveTraceId(req);
  req.sphereTraceId = traceId;
  res.setHeader('x-trace-id', traceId);
  return traceId;
}

function sendRouteError(req: Request, res: Response, err: unknown): Response {
  if (err instanceof ConductorError) {
    return sendSphereError(req, res, err.status, {
      code: err.code,
      message: err.message,
      retryable: err.status >= 500
    });
  }

  if (err instanceof MissionServiceError) {
    return sendSphereError(req, res, 503, {
      code: err.code,
      message: err.message,
      retryable: true
    });
  }

  return sendSphereError(req, res, 500, {
    code: 'SPHERE_ERR_INTERNAL',
    message: err instanceof Error ? err.message : 'Internal Sphere route error.',
    retryable: true
  });
}

function registerGet(router: Router, bases: string[], suffix: string, handler: RequestHandler): void {
  for (const base of bases) {
    router.get(`${base}${suffix}`, handler);
  }
}

function registerPost(router: Router, bases: string[], suffix: string, handler: RequestHandler): void {
  for (const base of bases) {
    router.post(`${base}${suffix}`, handler);
  }
}

function registerUnifiedRoutes(
  router: Router,
  bases: string[],
  handler: {
    capabilities: RequestHandler;
    lensUpgradeRules: RequestHandler;
    status: RequestHandler;
    didList: RequestHandler;
    didGet: RequestHandler;
    didUpsert: RequestHandler;
    submitMessage: RequestHandler;
    submitCycleEvent: RequestHandler;
    missions: RequestHandler;
    thread: RequestHandler;
    cycleState: RequestHandler;
    verifyLedger: RequestHandler;
    conductorKeyList: RequestHandler;
    rotateConductorKey: RequestHandler;
    retireConductorKey: RequestHandler;
    lensProgression: RequestHandler;
    threadAcks: RequestHandler;
    replay: RequestHandler;
    stream: RequestHandler;
    ack: RequestHandler;
    haltAll: RequestHandler;
  }
): void {
  registerGet(router, bases, '/capabilities', handler.capabilities);
  registerGet(router, bases, '/lens-upgrade-rules', handler.lensUpgradeRules);
  registerGet(router, bases, '/status', handler.status);
  registerGet(router, bases, '/dids', handler.didList);
  registerGet(router, bases, '/dids/:did', handler.didGet);
  registerPost(router, bases, '/dids', handler.didUpsert);
  registerPost(router, bases, '/messages', handler.submitMessage);
  registerPost(router, bases, '/cycle-events', handler.submitCycleEvent);
  registerPost(router, bases, '/missions', handler.missions);
  registerGet(router, bases, '/threads/:threadId', handler.thread);
  registerGet(router, bases, '/threads/:threadId/cycle-state', handler.cycleState);
  registerGet(router, bases, '/threads/:threadId/verify-ledger', handler.verifyLedger);
  registerGet(router, bases, '/conductor-keys', handler.conductorKeyList);
  registerPost(router, bases, '/rotate-conductor-key', handler.rotateConductorKey);
  registerPost(router, bases, '/retire-conductor-key', handler.retireConductorKey);
  registerGet(router, bases, '/threads/:threadId/lens-progression', handler.lensProgression);
  registerGet(router, bases, '/threads/:threadId/acks', handler.threadAcks);
  registerGet(router, bases, '/threads/:threadId/replay', handler.replay);
  registerGet(router, bases, '/threads/:threadId/stream', handler.stream);
  registerPost(router, bases, '/threads/:threadId/ack', handler.ack);
  registerPost(router, bases, '/halt-all', handler.haltAll);
}

function isSphereBoundaryPath(path: string): boolean {
  return (
    path.startsWith(`${CANONICAL_SPHERE_BASE}/`) ||
    path === CANONICAL_SPHERE_BASE ||
    path.startsWith(`${LEGACY_ALIAS_BASE}/`) ||
    path === LEGACY_ALIAS_BASE ||
    path === '/api/v1/threads/halt-all'
  );
}

export function createSphereRoutes(options: SphereRouteOptions): Router {
  const router = Router();
  const bases = [CANONICAL_SPHERE_BASE];
  if (options.includeLegacyAlias) {
    bases.push(LEGACY_ALIAS_BASE);
  }

  router.use((req, res, next) => {
    if (!isSphereBoundaryPath(req.path)) {
      next();
      return;
    }
    applyTraceId(req, res);
    next();
  });
  router.use((req, res, next) => {
    if (!isSphereBoundaryPath(req.path)) {
      next();
      return;
    }
    sphereServiceAuthMiddleware(req, res, next);
  });
  router.use((req, res, next) => {
    if (
      req.path.startsWith(`${LEGACY_ALIAS_BASE}/`) ||
      req.path === LEGACY_ALIAS_BASE ||
      req.path === '/api/v1/threads/halt-all'
    ) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Link', `</${CANONICAL_SPHERE_BASE.slice(1)}>; rel="successor-version"`);
      res.setHeader('x-sphere-canonical-base', CANONICAL_SPHERE_BASE);
    }
    next();
  });

  const capabilitiesHandler: RequestHandler = (req, res) => {
    const conductorSignatureProfile = options.conductor.getConductorSignatureProfile?.() ?? {
      mode: 'hmac_sha256_internal',
      algorithms: ['hmac_sha256'],
      ed25519KeyId: null
    };
    const conductorSignaturePolicy = options.conductor.getConductorSignatureVerificationPolicy?.() ?? {
      requireV2: env.SPHERE_LEDGER_REQUIRE_V2_SIGNATURE,
      activationAt: env.SPHERE_LEDGER_V2_ACTIVATION_AT ?? null,
      graceDays: env.SPHERE_LEDGER_V2_GRACE_DAYS
    };

    return res.json({
      apiVersion: 'v1',
      surface: {
        canonicalBase: CANONICAL_SPHERE_BASE,
        legacyAliasBase: options.includeLegacyAlias ? LEGACY_ALIAS_BASE : null,
        legacyAliasDeprecated: options.includeLegacyAlias,
        legacyAliasSuccessorBase: options.includeLegacyAlias ? CANONICAL_SPHERE_BASE : null
      },
      sphereThreadEnabled: true,
      auth: {
        boundary: 'TMA -> Webapp BFF -> Sphere',
        serviceTokenRequired: true,
        agentApiKeyHeader: 'x-agent-api-key',
        agentApiKeyWriteRequired: env.SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES,
        threadAccessModel: 'principal_membership_acl',
        acceptsDirectTmaAuth: false,
        principal: req.spherePrincipal ?? null
      },
      features: {
        status: true,
        missions: true,
        messages: true,
        cycleEvents: true,
        dids: true,
        threadRead: true,
        threadAcks: true,
        replay: true,
        stream: true,
        ack: true,
        haltAll: true,
        threadMemberships: true,
        threadInvites: true,
        lensUpgradeRules: true,
        lensProgression: true,
        cycleState: true,
        ledgerVerification: true,
        conductorKeyRegistry: true,
        conductorKeyRotation: true,
        conductorKeyRetirement: true
      },
      protocol: {
        stream: {
          mode: 'sse',
          replay: true,
          ack: true,
          cursorQuery: 'cursor',
          ackCursorQuery: 'ack_cursor',
          fromSequenceQuery: 'from_sequence',
          lastEventIdHeader: 'last-event-id',
          replayCursorHeader: 'x-replay-cursor',
          ackReplayCursorHeader: 'x-ack-replay-cursor',
          retryMs: 1000
        },
        writeEnvelope: {
          validationMode: 'strict_v1',
          schemaVersion: '3.0',
          missionsRequiredFields: missionWriteRequiredFields,
          messagesRequiredFields: messageWriteRequiredFields,
          cycleEventsRequiredFields: cycleEventWriteRequiredFields,
          ackRequiredFields: ackWriteRequiredFields
        },
        cycleEventTaxonomy: {
          eventTypes: CYCLE_EVENT_TYPES,
          phaseTransitions: {
            start: allowedCycleTransitionsFrom(null),
            seat_taken: allowedCycleTransitionsFrom('seat_taken'),
            perspective_submitted: allowedCycleTransitionsFrom('perspective_submitted'),
            synthesis_returned: allowedCycleTransitionsFrom('synthesis_returned'),
            lens_upgraded: allowedCycleTransitionsFrom('lens_upgraded')
          },
          initialEventTypes: cycleStateStartEventTypes
        },
        ledgerVerification: {
          hashAlgorithm: 'sha256',
          chainField: 'ledgerEnvelope.prevMessageHash',
          entryHashField: 'sphere_events.entry_hash'
        },
        cycleEventPayloadContracts: {
          schemaVersion: '3.0',
          cycleEventTypeField: 'eventType',
          payloadCycleEventTypeField: 'cycleEventType',
          lensUpgradeRuleBinding: {
            tupleFields: lensUpgradeRuleTupleFields,
            governanceRegistryVersion: options.governancePolicies?.lensUpgradeRegistry.version ?? null,
            enforcementMode: options.governancePolicies ? 'governed' : 'best_effort'
          },
          contracts: cycleEventPayloadContracts
        }
      },
      signatures: {
        clientEnvelopeAgentSignatureRequired: true,
        runtimeVerificationMode: env.SPHERE_SIGNATURE_VERIFICATION,
        conductorSigningMode: conductorSignatureProfile.mode,
        conductorAlgorithms: conductorSignatureProfile.algorithms,
        conductorEd25519KeyId: conductorSignatureProfile.ed25519KeyId,
        conductorV2Verification: conductorSignaturePolicy,
        targetPublicVerificationMode: 'ed25519_did_key_or_registered_key',
        nonDidKeyRequiresRegisteredPublicKey: env.SPHERE_SIGNATURE_VERIFICATION !== 'off'
      },
      errors: {
        envelopeFields: ['code', 'message', 'retryable', 'details', 'traceId']
      },
      traceId: req.sphereTraceId
    });
  };

  const lensUpgradeRulesHandler: RequestHandler = (req, res) => {
    const registry = options.governancePolicies?.lensUpgradeRegistry;
    return res.json({
      registryVersion: registry?.version ?? null,
      description: registry?.description ?? null,
      tupleFields: lensUpgradeRuleTupleFields,
      rules: registry?.rules ?? [],
      traceId: req.sphereTraceId
    });
  };

  const statusHandler: RequestHandler = async (req, res) => {
    try {
      const threads = await options.conductor.listThreads();
      const degradedThreads = threads.filter((thread) => thread.state === 'DEGRADED_NO_LLM').length;
      const haltedThreads = threads.filter((thread) => thread.state === 'HALTED').length;
      const governanceMetrics = options.conductor.getGovernanceMetricsSnapshot?.() ?? null;

      return res.json({
        systemState: options.conductor.getSystemState(),
        degradedNoLlmReason: options.conductor.getDegradedNoLlmReason(),
        threadCount: threads.length,
        degradedThreads,
        haltedThreads,
        governanceMetrics,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const didListHandler: RequestHandler = async (req, res) => {
    try {
      const limitRaw = Number.parseInt(String(req.query.limit ?? '100'), 10);
      const limit = Number.isNaN(limitRaw) ? 100 : limitRaw;
      const dids = await options.didRegistry.list({ limit });
      return res.json({
        dids,
        count: dids.length,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const didGetHandler: RequestHandler = async (req, res) => {
    try {
      const did = await options.didRegistry.get(req.params.did);
      if (!did) {
        return sendSphereError(req, res, 404, {
          code: 'SPHERE_ERR_DID_NOT_FOUND',
          message: 'DID not found.',
          retryable: false
        });
      }

      return res.json({
        did,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const didUpsertHandler: RequestHandler = async (req, res) => {
    const parsed = didUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendSphereError(req, res, 400, {
        code: 'SPHERE_ERR_INVALID_SCHEMA',
        message: 'Invalid DID registration payload.',
        retryable: false,
        details: parsed.error.flatten()
      });
    }

    try {
      if (
        !isDidKeyDid(parsed.data.did) &&
        !hasNonEmptyPublicKey(parsed.data.publicKey) &&
        env.SPHERE_SIGNATURE_VERIFICATION !== 'off'
      ) {
        return sendSphereError(req, res, 400, {
          code: 'SPHERE_ERR_INVALID_SCHEMA',
          message:
            'Non did:key DID registration requires a publicKey when signature verification is enabled.',
          retryable: false
        });
      }

      const did = await options.didRegistry.register(parsed.data);
      return res.status(201).json({
        did,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const submitMessageHandler: RequestHandler = async (req, res) => {
    const parsed = submitMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendSphereError(req, res, 400, {
        code: 'SPHERE_ERR_INVALID_SCHEMA',
        message: 'Invalid sphere message envelope.',
        retryable: false,
        details: parsed.error.flatten()
      });
    }

    try {
      const input = parsed.data;
      const signerValidation = await ensureVerifiableSigner({
        req,
        res,
        didRegistry: options.didRegistry,
        signerDid: input.authorAgentId
      });
      if (signerValidation) {
        return signerValidation;
      }
      const entry = await options.conductor.dispatchIntent({
        threadId: input.threadId,
        missionId: input.missionId,
        authorAgentId: input.authorAgentId,
        messageId: input.messageId,
        intent: input.intent,
        payload: input.payload,
        schemaVersion: input.schemaVersion,
        protocolVersion: input.protocolVersion,
        traceId: input.traceId,
        causationId: input.causationId,
        attestation: input.attestation,
        agentSignature: input.agentSignature,
        idempotencyKey: input.idempotencyKey,
        prismHolderApproved: input.prismHolderApproved
      });

      return res.status(201).json({
        threadId: input.threadId,
        sequence: entry.ledgerEnvelope.sequence,
        timestamp: entry.ledgerEnvelope.timestamp,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const submitCycleEventHandler: RequestHandler = async (req, res) => {
    const parsed = submitCycleEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendSphereError(req, res, 400, {
        code: 'SPHERE_ERR_INVALID_SCHEMA',
        message: 'Invalid cycle event envelope.',
        retryable: false,
        details: parsed.error.flatten()
      });
    }

    try {
      const input = parsed.data;
      const payloadEventType =
        typeof input.payload.cycleEventType === 'string' ? input.payload.cycleEventType : undefined;
      if (payloadEventType && payloadEventType !== input.eventType) {
        return sendSphereError(req, res, 400, {
          code: 'SPHERE_ERR_INVALID_SCHEMA',
          message: 'cycleEventType in payload must match eventType in the envelope.',
          retryable: false,
          details: {
            eventType: input.eventType,
            payloadCycleEventType: payloadEventType
          }
        });
      }

      const payloadValidation = parseCycleEventPayload(input.eventType, input.payload);
      if (!payloadValidation.success) {
        return sendSphereError(req, res, 400, {
          code: 'SPHERE_ERR_INVALID_SCHEMA',
          message: `Invalid ${input.eventType} payload contract.`,
          retryable: false,
          details: payloadValidation.error.flatten()
        });
      }

      if (input.eventType === 'lens_upgraded') {
        const ruleBindingValidation = validateLensUpgradeRuleBinding({
          payload: payloadValidation.data,
          governancePolicies: options.governancePolicies
        });

        if (!ruleBindingValidation.ok) {
          return sendSphereError(req, res, 400, {
            code: 'SPHERE_ERR_INVALID_SCHEMA',
            message: ruleBindingValidation.message,
            retryable: false,
            details: ruleBindingValidation.details
          });
        }
      }

      const thread = await options.conductor.getThread(input.threadId);
      if (!thread) {
        if (input.eventType !== 'seat_taken') {
          return sendSphereError(req, res, 409, {
            code: 'SPHERE_ERR_INVALID_CYCLE_PHASE',
            message: 'Cycle thread must begin with seat_taken.',
            retryable: false,
            details: {
              previousEventType: null,
              expectedNextEventTypes: ['seat_taken'],
              receivedEventType: input.eventType
            }
          });
        }
      } else {
        const entries = Array.isArray(thread.entries)
          ? (thread.entries as unknown as Array<Record<string, unknown>>)
          : [];
        const phaseValidation = validateCyclePhaseTransition({
          entries,
          eventType: input.eventType
        });
        if (!phaseValidation.ok) {
          return sendSphereError(req, res, 409, {
            code: 'SPHERE_ERR_INVALID_CYCLE_PHASE',
            message: phaseValidation.message,
            retryable: false,
            details: phaseValidation.details
          });
        }
      }

      const signerValidation = await ensureVerifiableSigner({
        req,
        res,
        didRegistry: options.didRegistry,
        signerDid: input.authorAgentId
      });
      if (signerValidation) {
        return signerValidation;
      }

      const intent = cycleEventTypeToIntent(input.eventType);
      const entry = await options.conductor.dispatchIntent({
        threadId: input.threadId,
        missionId: input.missionId,
        authorAgentId: input.authorAgentId,
        messageId: input.messageId,
        intent,
        payload: {
          ...payloadValidation.data,
          cycleEventType: input.eventType
        },
        schemaVersion: input.schemaVersion,
        protocolVersion: input.protocolVersion,
        traceId: input.traceId,
        causationId: input.causationId,
        attestation: input.attestation,
        agentSignature: input.agentSignature,
        idempotencyKey: input.idempotencyKey,
        prismHolderApproved: input.prismHolderApproved
      });

      return res.status(201).json({
        threadId: input.threadId,
        eventType: input.eventType,
        intent,
        sequence: entry.ledgerEnvelope.sequence,
        timestamp: entry.ledgerEnvelope.timestamp,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const missionsHandler: RequestHandler = async (req, res) => {
    const parsed = dispatchMissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendSphereError(req, res, 400, {
        code: 'SPHERE_ERR_INVALID_SCHEMA',
        message: 'Invalid mission dispatch payload.',
        retryable: false,
        details: parsed.error.flatten()
      });
    }

    const input = parsed.data;
    const prismHolderApproved =
      input.prismHolderApproved ?? parseBooleanHeader(req.header('x-prism-holder-approved'));

    let threadId = input.threadId;
    let missionId = input.missionId;

    try {
      const signerValidation = await ensureVerifiableSigner({
        req,
        res,
        didRegistry: options.didRegistry,
        signerDid: input.agentDid
      });
      if (signerValidation) {
        return signerValidation;
      }
      const thread = await options.conductor.createThread({
        threadId: input.threadId,
        missionId: input.missionId,
        createdBy: input.agentDid
      });
      threadId = thread.threadId;
      missionId = thread.missionId;

      if (options.conductor.getSystemState() === 'DEGRADED_NO_LLM') {
        const reason = options.conductor.getDegradedNoLlmReason() ?? 'LLM outage in production';
        await options.conductor.markThreadDegradedNoLlm(thread.threadId, reason);
        const degradedThread = await options.conductor.getThread(thread.threadId);
        return sendSphereError(req, res, 503, {
          code: 'DEGRADED_NO_LLM',
          message: 'Model-dependent mission execution is blocked while LLM is unavailable.',
          retryable: true,
          details: {
            degraded: true,
            degradedReason: reason,
            threadId: thread.threadId,
            missionId: thread.missionId,
            state: degradedThread?.state
          }
        });
      }

      const dispatchEntry = await options.conductor.dispatchIntent({
        threadId: thread.threadId,
        missionId: thread.missionId,
        authorAgentId: input.agentDid,
        messageId: input.messageId,
        intent: input.intent,
        payload: {
          objective: input.objective,
          provider: input.provider,
          submittedAt: new Date().toISOString()
        },
        schemaVersion: input.schemaVersion,
        attestation: input.attestation,
        agentSignature: input.agentSignature,
        idempotencyKey: input.idempotencyKey,
        traceId: input.traceId,
        prismHolderApproved
      });

      const report = await generateMissionReport({
        agentDid: input.agentDid,
        objective: input.objective,
        provider: input.provider
      });

      if (report.degraded) {
        await options.conductor.markThreadDegradedNoLlm(
          thread.threadId,
          report.degradedReason ?? 'LLM unavailable'
        );
      }

      const reportEntry = await options.conductor.dispatchIntent({
        threadId: thread.threadId,
        missionId: thread.missionId,
        authorAgentId: 'did:system:conductor',
        intent: 'MISSION_REPORT',
        payload: {
          report,
          completedAt: new Date().toISOString(),
          sourceAgentDid: input.agentDid
        },
        causationId: [dispatchEntry.clientEnvelope.messageId],
        prismHolderApproved: true,
        idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:report` : undefined,
        traceId: input.traceId,
        derivedFromVerifiedCommand: true
      });

      const updatedThread = await options.conductor.getThread(thread.threadId);

      return res.status(201).json({
        threadId: thread.threadId,
        missionId: thread.missionId,
        state: updatedThread?.state,
        report,
        logEntries: [
          dispatchEntry.clientEnvelope.messageId,
          reportEntry.clientEnvelope.messageId
        ],
        traceId: req.sphereTraceId
      });
    } catch (err) {
      if (err instanceof MissionServiceError && env.RUNTIME_ENV === 'production') {
        options.conductor.enterGlobalDegradedNoLlm(err.message);
      }

      if (err instanceof MissionServiceError) {
        const degradedThread = threadId
          ? await options.conductor.markThreadDegradedNoLlm(threadId, err.message)
          : null;
        const runtimeDetails = err.details ? { runtime: err.details.runtime ?? err.details } : {};

        return sendSphereError(req, res, 503, {
          code: err.code,
          message: err.message,
          retryable: true,
          details: {
            degraded: true,
            degradedReason: err.message,
            threadId,
            missionId,
            state: degradedThread?.state ?? 'DEGRADED_NO_LLM',
            ...runtimeDetails
          }
        });
      }

      return sendRouteError(req, res, err);
    }
  };

  const threadHandler: RequestHandler = async (req, res) => {
    try {
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return sendSphereError(req, res, 404, {
          code: 'SPHERE_ERR_THREAD_NOT_FOUND',
          message: 'Thread not found.',
          retryable: false
        });
      }

      return res.json({
        threadId: thread.threadId,
        missionId: thread.missionId,
        createdAt: thread.createdAt,
        createdBy: thread.createdBy,
        state: thread.state,
        entries: thread.entries,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const cycleStateHandler: RequestHandler = async (req, res) => {
    try {
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return sendSphereError(req, res, 404, {
          code: 'SPHERE_ERR_THREAD_NOT_FOUND',
          message: 'Thread not found.',
          retryable: false
        });
      }

      const entries = Array.isArray(thread.entries)
        ? (thread.entries as unknown as Array<Record<string, unknown>>)
        : [];
      const cycleState = computeCycleState(entries);

      return res.json({
        threadId: thread.threadId,
        threadState: thread.state,
        phase: cycleState.phase,
        expectedNextEventTypes: cycleState.expectedNextEventTypes,
        initialEventTypes: cycleStateStartEventTypes,
        cycleStarted: cycleState.cycleStarted,
        completedRounds: cycleState.completedRounds,
        eventCounts: cycleState.eventCounts,
        lastEvent: cycleState.lastEvent,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const verifyLedgerHandler: RequestHandler = async (req, res) => {
    try {
      const report = await options.conductor.verifyThreadLedger(req.params.threadId);
      if (!report) {
        return sendSphereError(req, res, 404, {
          code: 'SPHERE_ERR_THREAD_NOT_FOUND',
          message: 'Thread not found.',
          retryable: false
        });
      }

      return res.json({
        ...report,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const conductorKeyListHandler: RequestHandler = async (req, res) => {
    try {
      const keys = await options.conductor.listConductorKeys();
      return res.json({
        keys,
        activeKeyId:
          keys.find((key) => key.status === 'ACTIVE')?.keyId ??
          options.conductor.getConductorSignatureProfile().ed25519KeyId,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const rotateConductorKeyHandler: RequestHandler = async (req, res) => {
    const parsed = rotateConductorKeySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendSphereError(req, res, 400, {
        code: 'SPHERE_ERR_INVALID_SCHEMA',
        message: 'Invalid rotate-conductor-key payload.',
        retryable: false,
        details: parsed.error.flatten()
      });
    }

    try {
      const rotated = await options.conductor.rotateConductorKey(parsed.data);
      return res.status(201).json({
        rotatedKey: rotated.key,
        previousActiveKeyId: rotated.previousActiveKeyId,
        gracePeriodEndsAt: rotated.gracePeriodEndsAt,
        privateKeyPem: rotated.privateKeyPem,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const retireConductorKeyHandler: RequestHandler = async (req, res) => {
    const parsed = retireConductorKeySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendSphereError(req, res, 400, {
        code: 'SPHERE_ERR_INVALID_SCHEMA',
        message: 'Invalid retire-conductor-key payload.',
        retryable: false,
        details: parsed.error.flatten()
      });
    }

    try {
      const retired = await options.conductor.retireConductorKey(parsed.data);
      return res.status(200).json({
        retiredKey: retired.key,
        gracePeriodEndsAt: retired.gracePeriodEndsAt,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const lensProgressionHandler: RequestHandler = async (req, res) => {
    try {
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return sendSphereError(req, res, 404, {
          code: 'SPHERE_ERR_THREAD_NOT_FOUND',
          message: 'Thread not found.',
          retryable: false
        });
      }

      const progression = computeLensProgression({
        entries: thread.entries as unknown as Array<Record<string, unknown>>,
        governancePolicies: options.governancePolicies
      });
      const latestUpgrade =
        progression.upgrades.length > 0
          ? progression.upgrades[progression.upgrades.length - 1]
          : null;

      return res.json({
        threadId: thread.threadId,
        initialVersion: progression.initialVersion,
        currentVersion: progression.currentVersion,
        upgradeCount: progression.upgrades.length,
        latestUpgrade,
        upgrades: progression.upgrades,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const threadAcksHandler: RequestHandler = async (req, res) => {
    try {
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return sendSphereError(req, res, 404, {
          code: 'SPHERE_ERR_THREAD_NOT_FOUND',
          message: 'Thread not found.',
          retryable: false
        });
      }

      const cursor = parseAckCursor(req);
      const limitRaw = Number.parseInt(String(req.query.limit ?? '100'), 10);
      const limit = Number.isNaN(limitRaw) ? 100 : limitRaw;
      const actorDid = typeof req.query.actor_did === 'string' ? req.query.actor_did : undefined;
      const result = await options.conductor.getThreadAcks({
        threadId: thread.threadId,
        cursor,
        limit,
        actorDid
      });

      return res.json({
        threadId: thread.threadId,
        cursor,
        nextCursor: result.nextCursor,
        acks: result.acks,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const replayHandler: RequestHandler = async (req, res) => {
    try {
      const cursor = parseCursor(req);
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return sendSphereError(req, res, 404, {
          code: 'SPHERE_ERR_THREAD_NOT_FOUND',
          message: 'Thread not found.',
          retryable: false
        });
      }

      const fromSequence = cursor + 1;
      const entries = await options.conductor.getThreadReplay(thread.threadId, fromSequence);
      const nextCursor =
        entries.length > 0 ? entries[entries.length - 1].ledgerEnvelope.sequence : cursor;

      return res.json({
        threadId: thread.threadId,
        cursor,
        nextCursor,
        entries,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const streamHandler: RequestHandler = async (req, res) => {
    const traceId = applyTraceId(req, res);

    try {
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return sendSphereError(req, res, 404, {
          code: 'SPHERE_ERR_THREAD_NOT_FOUND',
          message: 'Thread not found.',
          retryable: false
        });
      }

      let cursor = parseCursor(req);
      let ackCursor = parseAckCursor(req);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write('retry: 1000\n\n');

      const send = (event: string, payload: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      const sendEntry = (entry: unknown & { ledgerEnvelope?: { sequence?: number } }, replay = false) => {
        const sequence =
          typeof entry.ledgerEnvelope?.sequence === 'number' ? entry.ledgerEnvelope.sequence : cursor;
        cursor = Math.max(cursor, sequence);
        res.write(`id: ${sequence}\n`);
        send('log_entry', {
          replay,
          cursor: sequence,
          entry
        });
      };

      const sendAck = (ack: { ackId?: number }, ackPayload: { ack: unknown }, replay = false) => {
        const emittedAckCursor = typeof ack.ackId === 'number' ? ack.ackId : ackCursor;
        ackCursor = Math.max(ackCursor, emittedAckCursor);
        send('ack_entry', {
          replay,
          ackCursor: emittedAckCursor,
          ...ackPayload
        });
      };

      send('ready', {
        threadId: thread.threadId,
        missionId: thread.missionId,
        state: thread.state,
        cursor,
        ackCursor,
        retryMs: 1000,
        ackEndpoint: `/api/v1/sphere/threads/${thread.threadId}/ack`,
        ackReplayEndpoint: `/api/v1/sphere/threads/${thread.threadId}/acks`,
        traceId
      });

      const replayFrom = cursor + 1;
      const replayEntries = await options.conductor.getThreadReplay(thread.threadId, replayFrom);
      for (const entry of replayEntries) {
        sendEntry(entry, true);
      }

      const replayAcks = await options.conductor.getThreadAcks({
        threadId: thread.threadId,
        cursor: ackCursor
      });
      for (const ack of replayAcks.acks) {
        sendAck(ack, { ack }, true);
      }
      ackCursor = replayAcks.nextCursor;

      const onLogEntry = (payload: { threadId: string; entry: unknown & { ledgerEnvelope?: { sequence?: number } } }) => {
        if (payload.threadId !== thread.threadId) {
          return;
        }
        sendEntry(payload.entry, false);
      };

      const onAckEntry = (payload: { threadId: string; ack: { ackId?: number } }) => {
        if (payload.threadId !== thread.threadId) {
          return;
        }
        sendAck(payload.ack, { ack: payload.ack }, false);
      };

      const heartbeat = setInterval(() => {
        send('heartbeat', { at: new Date().toISOString(), cursor, ackCursor, traceId });
      }, 15000);

      options.conductor.on('log_entry', onLogEntry);
      options.conductor.on('ack_entry', onAckEntry);

      req.on('close', () => {
        clearInterval(heartbeat);
        options.conductor.off('log_entry', onLogEntry);
        options.conductor.off('ack_entry', onAckEntry);
        res.end();
      });

      return undefined;
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const ackHandler: RequestHandler = async (req, res) => {
    const parsed = streamAckSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendSphereError(req, res, 400, {
        code: 'SPHERE_ERR_INVALID_SCHEMA',
        message: 'Invalid ACK payload.',
        retryable: false,
        details: parsed.error.flatten()
      });
    }

    try {
      const input = parsed.data;
      const signerValidation = await ensureVerifiableSigner({
        req,
        res,
        didRegistry: options.didRegistry,
        signerDid: input.actorDid
      });
      if (signerValidation) {
        return signerValidation;
      }
      const ack = await options.conductor.acknowledgeEntry({
        threadId: req.params.threadId,
        actorDid: input.actorDid,
        targetSequence: input.targetSequence,
        targetMessageId: input.targetMessageId,
        ackMessageId: input.ackMessageId,
        traceId: input.traceId,
        intent: input.intent,
        schemaVersion: input.schemaVersion,
        attestation: input.attestation,
        agentSignature: input.agentSignature,
        receivedAt: input.receivedAt
      });

      return res.status(201).json({
        ack,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  const haltAllHandler: RequestHandler = async (req, res) => {
    const parsed = haltAllSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendSphereError(req, res, 400, {
        code: 'SPHERE_ERR_INVALID_SCHEMA',
        message: 'Invalid halt-all payload.',
        retryable: false,
        details: parsed.error.flatten()
      });
    }

    const input = parsed.data;
    const prismHolderApproved =
      input.prismHolderApproved ?? parseBooleanHeader(req.header('x-prism-holder-approved'));

    try {
      const signerValidation = await ensureVerifiableSigner({
        req,
        res,
        didRegistry: options.didRegistry,
        signerDid: input.actorDid
      });
      if (signerValidation) {
        return signerValidation;
      }
      const result = await options.conductor.haltAllThreads({
        actorDid: input.actorDid,
        actorRole: input.actorRole,
        messageId: input.messageId,
        traceId: input.traceId,
        intent: input.intent,
        schemaVersion: input.schemaVersion,
        attestation: input.attestation,
        agentSignature: input.agentSignature,
        reason: input.reason,
        confirmerDid: input.confirmerDid,
        confirmerRole: input.confirmerRole,
        emergencyCredential: input.emergencyCredential,
        prismHolderApproved
      });

      return res.status(202).json({
        haltedCount: result.haltedCount,
        threadIds: result.threadIds,
        timestamp: new Date().toISOString(),
        traceId: req.sphereTraceId
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  };

  registerUnifiedRoutes(router, bases, {
    capabilities: capabilitiesHandler,
    lensUpgradeRules: lensUpgradeRulesHandler,
    status: statusHandler,
    didList: didListHandler,
    didGet: didGetHandler,
    didUpsert: didUpsertHandler,
    submitMessage: submitMessageHandler,
    submitCycleEvent: submitCycleEventHandler,
    missions: missionsHandler,
    thread: threadHandler,
    cycleState: cycleStateHandler,
    verifyLedger: verifyLedgerHandler,
    conductorKeyList: conductorKeyListHandler,
    rotateConductorKey: rotateConductorKeyHandler,
    retireConductorKey: retireConductorKeyHandler,
    lensProgression: lensProgressionHandler,
    threadAcks: threadAcksHandler,
    replay: replayHandler,
    stream: streamHandler,
    ack: ackHandler,
    haltAll: haltAllHandler
  });

  if (options.includeLegacyAlias) {
    router.post('/api/v1/threads/halt-all', haltAllHandler);
  }

  return router;
}

export function createC2Routes(options: {
  conductor: SphereConductor;
  didRegistry: DidRegistry;
  governancePolicies?: GovernancePolicies;
}) {
  return createSphereRoutes({
    ...options,
    includeLegacyAlias: true
  });
}

import { expect, test } from '@playwright/test';
import {
  generateKeyPairSync,
  randomUUID,
  sign,
  type KeyObject
} from 'node:crypto';

const ENGINE_PORT = Number(process.env.ENGINE_PORT || 3101);
const ENGINE_URL = `http://localhost:${ENGINE_PORT}`;
const SPHERE_TOKEN = process.env.SPHERE_BFF_SERVICE_TOKEN || 'dev-sphere-bff-service-token';
const SCHEMA_VERSION = '3.0';
const PROTOCOL_VERSION = '3.0';
const ACK_INTENT = 'ACK_ENTRY';

const CYCLE_INTENT_BY_TYPE = {
  seat_taken: 'SEAT_TAKEN',
  perspective_submitted: 'PERSPECTIVE_SUBMITTED',
  synthesis_returned: 'SYNTHESIS_RETURNED',
  lens_upgraded: 'LENS_UPGRADED'
} as const;

type CycleEventType = keyof typeof CYCLE_INTENT_BY_TYPE;

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      sorted[key] = sortValue(nested);
    }
    return sorted;
  }

  return value;
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signCompactJws(params: { canonicalPayload: string; privateKey: KeyObject }): string {
  const header = encodeBase64Url(JSON.stringify({ alg: 'EdDSA' }));
  const payload = encodeBase64Url(params.canonicalPayload);
  const signature = sign(null, Buffer.from(`${header}.${payload}`, 'utf8'), params.privateKey);
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

function createSigningIdentity() {
  const pair = generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKey = pair.privateKey;
  return { privateKey, publicKeyPem };
}

test('cycle event flow supports replay and ack for seat->perspective->synthesis->lens-upgrade', async ({
  request
}) => {
  const did = `did:example:quality-agent-${randomUUID()}`;
  const { privateKey, publicKeyPem } = createSigningIdentity();
  const threadId = randomUUID();
  const cycleId = `cycle-${threadId.slice(0, 8)}`;
  const attestation = ['did:example:counselor-1'];

  const didRegisterResponse = await request.post(`${ENGINE_URL}/api/v1/sphere/dids`, {
    headers: {
      authorization: `Bearer ${SPHERE_TOKEN}`
    },
    data: {
      did,
      label: 'Quality Agent',
      publicKey: publicKeyPem
    }
  });
  expect(didRegisterResponse.status()).toBe(201);

  const cycleEvents: Array<{ eventType: CycleEventType; payload: Record<string, unknown> }> = [
    {
      eventType: 'seat_taken',
      payload: {
        cycleId,
        seatId: 'seat-01'
      }
    },
    {
      eventType: 'perspective_submitted',
      payload: {
        cycleId,
        perspective: 'A practical framing for constitutional learning.'
      }
    },
    {
      eventType: 'synthesis_returned',
      payload: {
        cycleId,
        synthesisId: randomUUID(),
        summary: 'Synthesis produced with aligned high-confidence findings.'
      }
    },
    {
      eventType: 'lens_upgraded',
      payload: {
        cycleId,
        previousLensVersion: '1.0.0',
        nextLensVersion: '1.1.0',
        ruleId: 'rule-lens-upgrade-v1'
      }
    }
  ];

  const committed: Array<{ messageId: string; sequence: number; intent: string }> = [];

  for (const [index, event] of cycleEvents.entries()) {
    const messageId = randomUUID();
    const traceId = randomUUID();
    const causationId = index > 0 ? [committed[index - 1].messageId] : [];
    const intent = CYCLE_INTENT_BY_TYPE[event.eventType];

    const clientEnvelope = {
      messageId,
      threadId,
      authorAgentId: did,
      intent,
      protocolVersion: PROTOCOL_VERSION,
      schemaVersion: SCHEMA_VERSION,
      traceId,
      causationId,
      attestation
    };
    const payload = {
      ...event.payload,
      cycleEventType: event.eventType
    };
    const canonicalPayload = canonicalize({
      clientEnvelope,
      payload
    });
    const agentSignature = signCompactJws({ canonicalPayload, privateKey });

    const response = await request.post(`${ENGINE_URL}/api/v1/sphere/cycle-events`, {
      headers: {
        authorization: `Bearer ${SPHERE_TOKEN}`
      },
      data: {
        threadId,
        authorAgentId: did,
        messageId,
        traceId,
        eventType: event.eventType,
        attestation,
        schemaVersion: SCHEMA_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        causationId,
        agentSignature,
        payload: event.payload
      }
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.eventType).toBe(event.eventType);
    expect(body.intent).toBe(intent);
    expect(typeof body.sequence).toBe('number');

    committed.push({ messageId, sequence: body.sequence as number, intent });
  }

  const replayResponse = await request.get(
    `${ENGINE_URL}/api/v1/sphere/threads/${threadId}/replay?from_sequence=1`,
    {
      headers: {
        authorization: `Bearer ${SPHERE_TOKEN}`
      }
    }
  );
  expect(replayResponse.status()).toBe(200);
  const replay = await replayResponse.json();
  expect(Array.isArray(replay.entries)).toBe(true);
  expect(replay.entries).toHaveLength(4);
  expect(replay.entries.map((entry: any) => entry.clientEnvelope.intent)).toEqual(
    committed.map((entry) => entry.intent)
  );
  expect(replay.entries.map((entry: any) => entry.clientEnvelope.messageId)).toEqual(
    committed.map((entry) => entry.messageId)
  );

  const targetEntry = replay.entries[replay.entries.length - 1];
  const ackMessageId = randomUUID();
  const ackTraceId = randomUUID();
  const receivedAt = new Date().toISOString();

  const ackCanonicalPayload = canonicalize({
    threadId,
    actorDid: did,
    targetSequence: Number(targetEntry.ledgerEnvelope.sequence),
    targetMessageId: String(targetEntry.clientEnvelope.messageId),
    ackMessageId,
    traceId: ackTraceId,
    intent: ACK_INTENT,
    schemaVersion: SCHEMA_VERSION,
    attestation,
    receivedAt
  });
  const ackSignature = signCompactJws({
    canonicalPayload: ackCanonicalPayload,
    privateKey
  });

  const ackResponse = await request.post(`${ENGINE_URL}/api/v1/sphere/threads/${threadId}/ack`, {
    headers: {
      authorization: `Bearer ${SPHERE_TOKEN}`
    },
    data: {
      actorDid: did,
      targetSequence: Number(targetEntry.ledgerEnvelope.sequence),
      targetMessageId: String(targetEntry.clientEnvelope.messageId),
      ackMessageId,
      traceId: ackTraceId,
      intent: ACK_INTENT,
      schemaVersion: SCHEMA_VERSION,
      attestation,
      agentSignature: ackSignature,
      receivedAt
    }
  });
  expect(ackResponse.status()).toBe(201);
  const ackBody = await ackResponse.json();
  expect(ackBody.ack?.targetMessageId).toBe(String(targetEntry.clientEnvelope.messageId));
  expect(ackBody.ack?.traceId).toBe(ackTraceId);

  const ackReplayResponse = await request.get(
    `${ENGINE_URL}/api/v1/sphere/threads/${threadId}/acks?cursor=0`,
    {
      headers: {
        authorization: `Bearer ${SPHERE_TOKEN}`
      }
    }
  );
  expect(ackReplayResponse.status()).toBe(200);
  const ackReplay = await ackReplayResponse.json();
  expect(Array.isArray(ackReplay.acks)).toBe(true);
  const recordedAck = ackReplay.acks.find((ack: any) => ack.ackMessageId === ackMessageId);
  expect(recordedAck).toBeTruthy();
  expect(recordedAck.targetMessageId).toBe(String(targetEntry.clientEnvelope.messageId));
});

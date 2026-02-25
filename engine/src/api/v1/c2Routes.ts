import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import type { DidRegistry } from '../../sphere/didRegistry.js';
import { ConductorError, SphereConductor } from '../../sphere/conductor.js';
import { generateMissionReport, MissionServiceError } from '../../agents/missionService.js';

const dispatchMissionSchema = z.object({
  threadId: z.string().uuid().optional(),
  missionId: z.string().uuid().optional(),
  agentDid: z.string().min(1),
  objective: z.string().min(3),
  provider: z.enum(['morpheus', 'groq', 'kimi', 'auto']).default('auto'),
  attestation: z.array(z.string().min(1)).optional(),
  idempotencyKey: z.string().min(1).optional(),
  traceId: z.string().uuid().optional(),
  prismHolderApproved: z.boolean().optional()
});

const haltAllSchema = z.object({
  actorDid: z.string().min(1),
  actorRole: z.string().min(1),
  reason: z.string().min(3),
  confirmerDid: z.string().min(1).optional(),
  confirmerRole: z.string().min(1).optional(),
  emergencyCredential: z.string().min(1).optional(),
  prismHolderApproved: z.boolean().optional()
});

function parseBooleanHeader(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

export function createC2Routes(options: {
  conductor: SphereConductor;
  didRegistry: DidRegistry;
}) {
  const router = Router();

  router.get('/api/v1/c2/status', async (_req, res) => {
    try {
      const threads = await options.conductor.listThreads();
      const degradedThreads = threads.filter((thread) => thread.state === 'DEGRADED_NO_LLM').length;
      const haltedThreads = threads.filter((thread) => thread.state === 'HALTED').length;

      return res.json({
        systemState: options.conductor.getSystemState(),
        degradedNoLlmReason: options.conductor.getDegradedNoLlmReason(),
        threadCount: threads.length,
        degradedThreads,
        haltedThreads
      });
    } catch (err) {
      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.post('/api/v1/c2/missions', async (req, res) => {
    const parsed = dispatchMissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: parsed.error.flatten()
      });
    }

    const input = parsed.data;
    const prismHolderApproved =
      input.prismHolderApproved ?? parseBooleanHeader(req.header('x-prism-holder-approved'));

    options.didRegistry.register({ did: input.agentDid });

    let threadId = input.threadId;
    let missionId = input.missionId;

    try {
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
        return res.status(503).json({
          error: 'DEGRADED_NO_LLM',
          message: 'Model-dependent mission execution is blocked while LLM is unavailable.',
          degraded: true,
          degradedReason: reason,
          threadId: thread.threadId,
          missionId: thread.missionId,
          state: degradedThread?.state
        });
      }

      const dispatchEntry = await options.conductor.dispatchIntent({
        threadId: thread.threadId,
        missionId: thread.missionId,
        authorAgentId: input.agentDid,
        intent: 'DISPATCH_MISSION',
        payload: {
          objective: input.objective,
          provider: input.provider,
          submittedAt: new Date().toISOString()
        },
        attestation: input.attestation,
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
        authorAgentId: input.agentDid,
        intent: 'MISSION_REPORT',
        payload: {
          report,
          completedAt: new Date().toISOString()
        },
        causationId: [dispatchEntry.clientEnvelope.messageId],
        prismHolderApproved: true,
        idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:report` : undefined,
        traceId: input.traceId
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
        ]
      });
    } catch (err) {
      if (err instanceof MissionServiceError) {
        if (env.RUNTIME_ENV === 'production') {
          options.conductor.enterGlobalDegradedNoLlm(err.message);
        }
        const degradedThread = threadId
          ? await options.conductor.markThreadDegradedNoLlm(threadId, err.message)
          : null;
        return res.status(503).json({
          error: err.code,
          message: err.message,
          degraded: true,
          degradedReason: err.message,
          threadId,
          missionId,
          state: degradedThread?.state ?? 'DEGRADED_NO_LLM'
        });
      }

      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }

      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/api/v1/c2/threads/:threadId', async (req, res) => {
    try {
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      return res.json({
        threadId: thread.threadId,
        missionId: thread.missionId,
        createdAt: thread.createdAt,
        createdBy: thread.createdBy,
        state: thread.state,
        entries: thread.entries
      });
    } catch (err) {
      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/api/v1/c2/threads/:threadId/replay', async (req, res) => {
    try {
      const fromSequence = Number.parseInt(String(req.query.from_sequence ?? '1'), 10);
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      return res.json({
        threadId: thread.threadId,
        fromSequence,
        entries: await options.conductor.getThreadReplay(
          thread.threadId,
          Number.isNaN(fromSequence) ? 1 : fromSequence
        )
      });
    } catch (err) {
      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/api/v1/c2/threads/:threadId/stream', async (req, res) => {
    try {
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const send = (event: string, payload: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      send('ready', {
        threadId: thread.threadId,
        missionId: thread.missionId,
        state: thread.state,
        replayFrom:
          thread.entries.length > 0
            ? thread.entries[thread.entries.length - 1].ledgerEnvelope.sequence
            : 0
      });

      const onLogEntry = (payload: { threadId: string; entry: unknown }) => {
        if (payload.threadId !== thread.threadId) {
          return;
        }
        send('log_entry', payload.entry);
      };

      const heartbeat = setInterval(() => {
        send('heartbeat', { at: new Date().toISOString() });
      }, 15000);

      options.conductor.on('log_entry', onLogEntry);

      req.on('close', () => {
        clearInterval(heartbeat);
        options.conductor.off('log_entry', onLogEntry);
        res.end();
      });
    } catch (err) {
      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.post('/api/v1/threads/halt-all', async (req, res) => {
    const parsed = haltAllSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: parsed.error.flatten()
      });
    }

    const input = parsed.data;
    const prismHolderApproved =
      input.prismHolderApproved ?? parseBooleanHeader(req.header('x-prism-holder-approved'));

    try {
      const result = await options.conductor.haltAllThreads({
        actorDid: input.actorDid,
        actorRole: input.actorRole,
        reason: input.reason,
        confirmerDid: input.confirmerDid,
        confirmerRole: input.confirmerRole,
        emergencyCredential: input.emergencyCredential,
        prismHolderApproved
      });

      return res.status(202).json({
        haltedCount: result.haltedCount,
        threadIds: result.threadIds,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}

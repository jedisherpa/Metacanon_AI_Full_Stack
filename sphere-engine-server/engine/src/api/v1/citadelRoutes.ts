import { Router } from 'express';
import { db } from '../../db/client.js';
import { sphereVotes, voteChoices, governanceEvents, userProfiles } from '../../db/schemaAtlas.js';
import { commands } from '../../db/schema.js';
import { telegramAuthMiddleware } from '../../middleware/telegramAuth.js';
import { eq, desc, and, count } from 'drizzle-orm';
import type { WebSocketHub } from '../../ws/hub.js';

export function createCitadelRoutes(deps: { wsHub: WebSocketHub }): Router {
  const router = Router();
  const { wsHub } = deps;

  // All citadel routes require Telegram auth
  router.use('/api/v1/citadel', telegramAuthMiddleware);

  // ─── POST /api/v1/citadel/propose ──────────────────────────────────────────
  // Create a new governance proposal
  router.post('/api/v1/citadel/propose', async (req, res) => {
    try {
      const { sphereId, title, description, closesAt } = req.body as {
        sphereId: string;
        title: string;
        description: string;
        closesAt?: string;
      };

      if (!sphereId || !title || !description) {
        res.status(400).json({ error: 'sphereId, title, description required', code: 'VALIDATION_ERROR' });
        return;
      }

      const vote = await db
        .insert(sphereVotes)
        .values({
          sphereId,
          title,
          description,
          proposedBy: req.telegramUserId!,
          closesAt: closesAt ? new Date(closesAt) : undefined
        })
        .returning();

      // Log governance event
      await db.insert(governanceEvents).values({
        sphereId,
        eventType: 'proposal_created',
        actorTelegramId: req.telegramUserId,
        payload: { voteId: vote[0].id, title }
      });

      // Broadcast to sphere channel
      wsHub.broadcast('deliberation', sphereId, {
        type: 'citadel:proposal_created',
        voteId: vote[0].id,
        title,
        proposedBy: req.telegramUserId
      });

      res.status(201).json({ ok: true, vote: vote[0], hapticTrigger: 'impact_medium' });
    } catch (err) {
      console.error('citadel/propose error', err);
      res.status(500).json({ error: 'Internal server error', code: 'PROPOSE_ERROR' });
    }
  });

  // ─── POST /api/v1/citadel/vote ─────────────────────────────────────────────
  // Cast a vote on a proposal
  router.post('/api/v1/citadel/vote', async (req, res) => {
    try {
      const { voteId, choice, rationale } = req.body as {
        voteId: string;
        choice: 'yes' | 'no' | 'abstain';
        rationale?: string;
      };

      if (!voteId || !choice || !['yes', 'no', 'abstain'].includes(choice)) {
        res.status(400).json({ error: 'voteId and valid choice required', code: 'VALIDATION_ERROR' });
        return;
      }

      // Check proposal exists and is open
      const proposal = await db.select().from(sphereVotes).where(eq(sphereVotes.id, voteId)).limit(1);
      if (!proposal[0] || proposal[0].status !== 'open') {
        res.status(404).json({ error: 'Vote not found or closed', code: 'VOTE_NOT_FOUND' });
        return;
      }

      // Upsert vote choice
      const existing = await db
        .select()
        .from(voteChoices)
        .where(and(eq(voteChoices.voteId, voteId), eq(voteChoices.telegramId, req.telegramUserId!)))
        .limit(1);

      let castVote;
      if (existing[0]) {
        castVote = await db
          .update(voteChoices)
          .set({ choice, rationale, castAt: new Date() })
          .where(eq(voteChoices.id, existing[0].id))
          .returning();
      } else {
        castVote = await db
          .insert(voteChoices)
          .values({ voteId, telegramId: req.telegramUserId!, choice, rationale })
          .returning();
      }

      // Get updated tally
      const tally = await db
        .select({ choice: voteChoices.choice, cnt: count() })
        .from(voteChoices)
        .where(eq(voteChoices.voteId, voteId))
        .groupBy(voteChoices.choice);

      wsHub.broadcast('deliberation', proposal[0].sphereId, {
        type: 'citadel:vote_cast',
        voteId,
        tally
      });

      res.json({ ok: true, vote: castVote[0], tally, hapticTrigger: 'notification_success' });
    } catch (err) {
      console.error('citadel/vote error', err);
      res.status(500).json({ error: 'Internal server error', code: 'VOTE_ERROR' });
    }
  });

  // ─── GET /api/v1/citadel/constitution ──────────────────────────────────────
  // Return the active sphere constitution
  router.get('/api/v1/citadel/constitution', async (req, res) => {
    try {
      const { sphereId } = req.query as { sphereId: string };
      // Return governance events as constitution log
      const events = await db
        .select()
        .from(governanceEvents)
        .where(eq(governanceEvents.sphereId, sphereId ?? 'global'))
        .orderBy(desc(governanceEvents.createdAt))
        .limit(50);

      res.json({ ok: true, sphereId: sphereId ?? 'global', events, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'CONSTITUTION_ERROR' });
    }
  });

  // ─── POST /api/v1/citadel/advice-process ───────────────────────────────────
  router.post('/api/v1/citadel/advice-process', async (req, res) => {
    try {
      const { voteId, notes } = req.body as { voteId: string; notes: string };
      const updated = await db
        .update(sphereVotes)
        .set({ adviceGiven: true, adviceNotes: notes, updatedAt: new Date() })
        .where(eq(sphereVotes.id, voteId))
        .returning();

      res.json({ ok: true, vote: updated[0], hapticTrigger: 'impact_light' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'ADVICE_ERROR' });
    }
  });

  // ─── POST /api/v1/citadel/ai-governance-review ─────────────────────────────
  // Trigger AI review of a proposal (queued job)
  router.post('/api/v1/citadel/ai-governance-review', async (req, res) => {
    try {
      const { voteId } = req.body as { voteId: string };
      const proposal = await db.select().from(sphereVotes).where(eq(sphereVotes.id, voteId)).limit(1);
      if (!proposal[0]) {
        res.status(404).json({ error: 'Proposal not found', code: 'NOT_FOUND' });
        return;
      }

      // Queue the AI review job
      const cmd = await db.insert(commands).values({
        commandType: 'ai_governance_review',
        payload: { voteId, title: proposal[0].title, description: proposal[0].description }
      }).returning();

      await db.update(sphereVotes)
        .set({ aiReviewStatus: 'pending', updatedAt: new Date() })
        .where(eq(sphereVotes.id, voteId));

      res.json({ ok: true, commandId: cmd[0].id, hapticTrigger: 'impact_medium' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'AI_REVIEW_ERROR' });
    }
  });

  // ─── POST /api/v1/citadel/emergency-shutdown ───────────────────────────────
  router.post('/api/v1/citadel/emergency-shutdown', async (req, res) => {
    try {
      const { sphereId, reason } = req.body as { sphereId: string; reason: string };
      await db.insert(governanceEvents).values({
        sphereId,
        eventType: 'emergency_shutdown',
        actorTelegramId: req.telegramUserId,
        payload: { reason, timestamp: new Date().toISOString() }
      });

      wsHub.broadcast('deliberation', sphereId, {
        type: 'citadel:emergency_shutdown',
        reason,
        actorId: req.telegramUserId
      });

      res.json({ ok: true, hapticTrigger: 'notification_error' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'SHUTDOWN_ERROR' });
    }
  });

  // ─── POST /api/v1/citadel/flag-impact ──────────────────────────────────────
  router.post('/api/v1/citadel/flag-impact', async (req, res) => {
    try {
      const { voteId, notes } = req.body as { voteId: string; notes?: string };
      const updated = await db
        .update(sphereVotes)
        .set({ impactFlagged: true, impactNotes: notes, updatedAt: new Date() })
        .where(eq(sphereVotes.id, voteId))
        .returning();

      res.json({ ok: true, vote: updated[0], hapticTrigger: 'notification_warning' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'FLAG_IMPACT_ERROR' });
    }
  });

  // ─── POST /api/v1/citadel/governance-meeting ───────────────────────────────
  router.post('/api/v1/citadel/governance-meeting', async (req, res) => {
    try {
      const { sphereId, agenda, scheduledAt } = req.body as {
        sphereId: string;
        agenda: string;
        scheduledAt?: string;
      };
      await db.insert(governanceEvents).values({
        sphereId,
        eventType: 'governance_meeting_scheduled',
        actorTelegramId: req.telegramUserId,
        payload: { agenda, scheduledAt }
      });

      res.json({ ok: true, hapticTrigger: 'impact_light' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'MEETING_ERROR' });
    }
  });

  // ─── GET /api/v1/citadel/governance-report ─────────────────────────────────
  router.get('/api/v1/citadel/governance-report', async (req, res) => {
    try {
      const { sphereId } = req.query as { sphereId?: string };
      const sid = sphereId ?? 'global';

      const [votes, events] = await Promise.all([
        db.select().from(sphereVotes).where(eq(sphereVotes.sphereId, sid)).orderBy(desc(sphereVotes.createdAt)).limit(20),
        db.select().from(governanceEvents).where(eq(governanceEvents.sphereId, sid)).orderBy(desc(governanceEvents.createdAt)).limit(50)
      ]);

      res.json({ ok: true, sphereId: sid, votes, events, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'REPORT_ERROR' });
    }
  });

  // ─── POST /api/v1/citadel/log-event ────────────────────────────────────────
  router.post('/api/v1/citadel/log-event', async (req, res) => {
    try {
      const { sphereId, eventType, payload } = req.body as {
        sphereId: string;
        eventType: string;
        payload?: Record<string, unknown>;
      };
      await db.insert(governanceEvents).values({
        sphereId,
        eventType,
        actorTelegramId: req.telegramUserId,
        payload: payload ?? {}
      });

      res.json({ ok: true, hapticTrigger: 'impact_light' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'LOG_EVENT_ERROR' });
    }
  });

  // ─── POST /api/v1/citadel/ratchet ──────────────────────────────────────────
  // Advance the governance ratchet (lock in a decision permanently)
  router.post('/api/v1/citadel/ratchet', async (req, res) => {
    try {
      const { voteId, decision } = req.body as { voteId: string; decision: string };
      const updated = await db
        .update(sphereVotes)
        .set({ status: 'passed', updatedAt: new Date() })
        .where(eq(sphereVotes.id, voteId))
        .returning();

      if (!updated[0]) {
        res.status(404).json({ error: 'Vote not found', code: 'NOT_FOUND' });
        return;
      }

      await db.insert(governanceEvents).values({
        sphereId: updated[0].sphereId,
        eventType: 'ratchet_advanced',
        actorTelegramId: req.telegramUserId,
        payload: { voteId, decision }
      });

      wsHub.broadcast('deliberation', updated[0].sphereId, {
        type: 'citadel:ratchet_advanced',
        voteId,
        decision
      });

      res.json({ ok: true, vote: updated[0], hapticTrigger: 'notification_success' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'RATCHET_ERROR' });
    }
  });

  // ─── GET /api/v1/citadel/proposals ─────────────────────────────────────────
  // List proposals for a sphere (internal utility)
  router.get('/api/v1/citadel/proposals', async (req, res) => {
    try {
      const { sphereId, status } = req.query as { sphereId?: string; status?: string };
      let query = db.select().from(sphereVotes).$dynamic();
      if (sphereId) query = query.where(eq(sphereVotes.sphereId, sphereId));
      const results = await query.orderBy(desc(sphereVotes.createdAt)).limit(50);
      res.json({ ok: true, proposals: results, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'PROPOSALS_ERROR' });
    }
  });

  return router;
}

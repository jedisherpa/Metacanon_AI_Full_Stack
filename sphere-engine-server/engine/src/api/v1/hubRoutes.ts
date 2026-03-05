import { Router } from 'express';
import { db } from '../../db/client.js';
import { games, gamePlayers, commands } from '../../db/schema.js';
import { governanceEvents } from '../../db/schemaAtlas.js';
import { telegramAuthMiddleware } from '../../middleware/telegramAuth.js';
import { eq, desc, inArray } from 'drizzle-orm';
import type { WebSocketHub } from '../../ws/hub.js';

export function createHubRoutes(deps: { wsHub: WebSocketHub }): Router {
  const router = Router();
  const { wsHub } = deps;

  router.use('/api/v1/hub', telegramAuthMiddleware);

  // ─── POST /api/v1/hub/broadcast ────────────────────────────────────────────
  // Broadcast a message to all members of a sphere
  router.post('/api/v1/hub/broadcast', async (req, res) => {
    try {
      const { sphereId, message, messageType } = req.body as {
        sphereId: string;
        message: string;
        messageType?: string;
      };

      if (!sphereId || !message) {
        res.status(400).json({ error: 'sphereId and message required', code: 'VALIDATION_ERROR' });
        return;
      }

      wsHub.broadcast('deliberation', sphereId, {
        type: 'hub:broadcast',
        messageType: messageType ?? 'info',
        message,
        from: req.telegramUserId,
        timestamp: new Date().toISOString()
      });

      await db.insert(governanceEvents).values({
        sphereId,
        eventType: 'hub_broadcast',
        actorTelegramId: req.telegramUserId,
        payload: { message, messageType }
      });

      res.json({ ok: true, hapticTrigger: 'impact_light' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'BROADCAST_ERROR' });
    }
  });

  // ─── POST /api/v1/hub/cancel-invite ────────────────────────────────────────
  router.post('/api/v1/hub/cancel-invite', async (req, res) => {
    try {
      const { gameId } = req.body as { gameId: string };
      const game = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game[0]) {
        res.status(404).json({ error: 'Game not found', code: 'NOT_FOUND' });
        return;
      }

      // Only allow cancellation in lobby_open state
      if (game[0].status !== 'lobby_open') {
        res.status(409).json({ error: 'Game is not in lobby_open state', code: 'INVALID_STATE' });
        return;
      }

      const cmd = await db.insert(commands).values({
        gameId,
        commandType: 'cancel_invite',
        payload: { cancelledBy: req.telegramUserId }
      }).returning();

      wsHub.broadcast('player', gameId, { type: 'hub:invite_cancelled', gameId });
      res.json({ ok: true, commandId: cmd[0].id, hapticTrigger: 'notification_warning' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'CANCEL_INVITE_ERROR' });
    }
  });

  // ─── POST /api/v1/hub/decline ──────────────────────────────────────────────
  // Decline a game invitation
  router.post('/api/v1/hub/decline', async (req, res) => {
    try {
      const { gameId } = req.body as { gameId: string };
      wsHub.broadcast('player', gameId, {
        type: 'hub:player_declined',
        telegramId: req.telegramUserId
      });
      res.json({ ok: true, hapticTrigger: 'impact_light' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'DECLINE_ERROR' });
    }
  });

  // ─── POST /api/v1/hub/defer ────────────────────────────────────────────────
  // Defer a decision to a later time
  router.post('/api/v1/hub/defer', async (req, res) => {
    try {
      const { gameId, deferUntil, reason } = req.body as {
        gameId: string;
        deferUntil?: string;
        reason?: string;
      };

      const cmd = await db.insert(commands).values({
        gameId,
        commandType: 'defer_decision',
        payload: { deferredBy: req.telegramUserId, deferUntil, reason }
      }).returning();

      res.json({ ok: true, commandId: cmd[0].id, hapticTrigger: 'impact_light' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'DEFER_ERROR' });
    }
  });

  // ─── GET /api/v1/hub/escalations ───────────────────────────────────────────
  // Return pending escalations for the current user's spheres
  router.get('/api/v1/hub/escalations', async (req, res) => {
    try {
      // Return recent governance events that require action
      const escalations = await db
        .select()
        .from(governanceEvents)
        .where(inArray(governanceEvents.eventType, ['emergency_shutdown', 'impact_flagged', 'ai_review_flagged']))
        .orderBy(desc(governanceEvents.createdAt))
        .limit(20);

      res.json({ ok: true, escalations, count: escalations.length, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'ESCALATIONS_ERROR' });
    }
  });

  // ─── GET /api/v1/hub/everyone ──────────────────────────────────────────────
  // Return a summary of all active sphere members
  router.get('/api/v1/hub/everyone', async (req, res) => {
    try {
      const { gameId } = req.query as { gameId?: string };

      if (gameId) {
        const players = await db
          .select({
            id: gamePlayers.id,
            name: gamePlayers.name,
            avatarName: gamePlayers.avatarName,
            seatNumber: gamePlayers.seatNumber,
            round1Complete: gamePlayers.round1Complete,
            round2Complete: gamePlayers.round2Complete
          })
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, gameId));

        res.json({ ok: true, players, hapticTrigger: null });
      } else {
        res.json({ ok: true, players: [], hapticTrigger: null });
      }
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'EVERYONE_ERROR' });
    }
  });

  // ─── POST /api/v1/hub/sync ─────────────────────────────────────────────────
  // Force a state sync for a game (triggers WS broadcast)
  router.post('/api/v1/hub/sync', async (req, res) => {
    try {
      const { gameId } = req.body as { gameId: string };
      const game = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game[0]) {
        res.status(404).json({ error: 'Game not found', code: 'NOT_FOUND' });
        return;
      }

      wsHub.broadcast('player', gameId, {
        type: 'hub:state_sync',
        game: game[0],
        timestamp: new Date().toISOString()
      });

      res.json({ ok: true, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'SYNC_ERROR' });
    }
  });

  // ─── GET /api/v1/hub/who-sees-what ─────────────────────────────────────────
  // Return visibility rules for the current game state
  router.get('/api/v1/hub/who-sees-what', async (req, res) => {
    try {
      const { gameId } = req.query as { gameId: string };
      const game = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game[0]) {
        res.status(404).json({ error: 'Game not found', code: 'NOT_FOUND' });
        return;
      }

      // Visibility rules based on game status
      const visibilityMap: Record<string, { players: boolean; synthesis: boolean; lenses: boolean }> = {
        draft: { players: false, synthesis: false, lenses: false },
        lobby_open: { players: true, synthesis: false, lenses: true },
        round1_open: { players: true, synthesis: false, lenses: true },
        round2_open: { players: true, synthesis: false, lenses: true },
        deliberating: { players: true, synthesis: true, lenses: true },
        synthesis_ready: { players: true, synthesis: true, lenses: true },
        archived: { players: true, synthesis: true, lenses: true }
      };

      const visibility = visibilityMap[game[0].status] ?? { players: false, synthesis: false, lenses: false };

      res.json({ ok: true, gameId, status: game[0].status, visibility, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'WHO_SEES_ERROR' });
    }
  });

  return router;
}

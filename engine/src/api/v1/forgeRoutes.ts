import { Router } from 'express';
import { db } from '../../db/client.js';
import { games, gamePlayers, synthesisArtifacts, commands } from '../../db/schema.js';
import { userProfiles } from '../../db/schemaAtlas.js';
import { telegramAuthMiddleware } from '../../middleware/telegramAuth.js';
import { eq, desc, and } from 'drizzle-orm';
import type { WebSocketHub } from '../../ws/hub.js';
import type { LensPack } from '../../config/lensPack.js';
import { generateHint } from '../../llm/service.js';
import { env } from '../../config/env.js';

export function createForgeRoutes(deps: { wsHub: WebSocketHub; lensPack: LensPack }): Router {
  const router = Router();
  const { wsHub, lensPack } = deps;

  router.use('/api/v1/forge', telegramAuthMiddleware);

  // ─── GET /api/v1/forge/passport ────────────────────────────────────────────
  // Return the player's lens passport (earned lenses + stats)
  router.get('/api/v1/forge/passport', async (req, res) => {
    try {
      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.telegramId, req.telegramUserId!))
        .limit(1);

      if (!profile[0]) {
        res.status(404).json({ error: 'Profile not found', code: 'NOT_FOUND' });
        return;
      }

      const p = profile[0];
      const earnedLensDetails = lensPack.lenses.filter((l) =>
        (p.earnedLenses as string[]).includes(String(l.seat_number))
      );

      res.json({
        ok: true,
        passport: {
          telegramId: p.telegramId,
          stats: {
            gamesPlayed: p.gamesPlayed,
            gamesWon: p.gamesWon,
            cxpTotal: p.cxpTotal,
            currentStreak: p.currentStreak
          },
          earnedLenses: earnedLensDetails.map((l) => ({
            id: String(l.seat_number),
            name: l.avatar_name,
            epistemology: l.epistemology,
            family: l.family,
            color: l.signature_color
          })),
          activeLensId: p.activeLensId
        },
        hapticTrigger: null
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'PASSPORT_ERROR' });
    }
  });

  // ─── GET /api/v1/forge/lens ─────────────────────────────────────────────────
  // Return all available lenses in the pack
  router.get('/api/v1/forge/lens', async (req, res) => {
    try {
      const lenses = lensPack.lenses.map((l) => ({
        id: String(l.seat_number),
        name: l.avatar_name,
        epistemology: l.epistemology,
        family: l.family,
        color: l.signature_color,
        philosophy: l.philosophy
      }));
      res.json({ ok: true, lenses, packId: lensPack.pack_id, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'LENS_ERROR' });
    }
  });

  // ─── GET /api/v1/forge/my-lens ──────────────────────────────────────────────
  // Return the player's currently active lens
  router.get('/api/v1/forge/my-lens', async (req, res) => {
    try {
      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.telegramId, req.telegramUserId!))
        .limit(1);

      const activeLensId = profile[0]?.activeLensId;
      const lens = activeLensId
        ? lensPack.lenses.find((l) => String(l.seat_number) === activeLensId)
        : null;

      res.json({
        ok: true,
        lens: lens
          ? {
              id: String(lens.seat_number),
              name: lens.avatar_name,
              epistemology: lens.epistemology,
              family: lens.family,
              color: lens.signature_color,
              philosophy: lens.philosophy
            }
          : null,
        hapticTrigger: null
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'MY_LENS_ERROR' });
    }
  });

  // ─── GET /api/v1/forge/cxp ──────────────────────────────────────────────────
  // Return the player's CXP (Council Experience Points) breakdown
  router.get('/api/v1/forge/cxp', async (req, res) => {
    try {
      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.telegramId, req.telegramUserId!))
        .limit(1);

      if (!profile[0]) {
        res.status(404).json({ error: 'Profile not found', code: 'NOT_FOUND' });
        return;
      }

      const p = profile[0];
      res.json({
        ok: true,
        cxp: {
          total: p.cxpTotal,
          gamesWon: p.gamesWon * 100,
          gamesPlayed: p.gamesPlayed * 10,
          streak: p.currentStreak * 25,
          lensesEarned: (p.earnedLenses as string[]).length * 50
        },
        hapticTrigger: null
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'CXP_ERROR' });
    }
  });

  // ─── POST /api/v1/forge/perspective ─────────────────────────────────────────
  // Submit a player perspective for the current game round
  router.post('/api/v1/forge/perspective', async (req, res) => {
    try {
      const { gameId, content } = req.body as { gameId: string; content: string };
      if (!gameId || !content) {
        res.status(400).json({ error: 'gameId and content required', code: 'VALIDATION_ERROR' });
        return;
      }

      // Queue the perspective submission as a command
      const cmd = await db.insert(commands).values({
        gameId,
        commandType: 'submit_perspective',
        payload: { telegramId: req.telegramUserId, content }
      }).returning();

      wsHub.broadcast('player', gameId, {
        type: 'forge:perspective_submitted',
        telegramId: req.telegramUserId
      });

      res.json({ ok: true, commandId: cmd[0].id, hapticTrigger: 'impact_medium' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'PERSPECTIVE_ERROR' });
    }
  });

  // ─── POST /api/v1/forge/ask ──────────────────────────────────────────────────
  // Ask the assigned lens for a hint on the current question
  router.post('/api/v1/forge/ask', async (req, res) => {
    try {
      const { gameId, lensId } = req.body as { gameId: string; lensId?: string };

      const game = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game[0]) {
        res.status(404).json({ error: 'Game not found', code: 'NOT_FOUND' });
        return;
      }

      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.telegramId, req.telegramUserId!))
        .limit(1);

      const effectiveLensId = lensId ?? profile[0]?.activeLensId ?? '1';
      const lens = lensPack.lenses.find((l) => String(l.seat_number) === effectiveLensId);
      if (!lens) {
        res.status(404).json({ error: 'Lens not found', code: 'LENS_NOT_FOUND' });
        return;
      }

      const hint = await generateHint({
        lens,
        question: game[0].question,
        provider: env.LLM_PROVIDER_DEFAULT as 'kimi' | 'morpheus' | 'groq' | 'auto'
      });

      res.json({ ok: true, hint, lensName: lens.avatar_name, hapticTrigger: 'impact_light' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'ASK_ERROR' });
    }
  });

  // ─── POST /api/v1/forge/converge ────────────────────────────────────────────
  // Trigger the convergence phase (admin/facilitator action)
  router.post('/api/v1/forge/converge', async (req, res) => {
    try {
      const { gameId } = req.body as { gameId: string };
      const cmd = await db.insert(commands).values({
        gameId,
        commandType: 'trigger_convergence',
        payload: { triggeredBy: req.telegramUserId }
      }).returning();

      wsHub.broadcast('deliberation', gameId, { type: 'forge:convergence_triggered' });
      res.json({ ok: true, commandId: cmd[0].id, hapticTrigger: 'impact_heavy' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'CONVERGE_ERROR' });
    }
  });

  // ─── GET /api/v1/forge/prism ─────────────────────────────────────────────────
  // Return the current synthesis prism (clash/consensus/options/paradox/minority)
  router.get('/api/v1/forge/prism', async (req, res) => {
    try {
      const { gameId } = req.query as { gameId: string };
      const artifacts = await db
        .select()
        .from(synthesisArtifacts)
        .where(eq(synthesisArtifacts.gameId, gameId))
        .orderBy(desc(synthesisArtifacts.generatedAt));

      res.json({ ok: true, artifacts, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'PRISM_ERROR' });
    }
  });

  // ─── POST /api/v1/forge/run-drill ────────────────────────────────────────────
  // Run a practice deliberation drill
  router.post('/api/v1/forge/run-drill', async (req, res) => {
    try {
      const { question, lensId } = req.body as { question: string; lensId?: string };
      if (!question) {
        res.status(400).json({ error: 'question required', code: 'VALIDATION_ERROR' });
        return;
      }

      const effectiveLensId = lensId ?? '1';
      const lens = lensPack.lenses.find((l) => String(l.seat_number) === effectiveLensId);
      if (!lens) {
        res.status(404).json({ error: 'Lens not found', code: 'LENS_NOT_FOUND' });
        return;
      }

      const hint = await generateHint({
        lens,
        question,
        provider: env.LLM_PROVIDER_DEFAULT as 'kimi' | 'morpheus' | 'groq' | 'auto'
      });

      res.json({
        ok: true,
        drill: { question, lensName: lens.avatar_name, hint },
        hapticTrigger: 'impact_medium'
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'DRILL_ERROR' });
    }
  });

  // ─── GET /api/v1/forge/story ──────────────────────────────────────────────────
  // Return the narrative story of a completed game
  router.get('/api/v1/forge/story', async (req, res) => {
    try {
      const { gameId } = req.query as { gameId: string };
      const [game, artifacts] = await Promise.all([
        db.select().from(games).where(eq(games.id, gameId)).limit(1),
        db.select().from(synthesisArtifacts).where(eq(synthesisArtifacts.gameId, gameId)).orderBy(desc(synthesisArtifacts.generatedAt))
      ]);

      if (!game[0]) {
        res.status(404).json({ error: 'Game not found', code: 'NOT_FOUND' });
        return;
      }

      res.json({
        ok: true,
        story: {
          question: game[0].question,
          status: game[0].status,
          artifacts
        },
        hapticTrigger: null
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'STORY_ERROR' });
    }
  });

  // ─── GET /api/v1/forge/summarize ─────────────────────────────────────────────
  // Return a summary of a game's deliberation
  router.get('/api/v1/forge/summarize', async (req, res) => {
    try {
      const { gameId } = req.query as { gameId: string };
      const artifacts = await db
        .select()
        .from(synthesisArtifacts)
        .where(and(eq(synthesisArtifacts.gameId, gameId), eq(synthesisArtifacts.artifactType, 'consensus')))
        .limit(1);

      res.json({
        ok: true,
        summary: artifacts[0]?.content ?? null,
        hapticTrigger: null
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'SUMMARIZE_ERROR' });
    }
  });

  return router;
}

import { Router } from 'express';
import { db } from '../../db/client.js';
import { userProfiles } from '../../db/schemaAtlas.js';
import { games } from '../../db/schema.js';
import { telegramAuthMiddleware } from '../../middleware/telegramAuth.js';
import { eq, desc, inArray } from 'drizzle-orm';

export function createAtlasRoutes(): Router {
  const router = Router();

  /**
   * GET /api/v1/atlas/state
   * Returns the full initial state for the Living Atlas UI in a single call.
   * Auto-provisions the user profile if this is their first visit.
   */
  router.get('/api/v1/atlas/state', telegramAuthMiddleware, async (req, res) => {
    try {
      const telegramId = req.telegramUserId!;
      const tgUser = req.telegramUser!;

      // Upsert user profile
      const existing = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.telegramId, telegramId))
        .limit(1);

      let profile = existing[0];

      if (!profile) {
        const inserted = await db
          .insert(userProfiles)
          .values({
            telegramId,
            firstName: tgUser.first_name,
            lastName: tgUser.last_name,
            username: tgUser.username,
            isPremium: tgUser.is_premium ?? false,
            photoUrl: tgUser.photo_url
          })
          .returning();
        profile = inserted[0];
      } else {
        // Update last seen and name fields
        const updated = await db
          .update(userProfiles)
          .set({
            firstName: tgUser.first_name,
            lastName: tgUser.last_name,
            username: tgUser.username,
            isPremium: tgUser.is_premium ?? false,
            lastSeenAt: new Date()
          })
          .where(eq(userProfiles.telegramId, telegramId))
          .returning();
        profile = updated[0];
      }

      // Get recent games for this user (by checking game_players table)
      const recentGames = await db
        .select({
          id: games.id,
          question: games.question,
          status: games.status,
          createdAt: games.createdAt
        })
        .from(games)
        .where(inArray(games.status, ['lobby_open', 'round1_open', 'round2_open', 'deliberating']))
        .orderBy(desc(games.createdAt))
        .limit(5);

      res.json({
        ok: true,
        profile: {
          telegramId: profile.telegramId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          username: profile.username,
          isPremium: profile.isPremium,
          photoUrl: profile.photoUrl,
          stats: {
            gamesPlayed: profile.gamesPlayed,
            gamesWon: profile.gamesWon,
            cxpTotal: profile.cxpTotal,
            currentStreak: profile.currentStreak
          },
          earnedLenses: profile.earnedLenses,
          activeLensId: profile.activeLensId
        },
        territories: {
          citadel: { status: 'active', pendingVotes: 0 },
          forge: { status: 'active', activeGames: recentGames.length },
          hub: { status: 'active', pendingEscalations: 0 },
          engineRoom: { status: 'active' }
        },
        activeGames: recentGames,
        hapticTrigger: null
      });
    } catch (err) {
      console.error('atlas/state error', err);
      res.status(500).json({ error: 'Internal server error', code: 'ATLAS_STATE_ERROR' });
    }
  });

  /**
   * PATCH /api/v1/atlas/profile
   * Update the user's active lens selection.
   */
  router.patch('/api/v1/atlas/profile', telegramAuthMiddleware, async (req, res) => {
    try {
      const telegramId = req.telegramUserId!;
      const { activeLensId } = req.body as { activeLensId?: string };

      const updated = await db
        .update(userProfiles)
        .set({ activeLensId: activeLensId ?? null, updatedAt: new Date() })
        .where(eq(userProfiles.telegramId, telegramId))
        .returning();

      if (!updated[0]) {
        res.status(404).json({ error: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
        return;
      }

      res.json({ ok: true, activeLensId: updated[0].activeLensId, hapticTrigger: 'impact_light' });
    } catch (err) {
      console.error('atlas/profile patch error', err);
      res.status(500).json({ error: 'Internal server error', code: 'PROFILE_PATCH_ERROR' });
    }
  });

  return router;
}

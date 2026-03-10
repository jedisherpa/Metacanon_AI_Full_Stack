# Engineering Specification: Council Engine → MMOGG Telegram Mini App

**Document Owner:** Project Manager  
**Target Audience:** Engineering Team  
**Date:** February 25, 2026  
**Version:** 1.0  
**Status:** Ready for Development

---

## How to Use This Document

This document is the single source of truth for the project. It is organized into three parts:

- **Part 1 — Database & Backend API:** All changes to the `engine/` application. Start here.
- **Part 2 — Mini App Frontend:** The new `mini-app/` project. Start after Part 1 is deployed.
- **Part 3 — Deployment & Go-Live:** The final checklist for production.

Each section is a discrete, ticketed task. Work through them in order. Do not skip ahead. Every code block in this document is production-ready and should be used as-is unless otherwise noted.

---

## 0. Project Context & Architecture Decision

The `council-engine` is a synchronous deliberation application. It has a Node/Express backend (`engine/`), a React/Vite frontend (`skins/council-nebula/`), a PostgreSQL database managed by Drizzle ORM, and a `pg-boss` job queue for reliable command execution. The full codebase is well-structured and production-grade.

**The decision is to extend this codebase, not rebuild it.** The backend will become a headless API. The existing `skins/council-nebula` web app will be retained as an admin console. A new `mini-app/` project will be created as the primary user-facing interface, delivered as a Telegram Mini App.

The table below summarizes every file that will be created or modified.

| File Path | Action | Ticket |
| :--- | :--- | :--- |
| `engine/src/db/schema.ts` | **Modified** | `DB-01` |
| `engine/src/config/env.ts` | **Modified** | `BE-01` |
| `engine/src/game/orchestrationService.ts` | **Modified** | `BE-01` |
| `engine/src/api/v2/playerGameRoutes.ts` | **Modified** | `BE-01` |
| `engine/src/index.ts` | **Modified** | `BE-01` |
| `engine/src/ws/events.ts` | **Modified** | `BE-01` |
| `engine/src/db/queries.ts` | **Modified** | `BE-01` |
| `engine/src/admin/telegramAuth.ts` | **New** | `BE-01` |
| `engine/src/game/gamificationService.ts` | **New** | `BE-01` |
| `engine/src/api/v2/passportRoutes.ts` | **New** | `BE-01` |
| `engine/src/db/seed.ts` | **New** | `BE-01` |
| `mini-app/` (entire directory) | **New** | `FE-01` through `FE-05` |

---

## Part 1: Database & Backend API

---

### Ticket DB-01: Database Schema Extension

**File to Modify:** `engine/src/db/schema.ts`

**Overview:** We need to add three new tables and extend one existing table to support Telegram identity, experience points, and badges.

#### Step 1: Modify the `gamePlayers` Table

Locate the `gamePlayers` `pgTable` definition. Add the following three columns inside the column definition object:

```typescript
// ADD these three lines inside the gamePlayers column definition
telegramUserId: varchar("telegram_user_id", { length: 50 }),
telegramHandle: varchar("telegram_handle", { length: 100 }),
cxp: integer("cxp").notNull().default(0),
```

Then, inside the table's config callback (the second argument to `pgTable`), add a new unique index:

```typescript
// ADD this line inside the gamePlayers config callback
telegramUserIdIdx: uniqueIndex("game_players_telegram_user_id_unique").on(table.telegramUserId),
```

#### Step 2: Add the `badges` Table

Append the following new table definition to the end of `schema.ts`, before the type exports:

```typescript
export const badges = pgTable("badges", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  imageUrl: varchar("image_url", { length: 255 }),
  cxpValue: integer("cxp_value").notNull().default(0),
  triggerEvent: varchar("trigger_event", { length: 100 }).notNull(),
  threshold: integer("threshold").notNull().default(1)
});
```

#### Step 3: Add the `playerBadges` Table

Append the following new table definition immediately after the `badges` table:

```typescript
export const playerBadges = pgTable(
  "player_badges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id").notNull().references(() => gamePlayers.id),
    badgeId: varchar("badge_id", { length: 50 }).notNull().references(() => badges.id),
    gameId: uuid("game_id").references(() => games.id),
    earnedAt: timestamp("earned_at", { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    playerBadgeUnique: uniqueIndex("player_badges_player_badge_unique").on(
      table.playerId,
      table.badgeId
    )
  })
);
```

#### Step 4: Add the `telegramSessions` Table

Append the following new table definition after `playerBadges`:

```typescript
export const telegramSessions = pgTable(
  "telegram_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    telegramUserId: varchar("telegram_user_id", { length: 50 }).notNull(),
    sessionToken: varchar("session_token", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: false }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    sessionTokenUnique: uniqueIndex("telegram_sessions_token_unique").on(table.sessionToken),
    telegramUserIdx: index("telegram_sessions_user_idx").on(table.telegramUserId)
  })
);
```

#### Step 5: Add Type Exports

Append the following type exports to the bottom of `schema.ts`:

```typescript
export type Badge = typeof badges.$inferSelect;
export type PlayerBadge = typeof playerBadges.$inferSelect;
export type TelegramSession = typeof telegramSessions.$inferSelect;
```

#### Step 6: Run Database Migration

From the `engine/` directory, run the following commands in sequence:

```bash
pnpm drizzle-kit generate
pnpm db:migrate
```

**Acceptance Criteria for DB-01:**
- `pnpm drizzle-kit generate` produces a new migration file in `engine/drizzle/` with no errors.
- `pnpm db:migrate` applies the migration successfully.
- The tables `badges`, `player_badges`, and `telegram_sessions` exist in the database.
- The `game_players` table has `telegram_user_id`, `telegram_handle`, and `cxp` columns.

---

### Ticket BE-01: Backend API Extensions

This ticket covers all new backend files and modifications to existing ones. Complete them in the order listed.

#### Step 1: Update Environment Configuration

**File to Modify:** `engine/src/config/env.ts`

Add the following two lines inside the `envSchema` Zod object:

```typescript
TELEGRAM_BOT_TOKEN: z.string().min(1),
MINI_APP_ORIGIN: z.string().url(),
```

Add both variables to your `engine/.env` file for local development.

#### Step 2: Create Telegram Authentication Middleware

**New File:** `engine/src/admin/telegramAuth.ts`

Create this file with the following complete content. This implements the official Telegram `initData` validation algorithm.

```typescript
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

function validateTelegramInitData(initData: string): { isValid: boolean; user?: Record<string, unknown> } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { isValid: false };

    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(env.TELEGRAM_BOT_TOKEN)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) return { isValid: false };

    const userParam = params.get('user');
    if (!userParam) return { isValid: false };

    return { isValid: true, user: JSON.parse(userParam) };
  } catch {
    return { isValid: false };
  }
}

// Extend Express Request type to include telegramUser
declare global {
  namespace Express {
    interface Request {
      telegramUser?: {
        id: number;
        first_name: string;
        last_name?: string;
        username?: string;
        language_code?: string;
      };
    }
  }
}

export function telegramAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Telegram ')) {
    return res.status(401).json({ error: 'Missing Telegram authentication header' });
  }

  const initData = authHeader.substring(9);
  const { isValid, user } = validateTelegramInitData(initData);

  if (!isValid || !user) {
    return res.status(401).json({ error: 'Invalid Telegram authentication data' });
  }

  req.telegramUser = user as Request['telegramUser'];
  next();
}
```

#### Step 3: Add New Queries

**File to Modify:** `engine/src/db/queries.ts`

Add the following new query functions to the end of the file. These are used by the gamification service and passport routes.

```typescript
// Import new tables at the top of queries.ts
import { badges, playerBadges, telegramSessions } from './schema.js';

// --- Gamification Queries ---

export async function getPlayerByTelegramUserId(telegramUserId: string) {
  const [row] = await db
    .select()
    .from(gamePlayers)
    .where(eq(gamePlayers.telegramUserId, telegramUserId));
  return row ?? null;
}

export async function awardCxp(playerId: string, amount: number) {
  const [row] = await db
    .update(gamePlayers)
    .set({ cxp: sql`${gamePlayers.cxp} + ${amount}` })
    .where(eq(gamePlayers.id, playerId))
    .returning();
  return row ?? null;
}

export async function listAllBadges() {
  return db.select().from(badges).orderBy(asc(badges.id));
}

export async function listEarnedBadgesForPlayer(playerId: string) {
  return db
    .select()
    .from(playerBadges)
    .where(eq(playerBadges.playerId, playerId))
    .orderBy(asc(playerBadges.earnedAt));
}

export async function hasEarnedBadge(playerId: string, badgeId: string) {
  const [row] = await db
    .select()
    .from(playerBadges)
    .where(and(eq(playerBadges.playerId, playerId), eq(playerBadges.badgeId, badgeId)));
  return !!row;
}

export async function awardBadge(params: { playerId: string; badgeId: string; gameId?: string }) {
  const [row] = await db
    .insert(playerBadges)
    .values(params)
    .onConflictDoNothing({ target: [playerBadges.playerId, playerBadges.badgeId] })
    .returning();
  return row ?? null;
}

export async function countAuditEventsForPlayer(playerId: string, eventType: string) {
  const [row] = await db
    .select({ count: count() })
    .from(auditEvents)
    .where(and(eq(auditEvents.actorId, playerId), eq(auditEvents.eventType, eventType)));
  return row?.count ?? 0;
}
```

#### Step 4: Create the Gamification Service

**New File:** `engine/src/game/gamificationService.ts`

Create this file with the following complete content.

```typescript
import { db } from '../db/client.js';
import {
  awardBadge,
  awardCxp,
  countAuditEventsForPlayer,
  hasEarnedBadge,
  listAllBadges
} from '../db/queries.js';
import type { WebSocketHub } from '../ws/hub.js';

// CXP awarded for each event type, independent of badge logic
const CXP_AWARDS: Record<string, number> = {
  'round1.submitted': 10,
  'round2.submitted': 20,
  'deliberation.phase.clash': 15,
  'deliberation.phase.consensus': 15,
  'deliberation.phase.options': 10,
  'deliberation.phase.paradox': 25,
  'deliberation.phase.minority': 30,
  'deliberation.completed': 50
};

export async function processGameEvent(params: {
  eventType: string;
  playerId: string;
  gameId: string;
  wsHub?: WebSocketHub;
}) {
  const { eventType, playerId, gameId, wsHub } = params;

  // 1. Award base CXP for the event
  const baseCxp = CXP_AWARDS[eventType] ?? 0;
  if (baseCxp > 0) {
    await awardCxp(playerId, baseCxp);
  }

  // 2. Check all badges whose trigger matches this event
  const allBadges = await listAllBadges();
  const triggeredBadges = allBadges.filter((b) => b.triggerEvent === eventType);

  for (const badge of triggeredBadges) {
    // Skip if already earned
    const alreadyEarned = await hasEarnedBadge(playerId, badge.id);
    if (alreadyEarned) continue;

    // Check if the event threshold has been met
    const eventCount = await countAuditEventsForPlayer(playerId, eventType);
    if (eventCount < badge.threshold) continue;

    // Award the badge and its bonus CXP
    const awarded = await awardBadge({ playerId, badgeId: badge.id, gameId });
    if (awarded && badge.cxpValue > 0) {
      await awardCxp(playerId, badge.cxpValue);
    }

    // Notify the player via WebSocket
    if (awarded && wsHub) {
      wsHub.broadcast('player', gameId, {
        type: 'player.badge_earned',
        playerId,
        badge: {
          id: badge.id,
          name: badge.name,
          description: badge.description,
          imageUrl: badge.imageUrl,
          cxpValue: badge.cxpValue
        }
      });
    }
  }
}
```

#### Step 5: Hook Gamification into `orchestrationService.ts`

**File to Modify:** `engine/src/game/orchestrationService.ts`

Add the following import at the top of the file:

```typescript
import { processGameEvent } from './gamificationService.js';
```

Then add the following calls at the specific points in `executeGameCommand`:

**Inside the `round2_close` case**, after `setAllDeliberationEligibility`:

```typescript
// After setAllDeliberationEligibility(gameId)
const eligiblePlayers = (await listPlayersByGame(gameId)).filter(p => p.deliberationEligible);
for (const player of eligiblePlayers) {
  await processGameEvent({ eventType: 'round2.submitted', playerId: player.id, gameId, emit: params.emit });
}
```

**Inside the `deliberation_next` case**, after each phase artifact is created, add a call before the `break` statement. For example, after the `clash` artifact is created:

```typescript
// After createSynthesisArtifact({ gameId, artifactType: 'clash', content: clashJson })
const allPlayers = await listPlayersByGame(gameId);
for (const player of allPlayers.filter(p => p.deliberationEligible)) {
  await processGameEvent({ eventType: 'deliberation.phase.clash', playerId: player.id, gameId });
}
```

Repeat this pattern for `consensus`, `options`, `paradox`, and `minority` phases, using the corresponding event type string (e.g., `deliberation.phase.consensus`).

**Inside the `archive` case**, after `archiveGame(gameId)`:

```typescript
// After archiveGame(gameId)
const allPlayers = await listPlayersByGame(gameId);
for (const player of allPlayers.filter(p => p.deliberationEligible)) {
  await processGameEvent({ eventType: 'deliberation.completed', playerId: player.id, gameId });
}
```

#### Step 6: Hook Gamification into `playerGameRoutes.ts`

**File to Modify:** `engine/src/api/v2/playerGameRoutes.ts`

Add the following import at the top:

```typescript
import { processGameEvent } from '../../game/gamificationService.js';
```

In the `POST /api/v2/games/:id/round1/submit` handler, add the following call **after** `res.json(...)`:

```typescript
// After res.json({ responseId: response.id, ... })
void processGameEvent({ eventType: 'round1.submitted', playerId: player.id, gameId: game.id, wsHub: params.wsHub });
```

#### Step 7: Update WebSocket Event Types

**File to Modify:** `engine/src/ws/events.ts`

Add the following new event type to the `PlayerEvent` union:

```typescript
// ADD to the PlayerEvent type union
| { type: 'player.badge_earned'; playerId: string; badge: { id: string; name: string; description: string; imageUrl: string | null; cxpValue: number } }
| { type: 'lobby.player_joined'; player: { id: string; seatNumber: number; name: string; avatarName: string } }
```

#### Step 8: Create the Passport API Routes

**New File:** `engine/src/api/v2/passportRoutes.ts`

Create this file with the following complete content.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { telegramAuthMiddleware } from '../../admin/telegramAuth.js';
import { error } from '../../lib/http.js';
import { randomToken } from '../../lib/crypto.js';
import {
  awardBadge,
  createPlayer,
  getGameByInviteCode,
  getPlayerByTelegramUserId,
  listAllBadges,
  listEarnedBadgesForPlayer,
  listPlayersByGame,
  nextAvailableSeat,
  updatePlayer
} from '../../db/queries.js';
import { pickLensForJoin } from '../../game/lensAssignment.js';
import { generateHint } from '../../llm/service.js';
import type { LensPack } from '../../config/lensPack.js';
import type { WebSocketHub } from '../../ws/hub.js';

const linkGameSchema = z.object({
  inviteCode: z.string().min(1),
  name: z.string().min(1)
});

export function createPassportRoutes(params: { lensPack: LensPack; wsHub?: WebSocketHub }) {
  const router = Router();

  // All passport routes require Telegram authentication
  router.use('/api/v2/passport', telegramAuthMiddleware);

  /**
   * GET /api/v2/passport/me
   * Returns the full Sphere Passport data for the authenticated Telegram user.
   * This is the primary data source for the Mini App's main screen.
   */
  router.get('/api/v2/passport/me', async (req, res) => {
    const telegramUserId = String(req.telegramUser!.id);

    const player = await getPlayerByTelegramUserId(telegramUserId);
    if (!player) {
      // User exists in Telegram but has not joined a game yet
      return res.json({ player: null, game: null, badges: [] });
    }

    // Fetch game and badges in parallel
    const [earnedBadges, allBadges] = await Promise.all([
      listEarnedBadgesForPlayer(player.id),
      listAllBadges()
    ]);

    const earnedBadgeIds = new Set(earnedBadges.map((b) => b.badgeId));
    const badgeMap = new Map(allBadges.map((b) => [b.id, b]));

    const badgePayload = earnedBadges.map((pb) => {
      const badgeMeta = badgeMap.get(pb.badgeId);
      return {
        id: pb.badgeId,
        name: badgeMeta?.name ?? pb.badgeId,
        description: badgeMeta?.description ?? '',
        imageUrl: badgeMeta?.imageUrl ?? null,
        cxpValue: badgeMeta?.cxpValue ?? 0,
        earnedAt: pb.earnedAt
      };
    });

    res.json({
      player: {
        id: player.id,
        name: player.name,
        telegramHandle: player.telegramHandle,
        avatarName: player.avatarName,
        avatarId: player.avatarId,
        epistemology: player.epistemology,
        cxp: player.cxp,
        round1Complete: player.round1Complete,
        round2Complete: player.round2Complete,
        deliberationEligible: player.deliberationEligible,
        hint: player.hintText ?? ''
      },
      gameId: player.gameId,
      badges: badgePayload
    });
  });

  /**
   * GET /api/v2/passport/badges
   * Returns the full badge catalog with the current player's earned status and progress.
   */
  router.get('/api/v2/passport/badges', async (req, res) => {
    const telegramUserId = String(req.telegramUser!.id);
    const player = await getPlayerByTelegramUserId(telegramUserId);

    const [allBadges, earnedBadges] = await Promise.all([
      listAllBadges(),
      player ? listEarnedBadgesForPlayer(player.id) : Promise.resolve([])
    ]);

    const earnedMap = new Map(earnedBadges.map((pb) => [pb.badgeId, pb]));

    const catalog = allBadges.map((badge) => {
      const earned = earnedMap.get(badge.id);
      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        imageUrl: badge.imageUrl,
        cxpValue: badge.cxpValue,
        threshold: badge.threshold,
        earned: !!earned,
        earnedAt: earned?.earnedAt ?? null
      };
    });

    res.json({ badges: catalog });
  });

  /**
   * POST /api/v2/passport/link-game
   * Links a Telegram user to a game by invite code, creating a player record.
   * This is the Mini App's equivalent of the web app's /play/:id/join route.
   */
  router.post('/api/v2/passport/link-game', async (req, res) => {
    const parsed = linkGameSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'Invalid payload', parsed.error.message);
    }

    const telegramUser = req.telegramUser!;
    const telegramUserId = String(telegramUser.id);

    // Check if this Telegram user already has an active player record
    const existingPlayer = await getPlayerByTelegramUserId(telegramUserId);
    if (existingPlayer) {
      return error(res, 409, 'This Telegram account is already linked to a game');
    }

    const game = await getGameByInviteCode(parsed.data.inviteCode);
    if (!game) return error(res, 404, 'Invite code not found');
    if (game.status !== 'lobby_open') return error(res, 409, 'Game is not accepting new players');

    const players = await listPlayersByGame(game.id);
    if (players.length >= game.groupSize) return error(res, 409, 'Game is full');

    const seatNumber = await nextAvailableSeat(game.id, game.groupSize);
    if (!seatNumber) return error(res, 409, 'No seats available');

    const assignedIds = players.map((p) => p.avatarId);
    const lens = pickLensForJoin(params.lensPack, assignedIds, game.groupSize >= 4, game.groupSize);
    const accessToken = randomToken(24);

    const created = await createPlayer({
      gameId: game.id,
      seatNumber,
      name: parsed.data.name,
      accessToken,
      avatarId: lens.id,
      avatarName: lens.avatar_name,
      epistemology: lens.epistemology,
      hintText: '',
      preRegistered: false
    });

    // Immediately link the Telegram identity to the new player record
    await updatePlayer(created.id, {
      telegramUserId,
      telegramHandle: telegramUser.username ?? null
    });

    params.wsHub?.broadcast('player', game.id, {
      type: 'lobby.player_joined',
      player: { id: created.id, seatNumber: created.seatNumber, name: created.name, avatarName: created.avatarName }
    });
    params.wsHub?.broadcast('admin', game.id, { type: 'state.refresh', gameId: game.id });

    res.json({
      player: {
        id: created.id,
        seatNumber: created.seatNumber,
        name: created.name,
        avatarName: created.avatarName,
        epistemology: created.epistemology
      },
      playerToken: accessToken,
      gameId: game.id
    });

    // Generate hint asynchronously
    void generateHint({ lens, question: game.question, provider: game.provider as any })
      .then(async (hint) => {
        if (!hint) return;
        await updatePlayer(created.id, { hintText: hint });
        params.wsHub?.broadcast('player', game.id, { type: 'player.hint_updated', playerId: created.id });
      })
      .catch(() => {});
  });

  return router;
}
```

#### Step 9: Mount the New Routes in `index.ts`

**File to Modify:** `engine/src/index.ts`

Add the following import near the top of the file:

```typescript
import { createPassportRoutes } from './api/v2/passportRoutes.js';
```

Then, mount the new router in the Express app, alongside the other route registrations:

```typescript
app.use(createPassportRoutes({ lensPack, wsHub }));
```

#### Step 10: Create the Badge Seed Script

**New File:** `engine/src/db/seed.ts`

This script populates the `badges` table with the initial badge catalog. Run it once after the first migration.

```typescript
import { db } from './client.js';
import { badges } from './schema.js';

const INITIAL_BADGES = [
  { id: 'first-voice', name: 'First Voice', description: 'Submitted your first Round 1 response.', cxpValue: 0, triggerEvent: 'round1.submitted', threshold: 1 },
  { id: 'cross-pollinator', name: 'Cross-Pollinator', description: 'Engaged with another lens in Round 2.', cxpValue: 0, triggerEvent: 'round2.submitted', threshold: 1 },
  { id: 'clash-survivor', name: 'Clash Survivor', description: 'Your position survived the Clash phase.', cxpValue: 0, triggerEvent: 'deliberation.phase.clash', threshold: 1 },
  { id: 'consensus-builder', name: 'Consensus Builder', description: 'Contributed to a consensus artifact.', cxpValue: 0, triggerEvent: 'deliberation.phase.consensus', threshold: 1 },
  { id: 'paradox-holder', name: 'Paradox Holder', description: 'Held the tension of a paradox.', cxpValue: 10, triggerEvent: 'deliberation.phase.paradox', threshold: 1 },
  { id: 'minority-voice', name: 'Minority Voice', description: 'Your minority report was recorded.', cxpValue: 20, triggerEvent: 'deliberation.phase.minority', threshold: 1 },
  { id: 'deliberator', name: 'Deliberator', description: 'Witnessed a full deliberation cycle.', cxpValue: 0, triggerEvent: 'deliberation.completed', threshold: 1 },
  { id: 'council-veteran', name: 'Council Veteran', description: 'Completed 5 full deliberations.', cxpValue: 100, triggerEvent: 'deliberation.completed', threshold: 5 }
];

async function seed() {
  console.log('Seeding badges...');
  await db.insert(badges).values(INITIAL_BADGES).onConflictDoNothing();
  console.log('Done.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add a script to `engine/package.json` to run the seed:

```json
"scripts": {
  "db:seed": "tsx src/db/seed.ts"
}
```

**Acceptance Criteria for BE-01:**
- `GET /api/v2/passport/me` returns a 401 if no `Authorization: Telegram ...` header is present.
- `GET /api/v2/passport/me` returns a 200 with a valid player payload when called with valid `initData`.
- `POST /api/v2/passport/link-game` successfully creates a player and links the Telegram user ID.
- After a player submits Round 1, their `cxp` increases by 10 in the database.
- After a player earns the `first-voice` badge, a `player.badge_earned` WebSocket event is broadcast to the player channel.

---

## Part 2: Telegram Bot & Mini App Frontend

---

### Ticket BOT-01: Telegram Bot Configuration

This is a manual configuration task performed in the Telegram app.

1.  Open a chat with `@BotFather` in Telegram.
2.  Send `/newbot`. Follow the prompts. Save the resulting API token as `TELEGRAM_BOT_TOKEN` in the backend environment.
3.  Send `/mybots`, select the new bot, then go to "Bot Settings" → "Menu Button" → "Configure Menu Button".
4.  Set the URL to the deployed `mini-app/` frontend URL (e.g., `https://your-mini-app.vercel.app`).
5.  Set the button text to "Open Passport".
6.  Send `/setinline` and enable inline mode for the bot (required for the viral sharing feature).

**Acceptance Criteria:** A user can open the bot in Telegram, tap the "Open Passport" menu button, and the Mini App loads inside Telegram.

---

### Ticket FE-01: Mini App Project Initialization

From the monorepo root, run the following commands:

```bash
pnpm create vite mini-app --template react-ts
cd mini-app
pnpm install
pnpm add wouter @twa-dev/sdk framer-motion
pnpm add -D tailwindcss postcss autoprefixer
pnpm tailwindcss init -p
```

In `mini-app/tailwind.config.js`, set the content paths:

```javascript
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

In `mini-app/src/index.css`, add the Tailwind directives:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Add `"mini-app"` to the `workspaces` array in the root `package.json`.

Create `mini-app/.env`:

```
VITE_API_URL=http://localhost:3001
```

**Acceptance Criteria:** `pnpm --filter mini-app dev` starts the development server without errors.

---

### Ticket FE-02: Core Architecture

#### `mini-app/src/App.tsx`

Replace the default Vite template content with the following:

```typescript
import { useEffect } from 'react';
import { Switch, Route } from 'wouter';
import WebApp from '@twa-dev/sdk';
import PassportScreen from './pages/PassportScreen';
import CouncilScreen from './pages/CouncilScreen';
import BadgeGalleryScreen from './pages/BadgeGalleryScreen';
import BottomNav from './components/BottomNav';

const App = () => {
  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    WebApp.setHeaderColor('#17212b');
    WebApp.setBackgroundColor('#17212b');
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#17212b] text-white">
      <main className="flex-1 overflow-y-auto pb-16">
        <Switch>
          <Route path="/" component={PassportScreen} />
          <Route path="/council" component={CouncilScreen} />
          <Route path="/badges" component={BadgeGalleryScreen} />
        </Switch>
      </main>
      <BottomNav />
    </div>
  );
};

export default App;
```

#### `mini-app/src/lib/api.ts`

Create this file with the following content:

```typescript
import WebApp from '@twa-dev/sdk';

const API_BASE = import.meta.env.VITE_API_URL as string;

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Telegram ${WebApp.initData}`,
      ...options.headers
    }
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  getMyPassport: () => request<PassportResponse>('/api/v2/passport/me'),
  getBadgeCatalog: () => request<BadgeCatalogResponse>('/api/v2/passport/badges'),
  linkGame: (inviteCode: string, name: string) =>
    request('/api/v2/passport/link-game', { method: 'POST', body: JSON.stringify({ inviteCode, name }) }),
  submitRound1: (gameId: string, content: string) =>
    request(`/api/v2/games/${gameId}/round1/submit`, { method: 'POST', body: JSON.stringify({ content }) }),
  getMyRound2Assignments: (gameId: string) =>
    request(`/api/v2/games/${gameId}/round2/assignments/me`),
  submitRound2: (gameId: string, responses: { assignmentId: string; content: string }[]) =>
    request(`/api/v2/games/${gameId}/round2/submit`, { method: 'POST', body: JSON.stringify({ responses }) }),
  getDeliberationFeed: (gameId: string) =>
    request(`/api/v2/games/${gameId}/deliberation/feed`)
};

// --- Type Definitions ---

export interface PassportResponse {
  player: {
    id: string; name: string; telegramHandle: string | null;
    avatarName: string; avatarId: string; epistemology: string;
    cxp: number; round1Complete: boolean; round2Complete: boolean;
    deliberationEligible: boolean; hint: string;
  } | null;
  gameId: string | null;
  badges: EarnedBadge[];
}

export interface EarnedBadge {
  id: string; name: string; description: string;
  imageUrl: string | null; cxpValue: number; earnedAt: string;
}

export interface BadgeCatalogResponse {
  badges: CatalogBadge[];
}

export interface CatalogBadge {
  id: string; name: string; description: string;
  imageUrl: string | null; cxpValue: number; threshold: number;
  earned: boolean; earnedAt: string | null;
}
```

#### `mini-app/src/lib/ws.ts`

Create this file to manage the WebSocket connection:

```typescript
import WebApp from '@twa-dev/sdk';

const WS_BASE = (import.meta.env.VITE_API_URL as string).replace(/^http/, 'ws');

export function createGameSocket(
  channel: 'player' | 'deliberation',
  gameId: string,
  playerToken: string,
  onMessage: (event: any) => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/v2/${channel}/${gameId}?token=${playerToken}`);
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch { /* ignore */ }
  };
  return ws;
}
```

---

### Ticket FE-03: Component Library

Create the following files in `mini-app/src/components/`.

#### `BottomNav.tsx`

```typescript
import { Link, useLocation } from 'wouter';

const tabs = [
  { path: '/', label: 'Passport', icon: '🪪' },
  { path: '/council', label: 'Council', icon: '🏛️' },
  { path: '/badges', label: 'Badges', icon: '🏅' }
];

const BottomNav = () => {
  const [location] = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#232e3c] border-t border-white/10 flex">
      {tabs.map((tab) => (
        <Link key={tab.path} href={tab.path}>
          <a className={`flex-1 flex flex-col items-center py-2 text-xs gap-1 ${location === tab.path ? 'text-blue-400' : 'text-gray-400'}`}>
            <span className="text-xl">{tab.icon}</span>
            {tab.label}
          </a>
        </Link>
      ))}
    </nav>
  );
};

export default BottomNav;
```

#### `AvatarCard.tsx`

```typescript
interface AvatarCardProps {
  avatarName: string;
  epistemology: string;
  signatureColor: string;
  cxp: number;
}

// CXP level thresholds
const LEVELS = [0, 50, 150, 350, 700, Infinity];

function getLevel(cxp: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (cxp >= LEVELS[i]) return i + 1;
  }
  return 1;
}

function getLevelProgress(cxp: number) {
  const level = getLevel(cxp) - 1;
  const floor = LEVELS[level - 1] ?? 0;
  const ceiling = LEVELS[level] ?? LEVELS[LEVELS.length - 2];
  return ((cxp - floor) / (ceiling - floor)) * 100;
}

const AvatarCard = ({ avatarName, epistemology, signatureColor, cxp }: AvatarCardProps) => {
  const level = getLevel(cxp);
  const progress = getLevelProgress(cxp);

  return (
    <div className="rounded-2xl p-5 m-4" style={{ background: `linear-gradient(135deg, #232e3c, ${signatureColor}22)`, border: `1px solid ${signatureColor}55` }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style={{ background: `${signatureColor}33` }}>
          ✦
        </div>
        <div>
          <h2 className="font-bold text-lg">{avatarName}</h2>
          <p className="text-sm text-gray-400">{epistemology}</p>
        </div>
        <div className="ml-auto text-right">
          <span className="text-xs text-gray-400">Level</span>
          <p className="font-bold text-xl" style={{ color: signatureColor }}>{level}</p>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{cxp} CXP</span>
          <span>Level {level + 1} in {(LEVELS[level] ?? 0) - cxp} CXP</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: signatureColor }} />
        </div>
      </div>
    </div>
  );
};

export default AvatarCard;
```

#### `BadgeIcon.tsx`

```typescript
interface BadgeIconProps {
  name: string;
  imageUrl?: string | null;
  earned: boolean;
  onClick?: () => void;
}

const BadgeIcon = ({ name, imageUrl, earned, onClick }: BadgeIconProps) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1 w-16">
    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${earned ? 'bg-blue-500/20' : 'bg-white/5 grayscale opacity-40'}`}>
      {imageUrl ? <img src={imageUrl} alt={name} className="w-10 h-10 object-contain" /> : '🏅'}
    </div>
    <span className="text-xs text-center text-gray-400 leading-tight line-clamp-2">{name}</span>
  </button>
);

export default BadgeIcon;
```

#### `BadgeEarnedModal.tsx`

```typescript
import { motion, AnimatePresence } from 'framer-motion';
import WebApp from '@twa-dev/sdk';
import type { EarnedBadge } from '../lib/api';

interface BadgeEarnedModalProps {
  badge: EarnedBadge | null;
  onClose: () => void;
}

const BadgeEarnedModal = ({ badge, onClose }: BadgeEarnedModalProps) => {
  const handleShare = () => {
    WebApp.shareMessage(
      `I just earned the "${badge?.name}" badge in the Council of Twelve! 🏛️\n\nJoin the deliberation: t.me/YourBotUsername`
    );
  };

  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.5, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.5, y: 50 }}
            className="bg-[#232e3c] rounded-3xl p-8 text-center max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-6xl mb-4">🏅</div>
            <p className="text-sm text-blue-400 uppercase tracking-widest mb-1">Badge Earned</p>
            <h2 className="text-2xl font-bold mb-2">{badge.name}</h2>
            <p className="text-gray-400 text-sm mb-6">{badge.description}</p>
            {badge.cxpValue > 0 && (
              <p className="text-yellow-400 font-bold mb-6">+{badge.cxpValue} CXP</p>
            )}
            <div className="flex gap-3">
              <button onClick={handleShare} className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-semibold">Share</button>
              <button onClick={onClose} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-semibold">Close</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BadgeEarnedModal;
```

---

### Ticket FE-04: Screen Implementation

#### `mini-app/src/pages/PassportScreen.tsx`

```typescript
import { useEffect, useState } from 'react';
import { api, type EarnedBadge, type PassportResponse } from '../lib/api';
import AvatarCard from '../components/AvatarCard';
import BadgeIcon from '../components/BadgeIcon';
import BadgeEarnedModal from '../components/BadgeEarnedModal';
import { createGameSocket } from '../lib/ws';

// Signature colors from the lens pack
const LENS_COLORS: Record<string, string> = {
  'The Logician': '#F5E6C8',
  'The Intuitive': '#00E5FF',
  'The Systems Thinker': '#FF6B2B',
  'The Alchemist': '#FFB800',
  // Add all 12 lenses here
};

const PassportScreen = () => {
  const [passport, setPassport] = useState<PassportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBadge, setActiveBadge] = useState<EarnedBadge | null>(null);

  useEffect(() => {
    api.getMyPassport().then(setPassport).finally(() => setLoading(false));
  }, []);

  // Connect to WebSocket to listen for badge_earned events
  useEffect(() => {
    if (!passport?.gameId || !passport?.player) return;
    // Note: playerToken must be stored in localStorage after link-game call
    const playerToken = localStorage.getItem('playerToken');
    if (!playerToken) return;

    const ws = createGameSocket('player', passport.gameId, playerToken, (event) => {
      if (event.type === 'player.badge_earned' && event.playerId === passport.player?.id) {
        setActiveBadge(event.badge);
        // Refresh passport data to update CXP
        api.getMyPassport().then(setPassport);
      }
    });

    return () => ws.close();
  }, [passport?.gameId, passport?.player?.id]);

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>;
  if (!passport?.player) return <JoinGamePrompt />;

  const { player, badges } = passport;
  const signatureColor = LENS_COLORS[player.avatarName] ?? '#6366f1';

  return (
    <div>
      <AvatarCard avatarName={player.avatarName} epistemology={player.epistemology} signatureColor={signatureColor} cxp={player.cxp} />
      <div className="px-4">
        <h3 className="text-sm text-gray-400 uppercase tracking-widest mb-3">Earned Badges</h3>
        {badges.length === 0 ? (
          <p className="text-gray-500 text-sm">Complete a deliberation to earn your first badge.</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {badges.map((badge) => (
              <BadgeIcon key={badge.id} name={badge.name} imageUrl={badge.imageUrl} earned={true} onClick={() => setActiveBadge(badge)} />
            ))}
          </div>
        )}
      </div>
      <BadgeEarnedModal badge={activeBadge} onClose={() => setActiveBadge(null)} />
    </div>
  );
};

// Placeholder component for users who haven't joined a game yet
const JoinGamePrompt = () => (
  <div className="flex flex-col items-center justify-center h-screen p-8 text-center">
    <div className="text-6xl mb-4">🏛️</div>
    <h1 className="text-2xl font-bold mb-2">Welcome to the Council</h1>
    <p className="text-gray-400 mb-6">You haven't joined a deliberation yet. Ask your host for an invite code.</p>
  </div>
);

export default PassportScreen;
```

#### `mini-app/src/pages/CouncilScreen.tsx`

```typescript
import { useEffect, useState } from 'react';
import { api, type PassportResponse } from '../lib/api';
import WebApp from '@twa-dev/sdk';

const CouncilScreen = () => {
  const [passport, setPassport] = useState<PassportResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyPassport().then(setPassport).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>;
  if (!passport?.player || !passport?.gameId) return <div className="p-8 text-center text-gray-400">Join a game first from your Passport.</div>;

  const { player, gameId } = passport;

  // Route to the correct sub-view based on game status
  // NOTE: game status must be fetched from /api/v2/games/:id/me or stored in passport
  // For now, we derive from player completion flags
  if (!player.round1Complete) return <Round1View gameId={gameId} />;
  if (!player.round2Complete) return <Round2View gameId={gameId} />;
  if (player.deliberationEligible) return <DeliberationView gameId={gameId} />;
  return <WaitingView message="Waiting for the deliberation to begin..." />;
};

const Round1View = ({ gameId }: { gameId: string }) => {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.submitRound1(gameId, content);
      WebApp.HapticFeedback.notificationOccurred('success');
      setSubmitted(true);
    } catch (e) {
      WebApp.HapticFeedback.notificationOccurred('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) return <WaitingView message="Response submitted. Waiting for Round 2..." />;

  return (
    <div className="p-4 flex flex-col gap-4">
      <h2 className="text-xl font-bold">Round 1: Your Position</h2>
      <p className="text-gray-400 text-sm">The question has been revealed. Write your response from the perspective of your assigned lens.</p>
      <textarea
        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white resize-none min-h-[200px] focus:outline-none focus:border-blue-500"
        placeholder="Write your response..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button
        onClick={handleSubmit}
        disabled={submitting || !content.trim()}
        className="w-full bg-blue-500 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-lg"
      >
        {submitting ? 'Submitting...' : 'Submit Response'}
      </button>
    </div>
  );
};

const Round2View = ({ gameId }: { gameId: string }) => {
  // Implementation: fetch assignments, render each as a card with a textarea
  // On submit, call api.submitRound2 with all responses
  return <WaitingView message="Round 2 — Cross-Perspective Response (coming soon)" />;
};

const DeliberationView = ({ gameId }: { gameId: string }) => {
  // Implementation: connect to deliberation WebSocket, render artifacts as they arrive
  return <WaitingView message="Deliberation in progress..." />;
};

const WaitingView = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-[60vh] p-8 text-center">
    <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-4" />
    <p className="text-gray-400">{message}</p>
  </div>
);

export default CouncilScreen;
```

#### `mini-app/src/pages/BadgeGalleryScreen.tsx`

```typescript
import { useEffect, useState } from 'react';
import { api, type CatalogBadge } from '../lib/api';
import BadgeIcon from '../components/BadgeIcon';

const BadgeGalleryScreen = () => {
  const [catalog, setCatalog] = useState<CatalogBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CatalogBadge | null>(null);

  useEffect(() => {
    api.getBadgeCatalog().then((r) => setCatalog(r.badges)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Badge Gallery</h1>
      <div className="grid grid-cols-4 gap-4">
        {catalog.map((badge) => (
          <BadgeIcon key={badge.id} name={badge.name} imageUrl={badge.imageUrl} earned={badge.earned} onClick={() => setSelected(badge)} />
        ))}
      </div>
      {selected && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-[#232e3c] rounded-2xl p-6 w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-1">{selected.name}</h2>
            <p className="text-gray-400 text-sm mb-3">{selected.description}</p>
            {selected.cxpValue > 0 && <p className="text-yellow-400 text-sm">+{selected.cxpValue} CXP on earn</p>}
            {selected.threshold > 1 && <p className="text-gray-500 text-xs mt-1">Requires {selected.threshold} completions</p>}
            {selected.earned && <p className="text-green-400 text-sm mt-2">✓ Earned on {new Date(selected.earnedAt!).toLocaleDateString()}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default BadgeGalleryScreen;
```

---

### Ticket FE-05: Advanced SDK Integration

#### Biometric Confirmation (for future admin-triggered emergency actions)

Create `mini-app/src/components/RedButton.tsx`:

```typescript
import WebApp from '@twa-dev/sdk';

interface RedButtonProps {
  onConfirmed: () => void;
  label: string;
}

const RedButton = ({ onConfirmed, label }: RedButtonProps) => {
  const handlePress = () => {
    const biometric = WebApp.BiometricManager;
    biometric.init(() => {
      if (biometric.isBiometricAvailable) {
        biometric.authenticate({ reason: label }, (isAuthenticated) => {
          if (isAuthenticated) onConfirmed();
        });
      } else {
        // Fallback: simple confirmation dialog
        if (window.confirm(`Confirm: ${label}?`)) onConfirmed();
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50 p-8">
      <div className="text-6xl mb-6">🚨</div>
      <h2 className="text-2xl font-bold text-red-400 mb-2 text-center">{label}</h2>
      <p className="text-gray-400 text-sm text-center mb-8">This action requires biometric confirmation.</p>
      <button onClick={handlePress} className="w-full bg-red-600 text-white py-5 rounded-2xl font-bold text-xl">
        Confirm with Biometrics
      </button>
    </div>
  );
};

export default RedButton;
```

---

## Part 3: Deployment & Go-Live

### Ticket OPS-01: Production Deployment Checklist

Complete the following steps in order.

**Backend:**
1.  Merge all changes to the main branch.
2.  Deploy the `engine/` application to the production host.
3.  Set all environment variables on the production host, including the new `TELEGRAM_BOT_TOKEN` and `MINI_APP_ORIGIN`.
4.  Run `pnpm db:migrate` against the production database.
5.  Run `pnpm db:seed` against the production database to populate the `badges` table.

**Frontend:**
1.  Connect the `mini-app/` directory to a Vercel or Netlify project.
2.  Set `VITE_API_URL` to the production backend URL.
3.  Deploy. Note the resulting production URL.

**Bot:**
1.  Update the `@BotFather` menu button URL to the production frontend URL.
2.  Update `MINI_APP_ORIGIN` on the backend to match the production frontend URL.

**Final Verification:**
- [ ] A new user can open the bot, tap "Open Passport," and see the Mini App.
- [ ] A user can join a game using an invite code via the Mini App.
- [ ] A user can submit a Round 1 response and receive haptic feedback.
- [ ] After submission, the user's CXP increases by 10 in the database.
- [ ] After completing Round 1, the `first-voice` badge appears in the user's Passport.
- [ ] The `BadgeEarnedModal` appears and the "Share" button triggers the Telegram share sheet.

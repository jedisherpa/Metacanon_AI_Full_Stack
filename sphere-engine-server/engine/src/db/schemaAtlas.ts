/**
 * Living Atlas schema additions.
 * These tables extend the base council-engine schema for the Telegram Mini App.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

// ─── User Profiles ────────────────────────────────────────────────────────────
// One row per Telegram user. Auto-provisioned on first atlas/state call.
export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    telegramId: varchar('telegram_id', { length: 30 }).notNull(),
    firstName: varchar('first_name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }),
    username: varchar('username', { length: 255 }),
    isPremium: boolean('is_premium').notNull().default(false),
    photoUrl: text('photo_url'),
    // Game stats
    gamesPlayed: integer('games_played').notNull().default(0),
    gamesWon: integer('games_won').notNull().default(0),
    cxpTotal: integer('cxp_total').notNull().default(0),
    currentStreak: integer('current_streak').notNull().default(0),
    // Earned lenses (JSON array of lens IDs)
    earnedLenses: jsonb('earned_lenses').$type<string[]>().notNull().default([]),
    // Active lens override (null = use assigned lens)
    activeLensId: varchar('active_lens_id', { length: 100 }),
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    telegramIdUnique: uniqueIndex('user_profiles_telegram_id_unique').on(table.telegramId),
    usernameIdx: index('user_profiles_username_idx').on(table.username)
  })
);

// ─── Sphere Votes ─────────────────────────────────────────────────────────────
// Governance proposals that can be voted on via the Citadel.
export const sphereVotes = pgTable(
  'sphere_votes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sphereId: varchar('sphere_id', { length: 100 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description').notNull(),
    proposedBy: varchar('proposed_by', { length: 30 }).notNull(), // telegram_id
    status: varchar('status', { length: 20 }).notNull().default('open'), // open | closed | passed | failed
    // Advice process fields
    adviceGiven: boolean('advice_given').notNull().default(false),
    adviceNotes: text('advice_notes'),
    // AI governance review
    aiReviewStatus: varchar('ai_review_status', { length: 20 }).default('pending'), // pending | approved | flagged
    aiReviewNotes: text('ai_review_notes'),
    // Impact flag
    impactFlagged: boolean('impact_flagged').notNull().default(false),
    impactNotes: text('impact_notes'),
    // Timing
    opensAt: timestamp('opens_at', { withTimezone: false }).notNull().defaultNow(),
    closesAt: timestamp('closes_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    sphereIdx: index('sphere_votes_sphere_idx').on(table.sphereId),
    statusIdx: index('sphere_votes_status_idx').on(table.status),
    proposedByIdx: index('sphere_votes_proposed_by_idx').on(table.proposedBy)
  })
);

// ─── Vote Choices ─────────────────────────────────────────────────────────────
// Individual votes cast by users on sphere_votes proposals.
export const voteChoices = pgTable(
  'vote_choices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    voteId: uuid('vote_id').notNull(), // FK → sphere_votes.id
    telegramId: varchar('telegram_id', { length: 30 }).notNull(),
    choice: varchar('choice', { length: 20 }).notNull(), // yes | no | abstain
    rationale: text('rationale'),
    castAt: timestamp('cast_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    uniqueVoter: uniqueIndex('vote_choices_unique_voter').on(table.voteId, table.telegramId),
    voteIdx: index('vote_choices_vote_idx').on(table.voteId),
    telegramIdx: index('vote_choices_telegram_idx').on(table.telegramId)
  })
);

// ─── Governance Events ────────────────────────────────────────────────────────
// Log of all governance actions (meetings, reports, ratchet events, etc.)
export const governanceEvents = pgTable(
  'governance_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sphereId: varchar('sphere_id', { length: 100 }).notNull(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    actorTelegramId: varchar('actor_telegram_id', { length: 30 }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    sphereIdx: index('governance_events_sphere_idx').on(table.sphereId),
    eventTypeIdx: index('governance_events_event_type_idx').on(table.eventType)
  })
);

export type UserProfile = typeof userProfiles.$inferSelect;
export type SphereVote = typeof sphereVotes.$inferSelect;
export type VoteChoice = typeof voteChoices.$inferSelect;
export type GovernanceEvent = typeof governanceEvents.$inferSelect;

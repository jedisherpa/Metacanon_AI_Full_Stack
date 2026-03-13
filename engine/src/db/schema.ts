import {
  bigint,
  bigserial,
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

export const games = pgTable(
  'games',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    question: text('question').notNull(),
    groupSize: integer('group_size').notNull(),
    provider: varchar('provider', { length: 10 }).notNull().default('morpheus'),
    entryMode: varchar('entry_mode', { length: 20 }).notNull().default('self_join'),
    status: varchar('status', { length: 30 }).notNull().default('draft'),
    inviteCode: varchar('invite_code', { length: 20 }).notNull(),
    positionRevealSeconds: integer('position_reveal_seconds').notNull().default(15),
    stateVersion: integer('state_version').notNull().default(0),
    deliberationPhase: varchar('deliberation_phase', { length: 30 }),
    archivedAt: timestamp('archived_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    inviteCodeUnique: uniqueIndex('games_invite_code_unique').on(table.inviteCode),
    statusIdx: index('games_status_idx').on(table.status)
  })
);

export const gamePlayers = pgTable(
  'game_players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id').notNull(),
    seatNumber: integer('seat_number').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    accessToken: varchar('access_token', { length: 255 }).notNull(),
    avatarId: varchar('avatar_id', { length: 100 }).notNull(),
    avatarName: varchar('avatar_name', { length: 120 }).notNull(),
    epistemology: varchar('epistemology', { length: 160 }).notNull(),
    hintText: text('hint_text'),
    preRegistered: boolean('pre_registered').notNull().default(false),
    round1Complete: boolean('round1_complete').notNull().default(false),
    round2Complete: boolean('round2_complete').notNull().default(false),
    deliberationEligible: boolean('deliberation_eligible').notNull().default(false),
    joinedAt: timestamp('joined_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    gameSeatUnique: uniqueIndex('game_players_game_seat_unique').on(table.gameId, table.seatNumber),
    accessTokenUnique: uniqueIndex('game_players_access_token_unique').on(table.accessToken),
    gameIdIdx: index('game_players_game_id_idx').on(table.gameId)
  })
);

export const round1Responses = pgTable(
  'round1_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id').notNull(),
    playerId: uuid('player_id').notNull(),
    content: text('content').notNull(),
    wordCount: integer('word_count').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    uniquePlayerRound1: uniqueIndex('round1_responses_game_player_unique').on(table.gameId, table.playerId),
    gameIdx: index('round1_responses_game_idx').on(table.gameId)
  })
);

export const round2Assignments = pgTable(
  'round2_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id').notNull(),
    assigneePlayerId: uuid('assignee_player_id').notNull(),
    targetPlayerId: uuid('target_player_id').notNull(),
    promptText: text('prompt_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    uniqueAssignment: uniqueIndex('round2_assignments_unique').on(
      table.gameId,
      table.assigneePlayerId,
      table.targetPlayerId
    ),
    gameAssigneeIdx: index('round2_assignments_assignee_idx').on(table.gameId, table.assigneePlayerId)
  })
);

export const round2Responses = pgTable(
  'round2_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id').notNull(),
    assignmentId: uuid('assignment_id').notNull(),
    assigneePlayerId: uuid('assignee_player_id').notNull(),
    targetPlayerId: uuid('target_player_id').notNull(),
    content: text('content').notNull(),
    wordCount: integer('word_count').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    uniqueAssignmentResponse: uniqueIndex('round2_responses_assignment_unique').on(table.assignmentId),
    gameIdx: index('round2_responses_game_idx').on(table.gameId)
  })
);

export const synthesisArtifacts = pgTable(
  'synthesis_artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id').notNull(),
    artifactType: varchar('artifact_type', { length: 30 }).notNull(),
    content: text('content').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    gameIdx: index('synthesis_artifacts_game_idx').on(table.gameId)
  })
);

export const commands = pgTable(
  'commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id'),
    commandType: varchar('command_type', { length: 60 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    dedupeKey: varchar('dedupe_key', { length: 120 }),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: false }),
    finishedAt: timestamp('finished_at', { withTimezone: false })
  },
  (table) => ({
    dedupeKeyUnique: uniqueIndex('commands_dedupe_key_unique').on(table.dedupeKey),
    gameIdx: index('commands_game_idx').on(table.gameId),
    statusIdx: index('commands_status_idx').on(table.status)
  })
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id'),
    actorType: varchar('actor_type', { length: 20 }).notNull(),
    actorId: varchar('actor_id', { length: 255 }),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    gameIdx: index('audit_events_game_idx').on(table.gameId),
    eventIdx: index('audit_events_event_idx').on(table.eventType)
  })
);

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: false }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('admin_sessions_token_hash_unique').on(table.tokenHash),
    expiresIdx: index('admin_sessions_expires_idx').on(table.expiresAt)
  })
);

export const sphereThreads = pgTable(
  'sphere_threads',
  {
    threadId: uuid('thread_id').primaryKey(),
    missionId: uuid('mission_id').notNull(),
    createdBy: text('created_by').notNull(),
    state: varchar('state', { length: 40 }).notNull().default('ACTIVE'),
    nextSequence: bigint('next_sequence', { mode: 'number' }).notNull().default(1),
    lastEntryHash: text('last_entry_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    createdAtIdx: index('sphere_threads_created_at_idx').on(table.createdAt),
    stateIdx: index('sphere_threads_state_idx').on(table.state)
  })
);

export const sphereEvents = pgTable(
  'sphere_events',
  {
    eventId: bigserial('event_id', { mode: 'number' }).primaryKey(),
    threadId: uuid('thread_id').notNull(),
    sequence: bigint('sequence', { mode: 'number' }).notNull(),
    messageId: uuid('message_id').notNull(),
    authorDid: text('author_did').notNull(),
    intent: text('intent').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    clientEnvelope: jsonb('client_envelope').$type<Record<string, unknown>>().notNull(),
    ledgerEnvelope: jsonb('ledger_envelope').$type<Record<string, unknown>>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    entryHash: text('entry_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    threadSequenceUnique: uniqueIndex('sphere_events_thread_sequence_unique').on(
      table.threadId,
      table.sequence
    ),
    idempotencyUnique: uniqueIndex('sphere_events_thread_message_unique').on(
      table.threadId,
      table.messageId
    ),
    threadSequenceIdx: index('sphere_events_thread_sequence_idx').on(table.threadId, table.sequence),
    intentIdx: index('sphere_events_intent_idx').on(table.intent),
    authorIdx: index('sphere_events_author_idx').on(table.authorDid)
  })
);

export const counselors = pgTable(
  'counselors',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    counselorDid: text('counselor_did').notNull(),
    counselorSet: varchar('counselor_set', { length: 80 }).notNull().default('security_council'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true })
  },
  (table) => ({
    didUnique: uniqueIndex('counselors_did_unique').on(table.counselorDid),
    activeIdx: index('counselors_active_idx').on(table.isActive)
  })
);

export const redTeamRuns = pgTable(
  'redteam_runs',
  {
    runId: varchar('run_id', { length: 96 }).primaryKey(),
    suite: varchar('suite', { length: 80 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    totalScenarios: integer('total_scenarios').notNull().default(0),
    passedScenarios: integer('passed_scenarios').notNull().default(0),
    failedScenarios: integer('failed_scenarios').notNull().default(0),
    blockedProbeScenarios: integer('blocked_probe_scenarios').notNull().default(0),
    attackClassCounts: jsonb('attack_class_counts')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    report: jsonb('report').$type<Record<string, unknown>>().notNull(),
    reportPath: text('report_path'),
    snapshotPath: text('snapshot_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    suiteGeneratedAtIdx: index('redteam_runs_suite_generated_at_idx').on(table.suite, table.generatedAt),
    statusIdx: index('redteam_runs_status_idx').on(table.status)
  })
);

export type Game = typeof games.$inferSelect;
export type GamePlayer = typeof gamePlayers.$inferSelect;
export type Round1Response = typeof round1Responses.$inferSelect;
export type Round2Assignment = typeof round2Assignments.$inferSelect;
export type Round2Response = typeof round2Responses.$inferSelect;
export type SynthesisArtifact = typeof synthesisArtifacts.$inferSelect;
export type Command = typeof commands.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type SphereThread = typeof sphereThreads.$inferSelect;
export type SphereEvent = typeof sphereEvents.$inferSelect;
export type Counselor = typeof counselors.$inferSelect;
export type RedTeamRun = typeof redTeamRuns.$inferSelect;

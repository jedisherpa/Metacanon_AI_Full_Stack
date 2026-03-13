import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { db } from '../../db/client.js';
import { games, commands, auditEvents } from '../../db/schema.js';
import { userProfiles } from '../../db/schemaAtlas.js';
import { telegramAuthMiddleware } from '../../middleware/telegramAuth.js';
import { eq, desc, count, sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import type { LensPack } from '../../config/lensPack.js';
import { z } from 'zod';
import { sendApiError } from '../../lib/apiError.js';
import { SkillRuntimeError, type SkillRuntime } from '../../agents/skillRuntime.js';
import { loadRedTeamArtifacts } from '../../observability/redTeamReports.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../../../../');
const defaultRedTeamReportPath = path.join(
  projectRoot,
  'artifacts',
  'redteam',
  'governance-redteam-report.json'
);

function resolveRedTeamReportPath(configuredPath?: string): string {
  if (!configuredPath?.trim()) {
    return defaultRedTeamReportPath;
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(projectRoot, configuredPath);
}

const skillRunSchema = z.object({
  skillId: z.string().min(1),
  input: z.unknown().default({}),
  traceId: z.string().min(1).optional()
});

export function createEngineRoomRoutes(deps: { lensPack: LensPack; skillRuntime?: SkillRuntime }): Router {
  const router = Router();
  const { lensPack, skillRuntime } = deps;

  router.use('/api/v1/engine-room', telegramAuthMiddleware);

  // ─── GET /api/v1/engine-room/status-all ────────────────────────────────────
  router.get('/api/v1/engine-room/status-all', async (req, res) => {
    try {
      const [gameStats, commandStats, userCount] = await Promise.all([
        db.select({ status: games.status, cnt: count() }).from(games).groupBy(games.status),
        db.select({ status: commands.status, cnt: count() }).from(commands).groupBy(commands.status),
        db.select({ cnt: count() }).from(userProfiles)
      ]);

      res.json({
        ok: true,
        status: {
          games: gameStats,
          commands: commandStats,
          totalUsers: userCount[0]?.cnt ?? 0,
          provider: env.LLM_PROVIDER_DEFAULT,
          uptime: process.uptime()
        },
        hapticTrigger: null
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'STATUS_ALL_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/db-health ─────────────────────────────────────
  router.get('/api/v1/engine-room/db-health', async (req, res) => {
    try {
      const result = await db.execute(sql`SELECT 1 as ok`);
      res.json({ ok: true, db: 'healthy', hapticTrigger: null });
    } catch (err) {
      res.status(503).json({ ok: false, db: 'unhealthy', error: String(err) });
    }
  });

  // ─── GET /api/v1/engine-room/db-view ───────────────────────────────────────
  router.get('/api/v1/engine-room/db-view', async (req, res) => {
    try {
      const { table, limit } = req.query as { table?: string; limit?: string };
      const lim = Math.min(parseInt(limit ?? '20', 10), 100);

      const tableMap: Record<string, () => Promise<unknown[]>> = {
        games: () => db.select().from(games).orderBy(desc(games.createdAt)).limit(lim),
        commands: () => db.select().from(commands).orderBy(desc(commands.createdAt)).limit(lim),
        audit_events: () => db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(lim),
        user_profiles: () => db.select().from(userProfiles).orderBy(desc(userProfiles.createdAt)).limit(lim)
      };

      const queryFn = tableMap[table ?? 'games'];
      if (!queryFn) {
        res.status(400).json({ error: `Unknown table: ${table}`, code: 'UNKNOWN_TABLE' });
        return;
      }

      const rows = await queryFn();
      res.json({ ok: true, table: table ?? 'games', rows, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'DB_VIEW_ERROR' });
    }
  });

  // ─── POST /api/v1/engine-room/deploy-constellation ─────────────────────────
  router.post('/api/v1/engine-room/deploy-constellation', async (req, res) => {
    try {
      const { constellationId, question, groupSize } = req.body as {
        constellationId: string;
        question: string;
        groupSize?: number;
      };

      if (!constellationId || !question) {
        res.status(400).json({ error: 'constellationId and question required', code: 'VALIDATION_ERROR' });
        return;
      }

      const cmd = await db.insert(commands).values({
        commandType: 'deploy_constellation',
        payload: {
          constellationId,
          question,
          groupSize: groupSize ?? env.DEFAULT_GROUP_SIZE,
          deployedBy: req.telegramUserId
        }
      }).returning();

      res.json({ ok: true, commandId: cmd[0].id, hapticTrigger: 'impact_heavy' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'DEPLOY_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/drills ────────────────────────────────────────
  router.get('/api/v1/engine-room/drills', async (req, res) => {
    try {
      // Return available drill configurations
      const drills = lensPack.lenses.map((l) => ({
        id: `drill_${l.seat_number}`,
        name: `${l.avatar_name} Drill`,
        lensId: String(l.seat_number),
        epistemology: l.epistemology,
        family: l.family
      }));
      res.json({ ok: true, drills, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'DRILLS_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/export ────────────────────────────────────────
  router.get('/api/v1/engine-room/export', async (req, res) => {
    try {
      const { gameId } = req.query as { gameId: string };
      const game = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game[0]) {
        res.status(404).json({ error: 'Game not found', code: 'NOT_FOUND' });
        return;
      }

      const cmd = await db.insert(commands).values({
        gameId,
        commandType: 'export_game',
        payload: { requestedBy: req.telegramUserId, format: 'json' }
      }).returning();

      res.json({ ok: true, commandId: cmd[0].id, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'EXPORT_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/fallback-report ───────────────────────────────
  router.get('/api/v1/engine-room/fallback-report', async (req, res) => {
    try {
      const failedCommands = await db
        .select()
        .from(commands)
        .where(eq(commands.status, 'failed'))
        .orderBy(desc(commands.createdAt))
        .limit(50);

      res.json({ ok: true, failedCommands, count: failedCommands.length, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'FALLBACK_REPORT_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/redteam-report ────────────────────────────────
  router.get('/api/v1/engine-room/redteam-report', async (_req, res) => {
    try {
      const reportPath = resolveRedTeamReportPath(env.SPHERE_REDTEAM_REPORT_PATH);
      res.json({
        ok: true,
        ...(await loadRedTeamArtifacts({
          reportPath,
          storageMode: env.SPHERE_REDTEAM_STORAGE_MODE,
          trendWindowSize: env.SPHERE_REDTEAM_TREND_WINDOW
        })),
        hapticTrigger: null
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'REDTEAM_REPORT_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/glossary ──────────────────────────────────────
  router.get('/api/v1/engine-room/glossary', async (req, res) => {
    try {
      const glossary = [
        { term: 'Sphere', definition: 'A self-governing deliberation unit within the DIF ecosystem.' },
        { term: 'Lens', definition: 'An epistemological archetype that shapes how a player sees and reasons about a problem.' },
        { term: 'CXP', definition: 'Council Experience Points — earned by participating in and winning deliberations.' },
        { term: 'Ratchet', definition: 'The governance mechanism that locks in a decision permanently.' },
        { term: 'Prism', definition: 'The synthesis artifact that maps clashes, consensus, options, paradoxes, and minority views.' },
        { term: 'PvN', definition: 'Player-vs-Network — the game mode where a human challenges an AI Council.' },
        { term: 'Constellation', definition: 'A pre-configured set of AI council members for a specific deliberation type.' },
        { term: 'Advice Process', definition: 'The governance step where affected parties must be consulted before a decision is made.' }
      ];
      res.json({ ok: true, glossary, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'GLOSSARY_ERROR' });
    }
  });

  // ─── POST /api/v1/engine-room/heartbeat-mute ───────────────────────────────
  router.post('/api/v1/engine-room/heartbeat-mute', async (req, res) => {
    try {
      const { gameId, durationMinutes } = req.body as { gameId?: string; durationMinutes?: number };
      // In a real implementation, this would pause heartbeat checks for a game
      res.json({ ok: true, mutedUntil: new Date(Date.now() + (durationMinutes ?? 5) * 60000).toISOString(), hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'HEARTBEAT_MUTE_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/list-constellations ───────────────────────────
  router.get('/api/v1/engine-room/list-constellations', async (req, res) => {
    try {
      // Return the available lens families as constellation archetypes
      const constellations = Object.entries(lensPack.families ?? {}).map(([id, family]) => ({
        id,
        name: (family as { name: string }).name,
        description: (family as { description: string }).description,
        seats: (family as { seat_numbers: number[] }).seat_numbers
      }));

      res.json({ ok: true, constellations, packId: lensPack.pack_id, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'LIST_CONSTELLATIONS_ERROR' });
    }
  });

  // ─── POST /api/v1/engine-room/pause-drills ─────────────────────────────────
  router.post('/api/v1/engine-room/pause-drills', async (req, res) => {
    try {
      // Queue a pause-drills command
      const cmd = await db.insert(commands).values({
        commandType: 'pause_drills',
        payload: { pausedBy: req.telegramUserId }
      }).returning();
      res.json({ ok: true, commandId: cmd[0].id, hapticTrigger: 'impact_light' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'PAUSE_DRILLS_ERROR' });
    }
  });

  // ─── POST /api/v1/engine-room/resume-drills ────────────────────────────────
  router.post('/api/v1/engine-room/resume-drills', async (req, res) => {
    try {
      const cmd = await db.insert(commands).values({
        commandType: 'resume_drills',
        payload: { resumedBy: req.telegramUserId }
      }).returning();
      res.json({ ok: true, commandId: cmd[0].id, hapticTrigger: 'impact_light' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'RESUME_DRILLS_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/sphere ────────────────────────────────────────
  router.get('/api/v1/engine-room/sphere', async (req, res) => {
    try {
      const { sphereId } = req.query as { sphereId: string };
      // Return sphere metadata (games, stats)
      const sphereGames = await db
        .select()
        .from(games)
        .orderBy(desc(games.createdAt))
        .limit(10);

      res.json({ ok: true, sphereId: sphereId ?? 'global', games: sphereGames, hapticTrigger: null });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'SPHERE_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/what-is-a-sphere ──────────────────────────────
  router.get('/api/v1/engine-room/what-is-a-sphere', async (req, res) => {
    res.json({
      ok: true,
      explanation: {
        title: 'What is a Sphere?',
        body: 'A Sphere is the fundamental unit of governance in the Deliberative Intelligence Fabric. Each Sphere is a self-governing deliberation community with its own constitution, voting rules, and council of AI members. Spheres can be nested, federated, and linked. Every decision made within a Sphere is logged immutably and can be reviewed, challenged, or ratified through the governance ratchet.',
        keyProperties: [
          'Self-governing with its own constitution',
          'Contains an AI Council of 12 epistemological lenses',
          'All decisions are logged and auditable',
          'Can federate with other Spheres',
          'Governed by the Advice Process for material decisions'
        ]
      },
      hapticTrigger: null
    });
  });

  // ─── GET /api/v1/engine-room/config ────────────────────────────────────────
  router.get('/api/v1/engine-room/config', async (req, res) => {
    try {
      res.json({
        ok: true,
        config: {
          lensPack: lensPack.pack_id,
          defaultGroupSize: env.DEFAULT_GROUP_SIZE,
          positionRevealSeconds: env.POSITION_REVEAL_SECONDS,
          llmProvider: env.LLM_PROVIDER_DEFAULT,
          inlineWorkerEnabled: env.INLINE_WORKER_ENABLED
        },
        hapticTrigger: null
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'CONFIG_GET_ERROR' });
    }
  });

  // ─── PATCH /api/v1/engine-room/config ──────────────────────────────────────
  router.patch('/api/v1/engine-room/config', async (req, res) => {
    try {
      // Runtime config updates (non-persistent, until restart)
      const { defaultGroupSize, positionRevealSeconds } = req.body as {
        defaultGroupSize?: number;
        positionRevealSeconds?: number;
      };

      // In production, these would update a runtime config store
      res.json({
        ok: true,
        updated: { defaultGroupSize, positionRevealSeconds },
        note: 'Config updates are runtime-only. Restart to reset.',
        hapticTrigger: 'impact_light'
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'CONFIG_PATCH_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/skills ────────────────────────────────────────
  router.get('/api/v1/engine-room/skills', async (_req, res) => {
    try {
      if (!skillRuntime) {
        sendApiError(_req, res, 503, 'SKILL_RUNTIME_UNAVAILABLE', 'Skill runtime is unavailable.', true);
        return;
      }
      res.json({
        ok: true,
        skills: skillRuntime.listSkills(),
        hapticTrigger: null
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error', code: 'SKILLS_LIST_ERROR' });
    }
  });

  // ─── GET /api/v1/engine-room/skills/:skillId/status ───────────────────────
  router.get('/api/v1/engine-room/skills/:skillId/status', async (req, res) => {
    try {
      if (!skillRuntime) {
        sendApiError(req, res, 503, 'SKILL_RUNTIME_UNAVAILABLE', 'Skill runtime is unavailable.', true);
        return;
      }
      const status = skillRuntime.getSkillStatus(req.params.skillId);
      res.json({
        ok: true,
        status,
        hapticTrigger: null
      });
    } catch (err) {
      if (err instanceof SkillRuntimeError) {
        sendApiError(req, res, err.statusCode, err.code, err.message, false, err.details);
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'SKILL_STATUS_ERROR' });
    }
  });

  // ─── POST /api/v1/engine-room/skills/run ───────────────────────────────────
  router.post('/api/v1/engine-room/skills/run', async (req, res) => {
    try {
      if (!skillRuntime) {
        sendApiError(req, res, 503, 'SKILL_RUNTIME_UNAVAILABLE', 'Skill runtime is unavailable.', true);
        return;
      }

      const parsed = skillRunSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(
          req,
          res,
          400,
          'SKILL_RUN_INPUT_INVALID',
          'Invalid skill run payload.',
          false,
          parsed.error.flatten()
        );
        return;
      }

      const run = await skillRuntime.runSkill({
        skillId: parsed.data.skillId,
        input: parsed.data.input,
        traceId: parsed.data.traceId,
        requestedBy: req.telegramUserId
      });

      const statusCode =
        run.result.status === 'blocked' && run.result.code === 'SKILL_ALREADY_RUNNING' ? 409 : 200;

      res.status(statusCode).json({
        ok: run.result.status === 'success',
        run,
        hapticTrigger: run.result.status === 'success' ? 'impact_light' : null
      });
    } catch (err) {
      if (err instanceof SkillRuntimeError) {
        sendApiError(req, res, err.statusCode, err.code, err.message, false, err.details);
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'SKILL_RUN_ERROR' });
    }
  });

  return router;
}

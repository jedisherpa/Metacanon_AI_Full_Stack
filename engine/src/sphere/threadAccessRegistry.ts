import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/client.js';

type MembershipRole = 'owner' | 'member';

type MembershipRow = {
  thread_id: string;
  principal: string;
  role: MembershipRole;
  invited_by: string | null;
  invite_code: string | null;
  created_at: string | Date;
};

type InviteRow = {
  invite_code: string;
  thread_id: string;
  created_by: string;
  label: string | null;
  purpose: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string | Date | null;
  revoked_at: string | Date | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  created_at: string | Date;
};

export type ThreadMembership = {
  threadId: string;
  principal: string;
  role: MembershipRole;
  invitedBy?: string;
  inviteCode?: string;
  joinedAt: string;
};

export type ThreadWriteAccessDecision = {
  allowed: boolean;
  bootstrap: boolean;
};

export type ThreadInvite = {
  inviteCode: string;
  threadId: string;
  createdBy: string;
  label?: string;
  purpose?: string;
  maxUses: number;
  usedCount: number;
  remainingUses: number;
  expiresAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
  createdAt: string;
};

export type InviteAcceptance = {
  inviteCode: string;
  threadId: string;
  principal: string;
  role: MembershipRole;
  acceptedAt: string;
  remainingUses: number;
  expiresAt?: string;
};

export type MembershipRemoval = {
  threadId: string;
  principal: string;
  role: MembershipRole;
  removedAt: string;
};

export class ThreadAccessError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function toIsoString(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString();
}

function toIsoStringNullable(value: string | Date | null): string | undefined {
  if (!value) {
    return undefined;
  }
  return typeof value === 'string' ? value : value.toISOString();
}

function nextInviteCode(): string {
  return randomBytes(18).toString('base64url');
}

export class ThreadAccessRegistry {
  private readonly ready: Promise<void>;

  private constructor() {
    this.ready = this.ensureSchema();
  }

  static async create(): Promise<ThreadAccessRegistry> {
    const registry = new ThreadAccessRegistry();
    await registry.ready;
    return registry;
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private async ensureSchema(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sphere_thread_memberships (
        thread_id TEXT NOT NULL,
        principal TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        invited_by TEXT,
        invite_code TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (thread_id, principal)
      );

      CREATE INDEX IF NOT EXISTS idx_sphere_thread_memberships_thread
        ON sphere_thread_memberships(thread_id);

      CREATE INDEX IF NOT EXISTS idx_sphere_thread_memberships_principal
        ON sphere_thread_memberships(principal);

      CREATE TABLE IF NOT EXISTS sphere_thread_invites (
        invite_code TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        label TEXT,
        purpose TEXT,
        max_uses INTEGER NOT NULL DEFAULT 1,
        used_count INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        revoked_by TEXT,
        revocation_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sphere_thread_invites_thread
        ON sphere_thread_invites(thread_id);

      ALTER TABLE sphere_thread_invites
        ADD COLUMN IF NOT EXISTS label TEXT;

      ALTER TABLE sphere_thread_invites
        ADD COLUMN IF NOT EXISTS purpose TEXT;

      ALTER TABLE sphere_thread_invites
        ADD COLUMN IF NOT EXISTS revoked_by TEXT;

      ALTER TABLE sphere_thread_invites
        ADD COLUMN IF NOT EXISTS revocation_reason TEXT;

      CREATE TABLE IF NOT EXISTS sphere_thread_invite_acceptances (
        invite_code TEXT NOT NULL,
        principal TEXT NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (invite_code, principal),
        FOREIGN KEY (invite_code)
          REFERENCES sphere_thread_invites(invite_code)
          ON DELETE CASCADE
      );
    `);
  }

  private rowToMembership(row: MembershipRow): ThreadMembership {
    return {
      threadId: row.thread_id,
      principal: row.principal,
      role: row.role,
      invitedBy: row.invited_by ?? undefined,
      inviteCode: row.invite_code ?? undefined,
      joinedAt: toIsoString(row.created_at)
    };
  }

  private rowToInvite(row: InviteRow): ThreadInvite {
    return {
      inviteCode: row.invite_code,
      threadId: row.thread_id,
      createdBy: row.created_by,
      label: row.label ?? undefined,
      purpose: row.purpose ?? undefined,
      maxUses: row.max_uses,
      usedCount: row.used_count,
      remainingUses: Math.max(row.max_uses - row.used_count, 0),
      expiresAt: toIsoStringNullable(row.expires_at),
      revokedAt: toIsoStringNullable(row.revoked_at),
      revokedBy: row.revoked_by ?? undefined,
      revocationReason: row.revocation_reason ?? undefined,
      createdAt: toIsoString(row.created_at)
    };
  }

  private async upsertMembershipWithClient(
    client: PoolClient,
    input: {
      threadId: string;
      principal: string;
      role: MembershipRole;
      invitedBy?: string;
      inviteCode?: string;
    }
  ): Promise<ThreadMembership> {
    const result = await client.query<MembershipRow>(
      `
        INSERT INTO sphere_thread_memberships (
          thread_id,
          principal,
          role,
          invited_by,
          invite_code,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NOW(), NOW())
        ON CONFLICT (thread_id, principal) DO UPDATE SET
          role = CASE
            WHEN sphere_thread_memberships.role = 'owner' THEN sphere_thread_memberships.role
            ELSE EXCLUDED.role
          END,
          invited_by = COALESCE(NULLIF(EXCLUDED.invited_by, ''), sphere_thread_memberships.invited_by),
          invite_code = COALESCE(NULLIF(EXCLUDED.invite_code, ''), sphere_thread_memberships.invite_code),
          updated_at = NOW()
        RETURNING thread_id, principal, role, invited_by, invite_code, created_at
      `,
      [
        input.threadId,
        input.principal,
        input.role,
        input.invitedBy ?? null,
        input.inviteCode ?? null
      ]
    );

    return this.rowToMembership(result.rows[0]);
  }

  async grantMembership(input: {
    threadId: string;
    principal: string;
    role?: MembershipRole;
    invitedBy?: string;
    inviteCode?: string;
  }): Promise<ThreadMembership> {
    await this.ensureReady();
    const client = await pool.connect();

    try {
      return await this.upsertMembershipWithClient(client, {
        threadId: input.threadId,
        principal: input.principal,
        role: input.role ?? 'member',
        invitedBy: input.invitedBy,
        inviteCode: input.inviteCode
      });
    } finally {
      client.release();
    }
  }

  async getMembership(
    threadId: string,
    principal: string
  ): Promise<ThreadMembership | null> {
    await this.ensureReady();
    const result = await pool.query<MembershipRow>(
      `
        SELECT thread_id, principal, role, invited_by, invite_code, created_at
        FROM sphere_thread_memberships
        WHERE thread_id = $1
          AND principal = $2
        LIMIT 1
      `,
      [threadId, principal]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.rowToMembership(result.rows[0]);
  }

  async listMembers(threadId: string, limit = 100): Promise<ThreadMembership[]> {
    await this.ensureReady();
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
    const result = await pool.query<MembershipRow>(
      `
        SELECT thread_id, principal, role, invited_by, invite_code, created_at
        FROM sphere_thread_memberships
        WHERE thread_id = $1
        ORDER BY created_at ASC
        LIMIT $2
      `,
      [threadId, safeLimit]
    );

    return result.rows.map((row) => this.rowToMembership(row));
  }

  async countMembers(threadId: string): Promise<number> {
    await this.ensureReady();
    const result = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM sphere_thread_memberships
        WHERE thread_id = $1
      `,
      [threadId]
    );

    return Number.parseInt(result.rows[0]?.count ?? '0', 10) || 0;
  }

  async checkWriteAccess(input: {
    threadId: string;
    principal: string;
  }): Promise<ThreadWriteAccessDecision> {
    await this.ensureReady();

    const membership = await this.getMembership(input.threadId, input.principal);
    if (membership) {
      return { allowed: true, bootstrap: false };
    }

    const memberCount = await this.countMembers(input.threadId);
    if (memberCount === 0) {
      return { allowed: true, bootstrap: true };
    }

    return { allowed: false, bootstrap: false };
  }

  async createInvite(input: {
    threadId: string;
    principal: string;
    label?: string;
    purpose?: string;
    maxUses?: number;
    expiresInMinutes?: number;
  }): Promise<ThreadInvite> {
    await this.ensureReady();

    const membership = await this.getMembership(input.threadId, input.principal);
    if (!membership) {
      const memberCount = await this.countMembers(input.threadId);
      if (memberCount === 0) {
        await this.grantMembership({
          threadId: input.threadId,
          principal: input.principal,
          role: 'owner'
        });
      } else {
        throw new ThreadAccessError(
          403,
          'BFF_ERR_THREAD_ACCESS_DENIED',
          'Principal is not a member of this thread.',
          {
            threadId: input.threadId,
            principal: input.principal
          }
        );
      }
    }

    const maxUses = Number.isFinite(input.maxUses ?? 25)
      ? Math.min(Math.max(Math.trunc(input.maxUses ?? 25), 1), 1000)
      : 25;
    const expiresInMinutes = input.expiresInMinutes;
    const expiresAt =
      Number.isFinite(expiresInMinutes ?? NaN) && expiresInMinutes
        ? new Date(Date.now() + Math.trunc(expiresInMinutes) * 60_000)
        : null;
    const inviteCode = nextInviteCode();

    const result = await pool.query<InviteRow>(
      `
        INSERT INTO sphere_thread_invites (
          invite_code,
          thread_id,
          created_by,
          label,
          purpose,
          max_uses,
          used_count,
          expires_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6, 0, $7, NOW(), NOW())
        RETURNING
          invite_code,
          thread_id,
          created_by,
          label,
          purpose,
          max_uses,
          used_count,
          expires_at,
          revoked_at,
          revoked_by,
          revocation_reason,
          created_at
      `,
      [
        inviteCode,
        input.threadId,
        input.principal,
        input.label ?? null,
        input.purpose ?? null,
        maxUses,
        expiresAt
      ]
    );

    return this.rowToInvite(result.rows[0]);
  }

  async listInvites(
    threadId: string,
    options?: { limit?: number; includeRevoked?: boolean }
  ): Promise<ThreadInvite[]> {
    await this.ensureReady();
    const safeLimit = Number.isFinite(options?.limit ?? 50)
      ? Math.min(Math.max(Math.trunc(options?.limit ?? 50), 1), 500)
      : 50;
    const includeRevoked = Boolean(options?.includeRevoked);

    const result = includeRevoked
      ? await pool.query<InviteRow>(
          `
            SELECT
              invite_code,
              thread_id,
              created_by,
              label,
              purpose,
              max_uses,
              used_count,
              expires_at,
              revoked_at,
              revoked_by,
              revocation_reason,
              created_at
            FROM sphere_thread_invites
            WHERE thread_id = $1
            ORDER BY created_at DESC
            LIMIT $2
          `,
          [threadId, safeLimit]
        )
      : await pool.query<InviteRow>(
          `
            SELECT
              invite_code,
              thread_id,
              created_by,
              label,
              purpose,
              max_uses,
              used_count,
              expires_at,
              revoked_at,
              revoked_by,
              revocation_reason,
              created_at
            FROM sphere_thread_invites
            WHERE thread_id = $1
              AND revoked_at IS NULL
            ORDER BY created_at DESC
            LIMIT $2
          `,
          [threadId, safeLimit]
        );

    return result.rows.map((row) => this.rowToInvite(row));
  }

  async revokeInvite(input: {
    inviteCode: string;
    principal: string;
    reason?: string;
  }): Promise<ThreadInvite> {
    await this.ensureReady();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const inviteResult = await client.query<InviteRow>(
        `
          SELECT
            invite_code,
            thread_id,
            created_by,
            label,
            purpose,
            max_uses,
            used_count,
            expires_at,
            revoked_at,
            revoked_by,
            revocation_reason,
            created_at
          FROM sphere_thread_invites
          WHERE invite_code = $1
          LIMIT 1
          FOR UPDATE
        `,
        [input.inviteCode]
      );

      if (inviteResult.rowCount === 0) {
        throw new ThreadAccessError(404, 'BFF_ERR_INVITE_NOT_FOUND', 'Invite code not found.');
      }

      const invite = inviteResult.rows[0];
      const membership = await this.getMembership(invite.thread_id, input.principal);
      if (!membership) {
        throw new ThreadAccessError(
          403,
          'BFF_ERR_THREAD_ACCESS_DENIED',
          'Principal is not a member of this thread.',
          {
            threadId: invite.thread_id,
            principal: input.principal
          }
        );
      }

      if (membership.role !== 'owner' && invite.created_by !== input.principal) {
        throw new ThreadAccessError(
          403,
          'BFF_ERR_OWNER_REQUIRED',
          'Only thread owner or invite creator can revoke this invite.',
          {
            threadId: invite.thread_id,
            principal: input.principal
          }
        );
      }

      let revoked = invite;
      if (!invite.revoked_at) {
        const reason = input.reason?.trim() ? input.reason.trim() : null;
        const revokeResult = await client.query<InviteRow>(
          `
            UPDATE sphere_thread_invites
            SET
              revoked_at = NOW(),
              revoked_by = $2,
              revocation_reason = NULLIF($3, ''),
              updated_at = NOW()
            WHERE invite_code = $1
            RETURNING
              invite_code,
              thread_id,
              created_by,
              label,
              purpose,
              max_uses,
              used_count,
              expires_at,
              revoked_at,
              revoked_by,
              revocation_reason,
              created_at
          `,
          [invite.invite_code, input.principal, reason]
        );
        revoked = revokeResult.rows[0];
      }

      await client.query('COMMIT');
      return this.rowToInvite(revoked);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async removeMember(input: {
    threadId: string;
    actorPrincipal: string;
    memberPrincipal: string;
  }): Promise<MembershipRemoval> {
    await this.ensureReady();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const actorMembership = await this.getMembership(input.threadId, input.actorPrincipal);
      if (!actorMembership) {
        throw new ThreadAccessError(
          403,
          'BFF_ERR_THREAD_ACCESS_DENIED',
          'Principal is not a member of this thread.',
          {
            threadId: input.threadId,
            principal: input.actorPrincipal
          }
        );
      }

      if (actorMembership.role !== 'owner') {
        throw new ThreadAccessError(
          403,
          'BFF_ERR_OWNER_REQUIRED',
          'Only thread owner can remove members.',
          {
            threadId: input.threadId,
            principal: input.actorPrincipal
          }
        );
      }

      if (input.actorPrincipal === input.memberPrincipal) {
        throw new ThreadAccessError(
          409,
          'BFF_ERR_OWNER_SELF_REMOVE_FORBIDDEN',
          'Owner cannot remove themselves from thread membership.',
          {
            threadId: input.threadId,
            principal: input.actorPrincipal
          }
        );
      }

      const memberResult = await client.query<MembershipRow>(
        `
          SELECT thread_id, principal, role, invited_by, invite_code, created_at
          FROM sphere_thread_memberships
          WHERE thread_id = $1
            AND principal = $2
          LIMIT 1
          FOR UPDATE
        `,
        [input.threadId, input.memberPrincipal]
      );

      if (memberResult.rowCount === 0) {
        throw new ThreadAccessError(
          404,
          'BFF_ERR_MEMBER_NOT_FOUND',
          'Thread member not found.',
          {
            threadId: input.threadId,
            principal: input.memberPrincipal
          }
        );
      }

      const targetMembership = memberResult.rows[0];
      if (targetMembership.role === 'owner') {
        throw new ThreadAccessError(
          409,
          'BFF_ERR_OWNER_REMOVE_FORBIDDEN',
          'Owner membership cannot be removed directly.',
          {
            threadId: input.threadId,
            principal: input.memberPrincipal
          }
        );
      }

      await client.query(
        `
          DELETE FROM sphere_thread_memberships
          WHERE thread_id = $1
            AND principal = $2
        `,
        [input.threadId, input.memberPrincipal]
      );

      const removedAt = new Date().toISOString();
      await client.query('COMMIT');

      return {
        threadId: input.threadId,
        principal: input.memberPrincipal,
        role: targetMembership.role,
        removedAt
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async acceptInvite(input: {
    inviteCode: string;
    principal: string;
  }): Promise<InviteAcceptance> {
    await this.ensureReady();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const inviteResult = await client.query<InviteRow>(
        `
          SELECT
            invite_code,
            thread_id,
            created_by,
            label,
            purpose,
            max_uses,
            used_count,
            expires_at,
            revoked_at,
            revoked_by,
            revocation_reason,
            created_at
          FROM sphere_thread_invites
          WHERE invite_code = $1
          LIMIT 1
          FOR UPDATE
        `,
        [input.inviteCode]
      );

      if (inviteResult.rowCount === 0) {
        throw new ThreadAccessError(404, 'BFF_ERR_INVITE_NOT_FOUND', 'Invite code not found.');
      }

      const invite = inviteResult.rows[0];
      if (invite.revoked_at) {
        throw new ThreadAccessError(410, 'BFF_ERR_INVITE_REVOKED', 'Invite has been revoked.');
      }

      const expiresAtDate = invite.expires_at ? new Date(invite.expires_at) : null;
      if (expiresAtDate && expiresAtDate.getTime() < Date.now()) {
        throw new ThreadAccessError(410, 'BFF_ERR_INVITE_EXPIRED', 'Invite has expired.');
      }

      const acceptanceResult = await client.query<{ accepted_at: string | Date }>(
        `
          SELECT accepted_at
          FROM sphere_thread_invite_acceptances
          WHERE invite_code = $1
            AND principal = $2
          LIMIT 1
        `,
        [invite.invite_code, input.principal]
      );

      const isFirstAccept = acceptanceResult.rowCount === 0;
      if (isFirstAccept && invite.used_count >= invite.max_uses) {
        throw new ThreadAccessError(409, 'BFF_ERR_INVITE_EXHAUSTED', 'Invite has reached max uses.');
      }

      let acceptedAt = toIsoString(new Date());
      let usedCount = invite.used_count;

      if (isFirstAccept) {
        const insertedAcceptance = await client.query<{ accepted_at: string | Date }>(
          `
            INSERT INTO sphere_thread_invite_acceptances (
              invite_code,
              principal,
              accepted_at
            )
            VALUES ($1, $2, NOW())
            RETURNING accepted_at
          `,
          [invite.invite_code, input.principal]
        );
        acceptedAt = toIsoString(insertedAcceptance.rows[0].accepted_at);

        const inviteUpdate = await client.query<{ used_count: number }>(
          `
            UPDATE sphere_thread_invites
            SET used_count = used_count + 1, updated_at = NOW()
            WHERE invite_code = $1
            RETURNING used_count
          `,
          [invite.invite_code]
        );
        usedCount = inviteUpdate.rows[0].used_count;
      } else {
        acceptedAt = toIsoString(acceptanceResult.rows[0].accepted_at);
      }

      await this.upsertMembershipWithClient(client, {
        threadId: invite.thread_id,
        principal: input.principal,
        role: 'member',
        invitedBy: invite.created_by,
        inviteCode: invite.invite_code
      });

      await client.query('COMMIT');

      return {
        inviteCode: invite.invite_code,
        threadId: invite.thread_id,
        principal: input.principal,
        role: 'member',
        acceptedAt,
        remainingUses: Math.max(invite.max_uses - usedCount, 0),
        expiresAt: toIsoStringNullable(invite.expires_at)
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

import { pool } from '../db/client.js';

export type AgentIdentity = {
  did: string;
  label?: string;
  publicKey?: string;
  registeredAt: string;
};

export class DidRegistry {
  private readonly ready: Promise<void>;

  private constructor() {
    this.ready = this.ensureSchema();
  }

  static async create(): Promise<DidRegistry> {
    const registry = new DidRegistry();
    await registry.ready;
    return registry;
  }

  private async ensureSchema(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS did_registry (
        did TEXT PRIMARY KEY,
        label TEXT,
        public_key TEXT,
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_did_registry_registered_at
        ON did_registry(registered_at DESC);
    `);
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private rowToIdentity(row: {
    did: string;
    label: string | null;
    public_key: string | null;
    registered_at: string | Date;
  }): AgentIdentity {
    return {
      did: row.did,
      label: row.label ?? undefined,
      publicKey: row.public_key ?? undefined,
      registeredAt:
        typeof row.registered_at === 'string'
          ? row.registered_at
          : row.registered_at.toISOString()
    };
  }

  async register(identity: { did: string; label?: string; publicKey?: string }): Promise<AgentIdentity> {
    await this.ensureReady();
    const result = await pool.query<{
      did: string;
      label: string | null;
      public_key: string | null;
      registered_at: string | Date;
    }>(
      `
        INSERT INTO did_registry (did, label, public_key, registered_at, updated_at)
        VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NOW(), NOW())
        ON CONFLICT (did) DO UPDATE SET
          label = COALESCE(NULLIF(EXCLUDED.label, ''), did_registry.label),
          public_key = COALESCE(NULLIF(EXCLUDED.public_key, ''), did_registry.public_key),
          updated_at = NOW()
        RETURNING did, label, public_key, registered_at
      `,
      [identity.did, identity.label ?? null, identity.publicKey ?? null]
    );
    return this.rowToIdentity(result.rows[0]);
  }

  async get(did: string): Promise<AgentIdentity | null> {
    await this.ensureReady();
    const result = await pool.query<{
      did: string;
      label: string | null;
      public_key: string | null;
      registered_at: string | Date;
    }>(
      `
        SELECT did, label, public_key, registered_at
        FROM did_registry
        WHERE did = $1
        LIMIT 1
      `,
      [did]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.rowToIdentity(result.rows[0]);
  }

  async has(did: string): Promise<boolean> {
    await this.ensureReady();
    const result = await pool.query<{ found: number }>(
      `
        SELECT 1 AS found
        FROM did_registry
        WHERE did = $1
        LIMIT 1
      `,
      [did]
    );
    return result.rowCount > 0;
  }

  async list(options?: { limit?: number }): Promise<AgentIdentity[]> {
    await this.ensureReady();
    const rawLimit = options?.limit ?? 100;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;

    const result = await pool.query<{
      did: string;
      label: string | null;
      public_key: string | null;
      registered_at: string | Date;
    }>(
      `
        SELECT did, label, public_key, registered_at
        FROM did_registry
        ORDER BY registered_at DESC
        LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => this.rowToIdentity(row));
  }
}

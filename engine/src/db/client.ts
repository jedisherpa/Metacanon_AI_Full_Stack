import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.js';

type RoleSeparationOptions = {
  enforce?: boolean;
  expectedRole?: string;
  resolveCurrentUser?: () => Promise<string>;
};

type DbRoleSeparationConfig = {
  enforce: boolean;
  expectedRole: string;
  databaseUrl: string;
};

function readDatabaseUsername(databaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL must be a valid URL when SPHERE_DB_ENFORCE_ROLE_SEPARATION is true.'
    );
  }

  return decodeURIComponent(parsed.username).trim();
}

export function assertDatabaseUrlRoleSeparation(config: DbRoleSeparationConfig): void {
  if (!config.enforce) {
    return;
  }

  const expectedRole = config.expectedRole.trim();
  if (!expectedRole) {
    throw new Error(
      'SPHERE_DB_APP_ROLE must be set when SPHERE_DB_ENFORCE_ROLE_SEPARATION is true.'
    );
  }

  const configuredUser = readDatabaseUsername(config.databaseUrl);
  if (configuredUser !== expectedRole) {
    throw new Error(
      `DATABASE_URL user "${configuredUser || '<empty>'}" must match SPHERE_DB_APP_ROLE "${expectedRole}" when SPHERE_DB_ENFORCE_ROLE_SEPARATION is true.`
    );
  }
}

assertDatabaseUrlRoleSeparation({
  enforce: env.SPHERE_DB_ENFORCE_ROLE_SEPARATION,
  expectedRole: env.SPHERE_DB_APP_ROLE ?? '',
  databaseUrl: env.DATABASE_URL
});

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export const db = drizzle(pool);

let roleSeparationCheckPromise: Promise<void> | null = null;

export async function ensureSphereDbRoleSeparationOnStartup(
  options: RoleSeparationOptions = {}
): Promise<void> {
  const enforce = options.enforce ?? env.SPHERE_DB_ENFORCE_ROLE_SEPARATION;
  if (!enforce) {
    return;
  }

  const expectedRole = (options.expectedRole ?? env.SPHERE_DB_APP_ROLE ?? '').trim();
  if (!expectedRole) {
    throw new Error(
      'SPHERE_DB_APP_ROLE must be set when SPHERE_DB_ENFORCE_ROLE_SEPARATION is true.'
    );
  }

  if (options.resolveCurrentUser) {
    const currentUser = (await options.resolveCurrentUser()).trim();
    if (currentUser !== expectedRole) {
      throw new Error(
        `DB role separation check failed. Connected as "${currentUser}", expected "${expectedRole}".`
      );
    }
    return;
  }

  if (!roleSeparationCheckPromise) {
    roleSeparationCheckPromise = (async () => {
      const result = await pool.query<{ current_user: string }>('SELECT current_user');
      const currentUser = (result.rows[0]?.current_user ?? '').trim();
      if (currentUser !== expectedRole) {
        throw new Error(
          `DB role separation check failed. Connected as "${currentUser}", expected "${expectedRole}".`
        );
      }
    })();
  }

  return roleSeparationCheckPromise;
}

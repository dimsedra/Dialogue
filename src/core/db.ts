import TauriDatabase from "@tauri-apps/plugin-sql";
import type { DatabaseSync } from "node:sqlite";

export interface SqlExecutor {
  execute(sql: string, params?: unknown[]): Promise<void>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface SqlMigration {
  id: string;
  up: string;
}

export const MIGRATIONS: readonly SqlMigration[] = [
  {
    id: "001_init_schema_meta",
    up: `
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

let activeDb: SqlExecutor | null = null;

export function createNodeSqlExecutor(rawDb: DatabaseSync): SqlExecutor {
  return {
    async execute(sql: string, params?: unknown[]): Promise<void> {
      if (params && params.length > 0) {
        const stmt = rawDb.prepare(sql);
        stmt.run(...(params as (string | number | bigint | null | Uint8Array)[]));
        return;
      }
      rawDb.exec(sql);
    },
    async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const stmt = rawDb.prepare(sql);
      const rows = stmt.all(...((params ?? []) as (string | number | bigint | null | Uint8Array)[]));
      return rows.map((row) => ({ ...row })) as T[];
    },
    async close(): Promise<void> {
      rawDb.close();
    },
  };
}

export function createTauriSqlExecutor(db: TauriDatabase): SqlExecutor {
  return {
    async execute(sql: string, params?: unknown[]): Promise<void> {
      await db.execute(sql, params);
    },
    async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const rows = await db.select<T[]>(sql, params);
      return rows;
    },
    async close(): Promise<void> {
      await db.close();
    },
  };
}

export interface InitDbOptions {
  executor?: SqlExecutor;
  migrations?: readonly SqlMigration[];
  dbPath?: string;
}

export async function initDatabase(options: InitDbOptions = {}): Promise<SqlExecutor> {
  const executor =
    options.executor ??
    createTauriSqlExecutor(await TauriDatabase.load(options.dbPath ?? "sqlite:dialogue.db"));

  await executor.execute("PRAGMA journal_mode = WAL;");
  await executor.execute("PRAGMA busy_timeout = 5000;");
  await executor.execute("PRAGMA foreign_keys = ON;");

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = await executor.select<{ id: string }>(
    "SELECT id FROM _migrations"
  );
  const appliedIds = new Set(appliedRows.map((r) => r.id));

  const migrationsToRun = options.migrations ?? MIGRATIONS;
  for (const migration of migrationsToRun) {
    if (appliedIds.has(migration.id)) {
      continue;
    }
    try {
      await executor.execute(migration.up);
      await executor.execute(
        "INSERT INTO _migrations (id, applied_at) VALUES (?, datetime('now'))",
        [migration.id]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration '${migration.id}' failed: ${message}`);
    }
  }

  activeDb = executor;
  return executor;
}

export interface ConnectDbOptions {
  executor?: SqlExecutor;
  expectedLatestMigrationId?: string;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  dbPath?: string;
}

export async function connectReadWriteDatabase(
  options: ConnectDbOptions = {}
): Promise<SqlExecutor> {
  const executor =
    options.executor ??
    createTauriSqlExecutor(await TauriDatabase.load(options.dbPath ?? "sqlite:dialogue.db"));

  await executor.execute("PRAGMA journal_mode = WAL;");
  await executor.execute("PRAGMA busy_timeout = 5000;");
  await executor.execute("PRAGMA foreign_keys = ON;");

  const targetMigrationId =
    options.expectedLatestMigrationId ??
    (MIGRATIONS.length > 0 ? MIGRATIONS[MIGRATIONS.length - 1].id : undefined);

  if (targetMigrationId) {
    const pollInterval = options.pollIntervalMs ?? 50;
    const maxWait = options.maxWaitMs ?? 5000;
    const startTime = Date.now();
    let isReady = false;

    while (Date.now() - startTime < maxWait) {
      try {
        const rows = await executor.select<{ id: string }>(
          "SELECT id FROM _migrations WHERE id = ?",
          [targetMigrationId]
        );
        if (rows.length > 0) {
          isReady = true;
          break;
        }
      } catch {
        // _migrations table may not exist yet if main window is in the middle of cold start init
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    if (!isReady) {
      throw new Error(
        `Database schema readiness timeout: expected migration '${targetMigrationId}' within ${maxWait}ms`
      );
    }
  }

  activeDb = executor;
  return executor;
}

export function getDb(): SqlExecutor {
  if (!activeDb) {
    throw new Error("Database has not been initialized. Call initDatabase() first.");
  }
  return activeDb;
}

export function resetDbStateForTesting(): void {
  activeDb = null;
}

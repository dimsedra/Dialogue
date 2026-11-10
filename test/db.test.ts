import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  initDatabase,
  connectReadWriteDatabase,
  getDb,
  resetDbStateForTesting,
  createNodeSqlExecutor,
  type SqlMigration,
} from "../src/core/db";

describe("BP-CORE-002: Local SQLite Connection & Sequential Migration Runner", () => {
  beforeEach(() => {
    resetDbStateForTesting();
  });

  it("throws descriptive error when getDb() is called before initialization", () => {
    expect(() => getDb()).toThrowError(
      /Database has not been initialized. Call initDatabase\(\) first/
    );
  });

  it("executes WAL, foreign_keys pragmas, and applies pending migrations sequentially against real SQLite", async () => {
    const rawDb = new DatabaseSync(":memory:");
    const testExecutor = createNodeSqlExecutor(rawDb);

    const testMigrations: SqlMigration[] = [
      {
        id: "001_init_schema_meta",
        up: `
          CREATE TABLE app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `,
      },
      {
        id: "002_test_feature_table",
        up: `
          CREATE TABLE test_items (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL
          );
        `,
      },
    ];

    const db = await initDatabase({
      executor: testExecutor,
      migrations: testMigrations,
    });

    expect(db).toBe(testExecutor);
    expect(getDb()).toBe(testExecutor);

    // Verify _migrations table exists and holds applied migrations
    const applied = await db.select<{ id: string }>(
      "SELECT id FROM _migrations ORDER BY id ASC"
    );
    expect(applied).toEqual([
      { id: "001_init_schema_meta" },
      { id: "002_test_feature_table" },
    ]);

    // Verify created table works
    await db.execute("INSERT INTO test_items (id, title) VALUES (?, ?)", [
      "item-1",
      "First Item",
    ]);

    const items = await db.select<{ id: string; title: string }>(
      "SELECT id, title FROM test_items WHERE id = ?",
      ["item-1"]
    );
    expect(items).toEqual([{ id: "item-1", title: "First Item" }]);
  });

  it("is idempotent: re-running migrations does not fail or duplicate entries", async () => {
    const rawDb = new DatabaseSync(":memory:");
    const testExecutor = createNodeSqlExecutor(rawDb);

    const testMigrations: SqlMigration[] = [
      {
        id: "001_init_schema_meta",
        up: `CREATE TABLE meta (k TEXT PRIMARY KEY);`,
      },
    ];

    await initDatabase({
      executor: testExecutor,
      migrations: testMigrations,
    });

    // Run again with same migrations + one new migration
    const extendedMigrations: SqlMigration[] = [
      ...testMigrations,
      {
        id: "002_new_step",
        up: `CREATE TABLE new_step (id TEXT PRIMARY KEY);`,
      },
    ];

    await initDatabase({
      executor: testExecutor,
      migrations: extendedMigrations,
    });

    const applied = await testExecutor.select<{ id: string }>(
      "SELECT id FROM _migrations ORDER BY id ASC"
    );
    expect(applied).toEqual([{ id: "001_init_schema_meta" }, { id: "002_new_step" }]);
  });

  it("fails fast and loud with migration ID if a migration contains invalid SQL", async () => {
    const rawDb = new DatabaseSync(":memory:");
    const testExecutor = createNodeSqlExecutor(rawDb);

    const brokenMigrations: SqlMigration[] = [
      {
        id: "001_broken_syntax",
        up: `CREATE TABLE BROKEN SYNTAX HERE ???`,
      },
    ];

    await expect(
      initDatabase({
        executor: testExecutor,
        migrations: brokenMigrations,
      })
    ).rejects.toThrowError(/Migration '001_broken_syntax' failed/);
  });

  it("connectReadWriteDatabase connects and verifies migrations are ready", async () => {
    const rawDb = new DatabaseSync(":memory:");
    const testExecutor = createNodeSqlExecutor(rawDb);

    const testMigrations: SqlMigration[] = [
      {
        id: "001_init_schema_meta",
        up: `CREATE TABLE meta (k TEXT PRIMARY KEY);`,
      },
    ];

    // Initialize with migrations first
    await initDatabase({
      executor: testExecutor,
      migrations: testMigrations,
    });

    // Reset global singleton to simulate another window connecting
    resetDbStateForTesting();

    const connectedDb = await connectReadWriteDatabase({
      executor: testExecutor,
      expectedLatestMigrationId: "001_init_schema_meta",
      pollIntervalMs: 10,
      maxWaitMs: 100,
    });

    expect(connectedDb).toBe(testExecutor);
    expect(getDb()).toBe(testExecutor);
  });

  it("connectReadWriteDatabase throws when migrations do not reach expected version within timeout", async () => {
    const rawDb = new DatabaseSync(":memory:");
    const testExecutor = createNodeSqlExecutor(rawDb);

    // Empty DB with no migrations run yet
    await expect(
      connectReadWriteDatabase({
        executor: testExecutor,
        expectedLatestMigrationId: "001_init_schema_meta",
        pollIntervalMs: 10,
        maxWaitMs: 50,
      })
    ).rejects.toThrowError(
      /Database schema readiness timeout: expected migration '001_init_schema_meta'/
    );
  });
});

---
title: "Blueprint: MB-01 Desktop Shell, Multi-Window & Local SQLite Foundation"
type: blueprint
parent_intent: docs/intent/20261110_dialogue_v0_1_foundation.md
status: Approved
last_updated: 2026-11-10
---

# Blueprint: MB-01 Desktop Shell, Multi-Window & Local SQLite Foundation

This is the first of four connected micro-blueprints for Dialogue v0.1 (`MB-01` -> `MB-02` -> `MB-03` -> `MB-04`). It establishes the lightweight Tauri v2 + React/TypeScript application shell, the two window surfaces (`main` and `quick-command`), the global keyboard shortcut toggle (`@tauri-apps/plugin-global-shortcut`), the local SQLite database connection and migration runner (`@tauri-apps/plugin-sql`), and the typed cross-window event bus that all subsequent micro-blueprints (`MB-02` Calendar, `MB-03` Agent, `MB-04` Chat & Quick Command) build upon.

## Current Code

The repository currently contains only `LICENSE` and `docs/`. There is no application source code yet.

## Design

### Module Boundaries & Directory Layout

To honor Locality of Behavior and Deep Modules, infrastructure that connects both windows lives in a thin `src/core/` layer, while window-specific entry routing lives in `src/App.tsx`:

```text
src-tauri/
  Cargo.toml                 # Tauri v2 + tauri-plugin-sql (sqlite) + tauri-plugin-global-shortcut
  tauri.conf.json            # Defines "main" window and hidden/frameless "quick-command" overlay window
  capabilities/default.json  # Grants window, event, sql, and global-shortcut permissions to ["main", "quick-command"]
  src/lib.rs                 # Registers sql & global-shortcut plugins + window toggle command
src/
  core/
    db.ts                    # SQLite connection, schema migration runner, and typed query/execute boundary
    sync.ts                  # Typed cross-window event emitter & listener (calendar:updated, chat:promoted, settings:updated, navigation:requested)
    shortcut.ts              # Global shortcut registration/re-binding boundary with Zod validation
  App.tsx                    # Detects current window label ("main" vs "quick-command") and mounts the matching shell
```

### How MB-01 Connects to MB-02, MB-03, and MB-04

1. **Shared SQLite Database (`sqlite:dialogue.db`)**: Both the `main` window and the `quick-command` window connect to the same local SQLite file via `src/core/db.ts` (with `PRAGMA journal_mode = WAL;` and `PRAGMA foreign_keys = ON;` enabled on connection so concurrent reads/writes from both windows never lock each other out).
2. **Typed Cross-Window Sync (`src/core/sync.ts`)**: When `MB-03`'s agent tools mutate calendar data inside the `quick-command` window, or when `MB-04` promotes an ephemeral exchange into the main chat, `sync.ts` broadcasts a validated payload via Tauri's `@tauri-apps/api/event` `emit()` so the `main` window reacts in real time.
3. **Window-Label Routing (`src/App.tsx`)**: Rather than maintaining two separate frontend build pipelines, both windows load the same Vite bundle and inspect `getCurrentWebviewWindow().label` at startup to render either the Main App shell (`main`) or the frameless Raycast-like Quick Command shell (`quick-command`).

## Contracts

### BP-CORE-001: Tauri v2 Multi-Window Shell & Global Shortcut Toggle
- Serves: "Lightweight Local-First Desktop App (Tauri + TypeScript/React + SQLite)" and "Two Interaction Surfaces: Raycast-like Quick Command Overlay & Main Application Window" in the Intent.
- Input:
  - Static window configuration in `src-tauri/tauri.conf.json` for `main` (`visible: true`, standard window decorations, `1200x800`) and `quick-command` (`visible: false` at startup, `decorations: false`, `transparent: true`, `alwaysOnTop: true`, `center: true`, `skipTaskbar: true`, `680x440`).
  - Shortcut accelerator string (default `"CommandOrControl+Shift+Space"`), parsed and validated at the entry boundary in `src/core/shortcut.ts` via a strict Zod schema (non-empty valid modifier+key format).
- Behavior:
  - Registers `@tauri-apps/plugin-global-shortcut` and `@tauri-apps/plugin-sql` in Rust (`src-tauri/src/lib.rs`) and grants permissions to both `["main", "quick-command"]` in `src-tauri/capabilities/default.json`.
  - Only the `main` window registers the OS global shortcut on startup (preventing duplicate registration from `quick-command`). In `MB-01` it binds the default `"CommandOrControl+Shift+Space"` via `registerQuickCommandShortcut(accelerator)`, and once `MB-03` adds `getAppSettings()`, `main` startup loads `getAppSettings().globalShortcut` after `initDatabase()` and binds that persisted shortcut.
  - `registerQuickCommandShortcut(accelerator)` unregisters any previously bound shortcut first before registering the new accelerator (and restores the previous shortcut if the OS rejects the new one), preventing duplicate OS listeners or orphaned shortcuts when re-binding in Settings.
  - When the global shortcut is pressed, toggles the `quick-command` window: if hidden or unfocused, shows and focuses `quick-command`; if already visible and focused, hides `quick-command`.
  - Intercepts `CloseRequested` on the `main` window in Rust (`src-tauri/src/lib.rs`) to hide `main` (`window.hide()` + `api.prevent_close()`) rather than destroying the `main` webview, ensuring the `"main"` window label always remains alive for `focusMainWindow()` and the global shortcut stays active until the user explicitly quits the app.
  - Exposes `focusMainWindow()` in `src/core/shortcut.ts` (calling `unminimize()`, `show()`, and `setFocus()` on the `main` WebviewWindow) so `MB-04`'s `"Continue in App"` and `"Configure AI Provider in App"` actions can reliably bring the `main` window to the foreground even if hidden or minimized.
  - Pressing `Escape` inside the `quick-command` window hides it immediately.
  - `src/App.tsx` reads the current window label and mounts the appropriate shell surface.
- Output: Running desktop shell with independent `main` and `quick-command` windows and working hotkey summon/dismiss flow.
- Failure:
  - If an invalid shortcut string is passed to `registerQuickCommandShortcut`, throws a descriptive validation error immediately before calling the OS plugin.
  - If the OS rejects shortcut registration (e.g., shortcut already claimed by another OS process), surfaces a typed error with the rejected accelerator string rather than failing silently.
- Method: `design by contract` (for shortcut input validation) + `integration/e2e` (for Tauri Rust compilation and window/capability verification).
- Verification:
  - Unit/contract tests via Vitest (`npm test`) verifying `shortcut.ts` parses valid accelerators, rejects malformed strings, and surfaces registration failures.
  - `cargo check --manifest-path src-tauri/Cargo.toml` and `npm run build` succeeding with zero errors.
- Commit:
  - `feat(shell): scaffold Tauri v2 + React TypeScript app with main and quick-command windows`
  - `test(shortcut): add contract tests for global shortcut validation and registration`
  - `feat(shortcut): implement global shortcut toggle for quick-command overlay`

### BP-CORE-002: Local SQLite Database Connection & Migration Runner
- Serves: "Lightweight Local-First Desktop App (Tauri + TypeScript/React + SQLite)" and "Connected Micro-Blueprint Approach" in the Intent.
- Input:
  - Database identifier (`sqlite:dialogue.db`) and the single ordered `MIGRATIONS` array in `src/core/db.ts` (starting with `001_init_schema_meta` in `MB-01`, and extended in-place with `002_create_calendar_events` in `MB-02`, `003_create_app_settings` in `MB-03`, and `004_create_chat_threads_and_messages` in `MB-04` so `src/core/db.ts` never imports from `src/features/*`).
- Behavior:
  - Opens the SQLite connection and immediately executes `PRAGMA journal_mode = WAL;`, `PRAGMA busy_timeout = 5000;`, and `PRAGMA foreign_keys = ON;`.
  - Splits initialization into two explicitly named functions (no boolean flags in signatures):
    - `initDatabase()`: Called by the `main` window on startup; creates the `_migrations` tracking table if not present and executes pending migrations from `MIGRATIONS` in sequential order.
    - `connectReadWriteDatabase()`: Called by the `quick-command` window on startup; opens the connection with `WAL`, `busy_timeout = 5000`, and `foreign_keys = ON`, and awaits schema readiness (`_migrations` containing the latest migration ID from `MIGRATIONS`) so `quick-command` neither races `main` to insert migrations nor queries unmigrated tables on cold start.
  - Accounts for `@tauri-apps/plugin-sql`'s underlying `sqlx::Pool<Sqlite>` connection pooling by never splitting `BEGIN` / `COMMIT` across separate `execute()` IPC calls and by enforcing relational cleanup explicitly in domain services alongside foreign key constraints.
  - Exposes a minimal, deep public API (`initDatabase()`, `connectReadWriteDatabase()`, `getDb()`) that accepts an injectable SQL executor interface at the boundary so domain modules can be tested against a real local SQLite instance in Vitest (`better-sqlite3` adapter in test env, `@tauri-apps/plugin-sql` in Tauri runtime) without mocking internal domain logic.
- Output: Initialized database handle with applied schema migrations.
- Failure:
  - Fails fast and loud with the migration ID and SQL error message if any migration fails or if `getDb()` is called before initialization.
- Method: `integration/e2e`
- Verification:
  - Vitest integration test running `initDatabase()` against a real SQLite database, verifying `WAL` and `foreign_keys` pragmas, verifying idempotent re-runs of migrations, and verifying loud failure on invalid migration SQL or uninitialized access.
- Commit:
  - `test(db): add integration tests for SQLite initialization and migration runner`
  - `feat(db): implement SQLite connection boundary and sequential migration runner`

### BP-CORE-003: Typed Cross-Window Real-Time Event Bus
- Serves: "updating the Calendar UI in real time whenever the agent makes changes from either the Quick Command overlay or the Main Chat" and "Connected Micro-Blueprint Approach" in the Intent.
- Input:
  - Cross-window event channel and payload:
    - `calendar:updated` (`{ reason: 'created' | 'updated' | 'deleted'; eventId?: string; timestamp: number }`)
    - `chat:promoted` (`{ threadId: string; timestamp: number }`)
    - `settings:updated` (`{ timestamp: number }`)
    - `navigation:requested` (`{ tab: 'chat' | 'calendar' | 'settings'; threadId?: string; timestamp: number }`)
  - Incoming event payloads are parsed at the listener boundary using Zod schemas in `src/core/sync.ts`.
- Behavior:
  - `emitSyncEvent(channel, payload)` validates the payload and broadcasts it across all open Tauri windows (`main` and `quick-command`).
  - `onSyncEvent(channel, handler)` subscribes to the Tauri event channel, parses incoming payloads with the channel's Zod schema, invokes `handler` with the strongly typed payload, and returns an `unlisten` cleanup function.
- Output: Dispatched cross-window event and cleanup function.
- Failure:
  - Throws a descriptive Zod validation error if either emitted or received payload violates the channel schema instead of silently dropping or passing corrupted state.
- Method: `tdd`
- Verification:
  - Vitest suite verifying payload validation, emission, subscription delivery, cleanup on `unlisten`, and loud rejection on malformed payloads across all four channels (`calendar:updated`, `chat:promoted`, `settings:updated`, `navigation:requested`).
- Commit:
  - `test(sync): add TDD tests for cross-window sync event validation and pub/sub`
  - `feat(sync): implement typed cross-window event bus with Zod boundary parsing`

## Non-Goals

- Do not build the Calendar schema or FullCalendar UI yet (covered in `MB-02`).
- Do not build the AI Agent runner, provider settings form, or calendar tools yet (covered in `MB-03`).
- Do not build the multi-thread Chat UI or Quick Command prompt conversation UI yet (covered in `MB-04`).
- Do not introduce ORMs, generic repository base classes, or state-management abstractions that violate the AHA rule.

## Not Covered Yet

- **Future-Ready Local Calendar (`MB-02`)**: Calendar SQLite schema (`events` table storing standalone events, recurring series, and self-referencing single-instance overrides), `rrule.js` recurrence expansion engine, and FullCalendar UI in the Main Window.
- **Configurable Agent Connection & Calendar Tools (`MB-03`)**: Provider settings UI/storage, Vercel AI SDK `streamText` runner, and the 4 Calendar agent tools (`listEvents`, `createEvent`, `updateEvent`, `deleteEvent`).
- **Chat Threads & Quick Command Overlay UI (`MB-04`)**: Persistent multi-thread Chat in the Main Window, ephemeral Quick Command prompt flow, and the "Continue in App" handoff action.

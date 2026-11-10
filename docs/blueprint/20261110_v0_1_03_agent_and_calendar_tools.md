---
title: "Blueprint: MB-03 Provider Settings & AI Agent with Calendar Tools"
type: blueprint
parent_intent: docs/intent/20261110_dialogue_v0_1_foundation.md
status: Approved
last_updated: 2026-11-10
---

# Blueprint: MB-03 Provider Settings & AI Agent with Calendar Tools

This is the third of four connected micro-blueprints for Dialogue v0.1 (`MB-01` -> `MB-02` -> `MB-03` -> `MB-04`). Building on `MB-01`'s SQLite storage and cross-window event bus and `MB-02`'s Calendar domain service (`src/features/calendar/calendar.service.ts`), this blueprint implements the local Settings & Provider configuration module (`src/features/settings/`) and the AI Agent runner with its 4 Calendar tools (`src/features/agent/`).

## Design

### Module Boundaries & Locality of Behavior

```text
src/
  features/
    settings/
      settings.schema.ts    # Zod boundary schemas for ProviderConfig (cloud & local endpoints) and AppSettings
      settings.service.ts   # SQLite CRUD for settings + shortcut re-registration + settings:updated sync emission
      SettingsView.tsx      # Settings UI in Main Window (active provider, API key, base URL, model ID, global hotkey)
    agent/
      agent.tools.ts        # 4 Vercel AI SDK tools (listEvents, createEvent, updateEvent, deleteEvent) wrapping calendar.service.ts
      agent.service.ts      # Provider factory + testProviderConnection() + runAgentTurn() using Vercel AI SDK streamText with stopWhen: isStepCount(5)
```

### How MB-03 Connects MB-01, MB-02, and MB-04

1. **Settings to Shortcut & Agent (`src/features/settings/`)**: Persists provider settings (`openai`, `anthropic`, `google`, or `openai-compatible` for local Ollama / LM Studio / custom endpoints) and the global shortcut accelerator in SQLite (`003_create_app_settings` added to `MIGRATIONS` in `src/core/db.ts`). On startup in `src/App.tsx`, the `main` window loads `getAppSettings().globalShortcut` after `initDatabase()` and binds it via `registerQuickCommandShortcut`. Updating the shortcut in Settings calls `registerQuickCommandShortcut` from `MB-01` (`src/core/shortcut.ts`), and saving settings emits `settings:updated` via `src/core/sync.ts`.
2. **Agent Tools to Calendar & Real-Time UI (`src/features/agent/agent.tools.ts`)**: The agent's 4 calendar tools (`listEvents`, `createEvent`, `updateEvent`, `deleteEvent`) call `MB-02`'s `calendar.service.ts` public functions directly. Because `calendar.service.ts` automatically emits `calendar:updated` across Tauri windows on every mutation, any calendar action taken by the agent immediately refreshes `MB-02`'s `CalendarView.tsx` in real time.
3. **Agent Runner to Both Chat Surfaces (`src/features/agent/agent.service.ts`)**: Exposes a single, deep `runAgentTurn` entry point that both `MB-04`'s Main Chat and `MB-04`'s Quick Command overlay call, injecting the user's current local date/time and timezone into the system prompt so relative dates like `"today"`, `"tomorrow afternoon"`, or `"next Monday"` resolve accurately.

## Contracts

### BP-AGENT-001: Provider & Shortcut Settings Storage (`settings.schema.ts` & `settings.service.ts`)
- Serves: "Configurable Agent Connection (Vercel AI SDK): Settings UI where the user can configure AI providers (both cloud API keys and local model endpoints)" and "invokeable easily on demand with a custom keyboard command" in the Intent.
- Input:
  - Migration `003_create_app_settings` registered in `src/core/db.ts`.
  - Untrusted `UpdateSettingsInput` payload parsed at the entry boundary in `src/features/settings/settings.schema.ts` via Zod:
    - `provider`: `'openai' | 'anthropic' | 'google' | 'openai-compatible'`
    - `modelId`: non-empty string (e.g., `'gpt-4o-mini'`, `'claude-3-5-sonnet-latest'`, `'gemini-2.5-flash'`, `'llama3.2'`)
    - `apiKey`: string (required for cloud providers `'openai' | 'anthropic' | 'google'`; optional for `'openai-compatible'` local servers like Ollama)
    - `baseUrl`: optional valid HTTP/HTTPS URL string (required when `provider === 'openai-compatible'`, e.g., `'http://localhost:11434/v1'`)
    - `globalShortcut`: valid accelerator string (default `'CommandOrControl+Shift+Space'`)
- Behavior:
  - `getAppSettings()` reads the persisted settings row from SQLite (or returns the default initial state on first launch with `provider: 'openai'`, `modelId: 'gpt-4o-mini'`, `apiKey: ''`, `baseUrl: ''`, `globalShortcut: 'CommandOrControl+Shift+Space'`).
  - `saveAppSettings(input)` validates the input with Zod, persists it to SQLite, re-binds the OS global shortcut via `registerQuickCommandShortcut` if `globalShortcut` changed, and emits `settings:updated` via `src/core/sync.ts`.
  - `assertProviderConfigured(settings)` (in `settings.schema.ts`) validates that the active provider has all required credentials (`apiKey` non-empty for `'openai' | 'anthropic' | 'google'`; valid `baseUrl` for `'openai-compatible'`), throwing `ProviderNotConfiguredError` when unconfigured so the user can still save `globalShortcut` on first launch while the Agent boundary strictly enforces provider readiness.
- Output: Strongly typed `AppSettings` object.
- Failure:
  - Throws a descriptive Zod validation error if `modelId` or `globalShortcut` is empty/malformed, or if `baseUrl` is not a valid HTTP/HTTPS URL when provided; `assertProviderConfigured` throws `ProviderNotConfiguredError` when credentials/endpoints are missing for the selected provider.
- Method: `design by contract` + `integration/e2e` (against real SQLite).
- Verification:
  - Vitest suite verifying valid cloud and local (`openai-compatible`) settings persist and reload from SQLite, `settings:updated` fires on save, and missing `apiKey` (for cloud) or missing `baseUrl` (for `openai-compatible`) fails loud at the boundary.
- Commit:
  - `test(settings): add contract and SQLite integration tests for provider and shortcut settings`
  - `feat(settings): implement settings schema, SQLite storage, and sync emission`

### BP-AGENT-002: AI Agent Runner, Connection Tester & Calendar Tool Execution (`agent.tools.ts` & `agent.service.ts`)
- Serves: "Equipped with AI agent tools to list/read, create, edit/modify, and delete events (both single instances and recurring series), updating the Calendar UI in real time" in the Intent.
- Input:
  - `runAgentTurn(input: { messages: AgentMessage[]; nowIso?: string; onTextDelta?: (delta: string) => void; onToolCall?: (toolCall: AgentToolActivity) => void }): Promise<{ replyText: string; toolExecutions: ExecutedCalendarToolSummary[] }>`
  - `testProviderConnection(candidateSettings?: UpdateSettingsInput): Promise<{ ok: true; modelId: string; latencyMs: number }>`
  - Active `AppSettings` loaded from `settings.service.ts`.
- Behavior:
  - Instantiates the configured Vercel AI SDK model provider (`createOpenAI`, `createAnthropic`, `createGoogleGenerativeAI`, or `createOpenAICompatible`).
  - `testProviderConnection`: Validates `candidateSettings` (or current saved `AppSettings`) and sends a minimal 1-token `generateText` probe to verify credentials/endpoint reachability before saving or chatting.
  - `runAgentTurn`: Builds a focused personal-organizer system prompt containing the current local timestamp, weekday, and timezone offset so the model resolves relative dates accurately, and strictly bounds the assistant to personal organization.
  - Equips `streamText` (with `stopWhen: isStepCount(5)`) with 4 strongly typed Zod tools in `agent.tools.ts`:
    1. `listEvents`: calls `listCalendarEventsInRange({ rangeStart, rangeEnd })` to inspect expanded occurrences (including recurring instances and overrides) before scheduling or answering questions.
    2. `createEvent`: calls `createCalendarEvent(...)` for one-time or recurring events (`frequency`, `interval`, `byWeekday`, `count`, `until`).
    3. `updateEvent`: calls `updateCalendarEvent(...)` supporting both `scope: 'this_instance'` (with `instanceStartTime`) and `scope: 'entire_series'`.
    4. `deleteEvent`: calls `deleteCalendarEvent(...)` supporting both `scope: 'this_instance'` (with `instanceStartTime`) and `scope: 'entire_series'`.
  - Returns the assistant's final response text along with a structured list of executed tool calls and their results (so `MB-04` can display compact inline confirmation cards like `"Created event: Lunch at 1:00 PM"`).
- Output: `{ replyText: string; toolExecutions: ExecutedCalendarToolSummary[] }` from `runAgentTurn`, and `{ ok: true; modelId: string; latencyMs: number }` from `testProviderConnection`.
- Failure:
  - If the provider is not configured yet (missing API key or base URL), fails fast with a typed `ProviderNotConfiguredError` so the UI can prompt the user to open Settings.
  - If a tool call receives invalid arguments or references a missing event ID, surfaces the error to the model/caller clearly without crashing the app or corrupting SQLite state.
- Method: `tdd` (using Vercel AI SDK's deterministic mock language model / real SQLite calendar backend to verify multi-step tool execution without flaky live network calls).
- Verification:
  - Vitest suite verifying:
    1. `runAgentTurn` executes multi-step tool calls (`listEvents` -> `createEvent`, `updateEvent` on single occurrence vs. series, `deleteEvent`) against a real SQLite database and triggers `calendar:updated` sync events.
    2. Unconfigured provider throws `ProviderNotConfiguredError` immediately.
    3. Tool validation errors surface cleanly.
- Commit:
  - `test(agent): add TDD tests for agent runner and multi-step calendar tool execution`
  - `feat(agent): implement Vercel AI SDK provider factory, agent runner, and calendar tools`

### BP-AGENT-003: Settings UI in Main Window (`SettingsView.tsx`)
- Serves: "in-app UI (chats, settings (Providers, etc), and others)" in the Intent.
- Input:
  - `getAppSettings()` and `saveAppSettings()` from `settings.service.ts`, plus `testProviderConnection()` from `agent.service.ts`.
  - Approved visual direction in `docs/design/brand.md`.
- Behavior:
  - Renders the Settings screen inside the Main Window allowing the user to select their AI Provider (`OpenAI`, `Anthropic`, `Google Gemini`, or `OpenAI-Compatible Local / Custom`), enter their API Key (or Base URL for local models like Ollama), set the Model ID, and customize the Quick Command global shortcut.
  - Includes a "Test Connection" button that sends a minimal ping via the configured provider to confirm the credentials/endpoint work before the user starts chatting.
- Output: Interactive Settings view with clear save/test feedback.
- Failure:
  - Displays clear inline validation or connection error messages when saving invalid fields or when "Test Connection" fails.
- Method: `visual testing` (following `method/VISUAL_TESTING.md` and `docs/design/brand.md`).
- Verification:
  - Real browser walkthrough with screenshots verifying switching between Cloud and Local (`OpenAI-Compatible`) provider modes, validation feedback on missing fields, saving settings, and persistence across reloads.
- Commit:
  - `feat(settings-ui): build provider and global shortcut settings screen in main window`

## Non-Goals

- Do not add general-purpose tools (no web search, bash, file system, or non-calendar tools).
- Do not build To-Do, Habit, or Finance tools in v0.1.

## Not Covered Yet

- **Main Chat Threads & Quick Command Overlay (`MB-04`)**: The persistent multi-thread Chat UI in the Main Window and the Raycast-like Quick Command overlay UI (with "Continue in App" handoff) that consume `runAgentTurn`.

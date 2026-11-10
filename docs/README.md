# Dialogue Documentation Index

This directory serves as the shared memory on disk for the Dialogue project.

## Intent (`docs/intent/`)

- [20261110_dialogue_v0_1_foundation.md](./intent/20261110_dialogue_v0_1_foundation.md) — Core goals, rationale, architecture stack (Tauri + TypeScript + Vercel AI SDK), FullCalendar + `rrule.js` calendar foundation, and the connected micro-blueprint approach for v0.1.

## Blueprint (`docs/blueprint/`)

- [20261110_v0_1_01_desktop_and_storage.md](./blueprint/20261110_v0_1_01_desktop_and_storage.md) — Micro-Blueprint 1 (MB-01): Tauri v2 multi-window shell (`main` and `quick-command`), global keyboard shortcut toggle, local SQLite connection & migration runner (`WAL` mode), and typed cross-window real-time event bus.
- [20261110_v0_1_02_calendar_engine_and_ui.md](./blueprint/20261110_v0_1_02_calendar_engine_and_ui.md) — Micro-Blueprint 2 (MB-02): RFC 5545 Calendar SQLite schema (`events` with `rrule`, `exdates`, and single-instance overrides), `rrule.js` (`RRuleSet`) domain service, and FullCalendar Month/Week/Day UI with real-time cross-window sync.
- [20261110_v0_1_03_agent_and_calendar_tools.md](./blueprint/20261110_v0_1_03_agent_and_calendar_tools.md) — Micro-Blueprint 3 (MB-03): Provider & global shortcut settings (cloud API keys + local OpenAI-compatible endpoints), Vercel AI SDK multi-step agent runner, and the 4 Calendar tools (`listEvents`, `createEvent`, `updateEvent`, `deleteEvent`).
- [20261110_v0_1_04_chat_and_quick_command.md](./blueprint/20261110_v0_1_04_chat_and_quick_command.md) — Micro-Blueprint 4 (MB-04): Persistent multi-thread Chat in the Main Window and ephemeral Raycast-like Quick Command overlay powered by Vercel AI UI SDK (`@ai-sdk/react`), with "Continue in App" handoff.

## Design (`docs/design/`)

- [brand.md](./design/brand.md) — Brand Design Single Source of Truth: Carbon Black + Dark Grey palette, Geist typography, sharper workspace-style component radii, flexible three-panel desktop layout, Raycast-like floating Quick Command overlay, and `@ai-sdk/react` streaming/tool-invocation UI patterns.

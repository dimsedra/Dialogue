# Dialogue

> A local-first desktop assistant for your personal life: not a do-everything AI, but a focused companion for your Calendar, To-Dos, Habits, and Finances.

**Status: Under active development.** Dialogue is a work in progress toward v1.0. The v0.1 core loop is mostly implemented and changing daily, so expect rough edges, and check the commit history to see how fast it is moving.

## What is Dialogue?

Dialogue is a lightweight desktop personal assistant built strictly for personal life organization. Instead of being an open-ended "do everything" agent, its world is deliberately bounded to four personal life pillars:

| Pillar         | Status                |
| -------------- | --------------------- |
| Calendar       | Implemented in v0.1   |
| To-Do List     | Planned for v0.2+     |
| Habit Tracker  | Planned for v0.2+     |
| Finance Tracker| Planned for v0.2+     |

Three principles shape everything in Dialogue:

- **Local-first.** All your data lives in a local SQLite database on your machine. There is no backend and no account. Your life data never leaves your computer.
- **Frictionless.** A personal organizer is only useful if it is always one keystroke away. Dialogue is built to be lightweight in RAM and summonable from anywhere via a configurable global keyboard shortcut.
- **Bounded agent.** The AI assistant can read and write your life data through a small, explicit set of tools. It cannot browse the web, run arbitrary commands, or wander outside the four pillars.

## Features (v0.1)

v0.1 proves the core loop. What works today:

- **Interactive Calendar:** month/week/day views built on FullCalendar, with full RFC 5545 recurrence support (`RRULE`, `EXDATE` exceptions, and single-instance overrides) powered by `rrule.js` as the single source of truth for date expansion.
- **AI agent with calendar tools:** ask "what's on my schedule today?" or tell it to create, edit, or delete events, including specific instances of a recurring series. Changes reflect in the calendar UI in real time.
- **Quick Command overlay:** a Raycast-style floating panel summoned by a global hotkey, for fast questions and quick calendar commands. Its conversations are ephemeral by default so they never clutter your saved chats; use "Continue in App" to promote an exchange into a full chat thread.
- **Persistent multi-thread chat:** a main-window chat with streaming responses and visible tool invocations.
- **Configurable agent connection:** bring your own AI, either cloud providers (OpenAI, Anthropic, Google) via API key or a local OpenAI-compatible endpoint. Configure providers and the global shortcut in Settings.
- **Real-time cross-window sync:** the Quick Command overlay and the main window share one local database and stay in sync as things change.

## What's next

- To-Do List, Habit Tracker, and Finance Tracker modules on top of the shared local schema.
- Tuning the always-on background behavior based on v0.1's real RAM footprint.
- Reaching a stable, packaged v1.0 release.

## Tech Stack

- **Shell & packaging:** [Tauri v2](https://v2.tauri.app/) (system webview, small footprint)
- **Frontend:** TypeScript, React 19, Tailwind CSS 4, Vite
- **Agent:** [Vercel AI SDK](https://ai-sdk.dev/) (`ai`, `@ai-sdk/react`, provider packages for OpenAI, Anthropic, Google, and OpenAI-compatible endpoints)
- **Calendar:** FullCalendar 6 + `rrule.js`
- **Storage:** SQLite via `tauri-plugin-sql` (WAL mode)
- **Tests:** Vitest

## Getting Started

Prerequisites: [Rust](https://rustup.rs/) (stable), [Node.js](https://nodejs.org/) 20+, and [pnpm](https://pnpm.io/).

```bash
# install dependencies
pnpm install

# run the desktop app in development mode
pnpm tauri dev

# run the test suite
pnpm test

# production build
pnpm build
```

First run: open Settings, pick an AI provider (cloud API key or a local OpenAI-compatible endpoint), set your global shortcut, and start talking to your calendar.

## License

[MIT](./LICENSE). Copyright (c) 2026 Dimas Edra Ar Rafi

# Dialogue

> A local-first desktop assistant for your messy personal life.

Let's be honest with ourselves: most productivity tools are built for idealized versions of human beings who wake up at 5:00 AM, color-code their day in 15-minute blocks, and never buy things they cannot afford.

Dialogue is built for the rest of us.

It is a lightweight desktop companion designed for the reality of everyday chaos: the anniversary you swore you put on your calendar, the reckless 2 AM gadget purchase you will have to explain to yourself later, the dentist appointment you have postponed three times, and the habits you enthusiastically start on Monday and abandon by Wednesday afternoon.

It does not try to summarize the internet, generate corporate slide decks, or run your company. Its entire existence is bounded strictly to keeping your personal life from falling apart across four pillars:

| Pillar | Reality Check | Status |
| --- | --- | --- |
| Calendar | For when "I will definitely remember that" inevitably fails. | Implemented in v0.1 |
| To-Do List | A place for tasks that actually need doing, not a graveyard of good intentions. | Planned for v0.2+ |
| Habit Tracker | Helping you drink water instead of running on sheer anxiety and caffeine. | Planned for v0.2+ |
| Finance Tracker | A gentle reality check for your late-night online cart checkouts. | Planned for v0.2+ |

## The Perks (The Quiet Upsides)

While the heart of Dialogue is dealing with your personal disarray, the engine under the hood comes with deliberate perks:

- **Nobody sees your mess (Local-first):** All your data lives in a local SQLite database right on your drive. There is no remote backend, no user account, and no telemetry judging your questionable financial choices or chaotic sleep schedule. Your chaos stays strictly between you and your machine.
- **One keystroke away:** When a sudden realization hits you ("Wait, isn't tomorrow our anniversary?"), you should not have to open a heavy browser tab, log into a portal, and navigate three sub-menus. Hit your global shortcut, tell Dialogue to add it, and go back to what you were doing.
- **Lightweight footprint:** Built with Tauri, so it does not swallow half your computer's RAM just to show you what day it is.
- **Bounded agent:** The assistant has tools to read and adjust your calendar and personal data, but it cannot wander off, browse the web, or run arbitrary commands. It stays in its lane.

## What Works Today (v0.1)

Dialogue is currently under active development. The v0.1 core loop is focused entirely on getting the desktop shell and the calendar foundation rock solid:

- **Interactive Calendar:** Month, week, and day views powered by FullCalendar, with full recurrence support (`RRULE`, exception dates, and individual instance overrides via `rrule.js`). If your chaos repeats every alternate Tuesday, it handles it properly.
- **AI Agent with Calendar Tools:** Ask "What am I supposed to be doing today?" or tell it to reschedule a dinner, add a recurring event, or clear an afternoon. It updates the calendar view in real time.
- **Quick Command Overlay:** A Raycast-style floating window summoned via your custom global hotkey. It is ephemeral by default so quick brain dumps do not clutter your saved chat history, with a "Continue in App" button when a conversation needs to move into the main window.
- **Persistent Chat:** A dedicated main window with streaming responses and visible tool calls when you want to look at things in depth.
- **Bring Your Own AI:** Plug in cloud providers (OpenAI, Anthropic, Google) or point it to a local OpenAI-compatible endpoint.

## What's Next

- To-Do List, Habit Tracker, and Finance Tracker modules built on top of the shared local schema.
- **Desktop notifications:** System-level alerts to tap you on the shoulder before you miss scheduled events, landing once all core modules are in place so the notification layer has a complete, settled schema to build on.
- Measuring real memory usage to fine-tune the always-on background behavior.
- Reaching a stable, packaged v1.0 release.

## Tech Stack

- **Shell & packaging:** [Tauri v2](https://v2.tauri.app/) (native webview, minimal memory footprint)
- **Frontend:** TypeScript, React 19, Tailwind CSS 4, Vite
- **Agent:** [Vercel AI SDK](https://ai-sdk.dev/) (`ai`, `@ai-sdk/react`, provider packages for OpenAI, Anthropic, Google, and OpenAI-compatible endpoints)
- **Calendar engine:** FullCalendar 6 and `rrule.js`
- **Local storage:** SQLite via `tauri-plugin-sql` (WAL mode)
- **Testing:** Vitest

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

On your first run: open Settings, set your AI provider (either an API key or a local model URL), choose your favorite global shortcut, and start asking what you forgot to do today.

## License

[MIT](./LICENSE). Copyright (c) 2026 Dimas Edra Ar Rafi

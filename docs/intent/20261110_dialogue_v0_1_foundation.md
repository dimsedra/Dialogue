---
title: "Intent: Dialogue v0.1 Foundation"
type: intent
last_updated: 2026-11-10
---

# Intent: Dialogue v0.1 Foundation

## The Goal & Rationale

Dialogue is a local-first desktop personal assistant built strictly for personal life organization. Rather than trying to be an open-ended "do everything" AI agent, its entire world is bounded to four personal life pillars: a Calendar, a To-Do List, a Habit Tracker, and a Finance Tracker. All user data lives locally on the user's machine.

Because a personal organizer is only useful if it is frictionless to reach, Dialogue must be lightweight in RAM usage and summonable on demand from anywhere via a custom global keyboard shortcut (hotkey), while also providing a complete in-app interface for viewing and managing life data directly.

Version 0.1 focuses strictly on proving this core loop: getting the lightweight desktop shell running, connecting the configurable AI agent, providing the Raycast-like Quick Command overlay, and equipping the agent with full read/write tools for the built-in local Calendar.

## What We Want in v0.1

- **Lightweight Local-First Desktop App (Tauri + TypeScript/React + SQLite)**: Uses the system webview and local SQLite storage to keep memory usage low and keep all data on the user's machine. (Whether background-always-on is the default or opt-in will be decided after measuring v0.1's real RAM footprint.)
- **Configurable Agent Connection (Vercel AI SDK)**: Settings UI where the user can configure AI providers (both cloud API keys and local model endpoints) to power the assistant.
- **Two Interaction Surfaces**:
  1. **Raycast-like Quick Command Overlay**: Summoned via a custom global keyboard shortcut for fast questions ("What's on my schedule today?") and quick calendar commands. Conversations here are ephemeral by default so they do not clutter the main chat history, with a "Continue in App" action to promote an exchange into a saved chat thread in the Main Window.
  2. **Main Application Window**: Houses persistent multi-thread Chat, the interactive Calendar UI, and Settings.
- **Future-Ready Local Calendar**:
  - Supports one-time and recurring events with full RFC 5545 recurrence capabilities (`RRULE`, single-instance exceptions `EXDATE`, and single-instance overrides) so the calendar schema is ready from day one to support future To-Do, Habit, and Finance features without patch code.
  - Built on **FullCalendar** (`@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`) paired with **`rrule.js`** (`jkbrzt/rrule` `RRuleSet`) as the single source of truth for recurring date-range expansion across both the UI and the AI agent, using custom React render hooks and CSS variables for UI customization rather than reinventing calendar grid rendering and date math from scratch.
  - Equipped with AI agent tools to list/read, create, edit/modify, and delete events (both single instances and recurring series), updating the Calendar UI in real time whenever the agent makes changes from either the Quick Command overlay or the Main Chat.
- **Connected Micro-Blueprint Approach**:
  - Because v0.1 spans several distinct subsystems, it will be planned and implemented as a sequence of focused, connected micro-blueprints (all pointing back to this Intent and sharing the same local database and cross-window event contracts) so we can go deep into each subsystem properly without cramming everything into one giant blueprint.

## What We Do NOT Want in v0.1

- **No To-Do List, Habit Tracker, or Finance Tracker modules yet**: Those belong to v0.2+ once the v0.1 agent and calendar foundation is solid.
- **No general-purpose "do everything" agent tools**: No web browsing, arbitrary bash execution, or unrelated system automation.
- **No reinventing the wheel on calendar internals**: Do not hand-roll custom recurrence date math or build complex calendar time-grids from scratch when modifiable open-source libraries can handle them cleanly.
- **No chat clutter from Quick Commands**: Quick Command interactions must not automatically spam the Main Window's saved conversation list unless explicitly promoted by the user.

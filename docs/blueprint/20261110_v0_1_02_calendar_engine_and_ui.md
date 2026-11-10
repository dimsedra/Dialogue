---
title: "Blueprint: MB-02 RFC 5545 Calendar Domain & UI"
type: blueprint
parent_intent: docs/intent/20261110_dialogue_v0_1_foundation.md
status: Approved
last_updated: 2026-11-10
---

# Blueprint: MB-02 RFC 5545 Calendar Domain & UI

This is the second of four connected micro-blueprints for Dialogue v0.1 (`MB-01` -> `MB-02` -> `MB-03` -> `MB-04`). Building directly on `MB-01`'s local SQLite migration runner (`src/core/db.ts`) and cross-window event bus (`src/core/sync.ts`), this blueprint implements the local RFC 5545 Calendar domain module (`src/features/calendar/`) and the interactive FullCalendar UI (`@fullcalendar/react` + `@fullcalendar/daygrid` + `@fullcalendar/timegrid` + `@fullcalendar/interaction`) inside the Main Window.

## Design

### Module Boundaries & Locality of Behavior

All calendar schema migrations, Zod boundary parsers, `rrule.js` recurrence expansion, SQLite queries, and UI components live together inside `src/features/calendar/` so the entire feature can be traced top-to-bottom without jumping across directories:

```text
src/
  features/
    calendar/
      calendar.schema.ts    # Zod boundary schemas for CreateEventInput, UpdateEventInput, DeleteEventInput, DateRangeQueryInput
      calendar.service.ts   # Public domain API: createCalendarEvent, listCalendarEventsInRange, getCalendarEventById, updateCalendarEvent, deleteCalendarEvent
      CalendarView.tsx      # FullCalendar (Month/Week/Day) UI, custom header/cards, modal editor, and sync.ts listener
```

### How RFC 5545 Recurrence, `EXDATE`, and Single-Instance Overrides Work

To avoid future patch code when To-Do, Habit, and Finance modules arrive in v0.2+, the `events` table stores both standalone events (`rrule IS NULL`), master recurring series (`rrule IS NOT NULL`), and single-instance override exceptions (`recurring_event_id IS NOT NULL`):

1. **Master Recurring Event**: Stored with its initial `start_time`, `end_time` (from which occurrence duration `Date.parse(end_time) - Date.parse(start_time)` is computed), a canonical RFC 5545 `rrule` string (stored without a hardcoded `DTSTART` property so that `start_time` is always the authoritative `dtstart` anchor when expanding occurrences via `rrule.js`), and a JSON array of excluded ISO timestamps in `exdates` (`[]` by default).
2. **Deleting a Single Occurrence (`scope: 'this_instance'`)**: Appends the target occurrence's `instanceStartTime` to the parent series' `exdates` array (and deletes any override row matching that `recurring_event_id` + `original_start_time`).
3. **Editing a Single Occurrence (`scope: 'this_instance'`)**: Appends `instanceStartTime` to the parent series' `exdates` array and inserts a new row in `events` with `recurring_event_id = parent.id`, `original_start_time = instanceStartTime`, and the modified `title`, `start_time`, `end_time`, or `description` (`rrule = NULL`).
4. **Editing or Deleting an Entire Series (`scope: 'entire_series'`)**: Updates or deletes the parent row (and explicitly deletes linked override rows where `recurring_event_id = parent.id` alongside `ON DELETE CASCADE`). When a master series' `start_time` or `end_time` is updated with `scope: 'entire_series'`, anchoring `dtstart` dynamically to `series.start_time` ensures all recurring occurrences shift cleanly to the new time of day.

Both `MB-03`'s AI Agent (`listEvents`) and FullCalendar's range fetcher in `CalendarView.tsx` call the exact same `listCalendarEventsInRange({ rangeStart, rangeEnd })` function in `calendar.service.ts`, which uses `rrule.js` (`RRuleSet` with `.rrule()`, `.exdate()`, and `.between(rangeStart, rangeEnd, true)`) to expand all recurring occurrences falling inside `[rangeStart, rangeEnd]` alongside standalone events and single-instance overrides. Using `listCalendarEventsInRange` as the single source of truth guarantees zero discrepancy between what occurrences the AI Agent sees and what occurrences FullCalendar renders on screen.

Every mutation in `calendar.service.ts` automatically calls `emitSyncEvent('calendar:updated', ...)` from `MB-01` (`src/core/sync.ts`), so whether an event is changed from the UI, from the Main Chat, or from the Quick Command overlay (`MB-03`/`MB-04`), `CalendarView.tsx` immediately refreshes.

## Contracts

### BP-CAL-001: Calendar SQLite Schema & Boundary Parsing (`calendar.schema.ts`)
- Serves: "Future-Ready Local Calendar: Supports one-time and recurring events with full RFC 5545 recurrence capabilities (`RRULE`, single-instance exceptions `EXDATE`, and single-instance overrides)" in the Intent.
- Input:
  - Migration `002_create_calendar_events` registered in `src/core/db.ts`.
  - Untrusted event creation/update payloads (`CreateEventInput`, `UpdateEventInput`, `DeleteEventInput`, `DateRangeQueryInput`) parsed via Zod in `src/features/calendar/calendar.schema.ts`.
- Behavior:
  - Creates the `events` table with columns: `id TEXT PRIMARY KEY`, `title TEXT NOT NULL`, `description TEXT NOT NULL DEFAULT ''`, `start_time TEXT NOT NULL`, `end_time TEXT NOT NULL`, `all_day INTEGER NOT NULL DEFAULT 0`, `color TEXT NOT NULL DEFAULT '#3b82f6'`, `rrule TEXT`, `exdates TEXT NOT NULL DEFAULT '[]'`, `recurring_event_id TEXT REFERENCES events(id) ON DELETE CASCADE`, `original_start_time TEXT`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`, plus indexes on `(start_time, end_time)` and `recurring_event_id`.
  - Translates structured recurrence inputs (`frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'`, `interval`, `byWeekday`, `count`, `until`) or raw RFC 5545 `RRULE` strings into canonical validated RFC 5545 strings via `rrule.js`.
  - Normalizes all incoming timestamp fields (`start_time`, `end_time`, `instanceStartTime`, `rangeStart`, `rangeEnd`) at the Zod parse boundary into canonical UTC ISO-8601 strings (`new Date(val).toISOString()`), guaranteeing exact millisecond matching between `RRule` `dtstart` expansion and `RRuleSet.exdate()` exclusions.
  - Enforces core domain invariants at parse time: `end_time >= start_time`, valid ISO-8601 timestamps, and when `scope === 'this_instance'`, requires `instanceStartTime`.
- Output: Validated domain input objects and canonical RFC 5545 `rrule` string.
- Failure:
  - Throws a descriptive Zod/domain error immediately if `end_time < start_time`, if an invalid `RRULE` or weekday is supplied, or if `scope: 'this_instance'` is requested without `instanceStartTime`.
- Method: `design by contract`
- Verification:
  - Vitest contract tests verifying valid one-time and recurring inputs parse cleanly into canonical RFC 5545 strings, and invalid date ranges (`end < start`), malformed `RRULE` parameters, or missing `instanceStartTime` on single-instance scopes fail loud and fast.
- Commit:
  - `test(calendar): add design-by-contract tests for calendar schema and RFC 5545 rrule parsing`
  - `feat(calendar): add events SQLite migration and Zod boundary schemas`

### BP-CAL-002: Calendar Domain Service & `RRuleSet` Expansion (`calendar.service.ts`)
- Serves: "Equipped with AI agent tools to list/read, create, edit/modify, and delete events (both single instances and recurring series), updating the Calendar UI in real time" in the Intent.
- Input:
  - Public functions in `src/features/calendar/calendar.service.ts`:
    - `createCalendarEvent(input: CreateEventInput): Promise<CalendarEventRecord>`
    - `listCalendarEventsInRange(query: DateRangeQueryInput): Promise<ExpandedCalendarEventInstance[]>`
    - `getCalendarEventById(eventId: string): Promise<CalendarEventRecord>`
    - `updateCalendarEvent(input: UpdateEventInput): Promise<CalendarEventRecord>`
    - `deleteCalendarEvent(input: DeleteEventInput): Promise<{ deletedId: string; scope: 'this_instance' | 'entire_series' }>`
- Behavior:
  - `createCalendarEvent`: Parses input, inserts the event record into SQLite, and emits `calendar:updated` (`reason: 'created'`).
  - `listCalendarEventsInRange`:
    - Queries standalone/override events overlapping `[rangeStart, rangeEnd]` using true interval overlap (`start_time < $rangeEnd AND end_time > $rangeStart`) so multi-day or overnight events that started before `rangeStart` and end inside the range are never missed.
    - Queries master recurring series (`rrule IS NOT NULL`), constructs each `RRuleSet` with `dtstart = new Date(series.start_time)`, `.rrule()`, and `.exdate()`, and expands occurrences from `new Date(Date.parse(rangeStart) - seriesDurationMs)` to `new Date(rangeEnd)` (filtering for `instanceEndTime > rangeStart && instanceStartTime < rangeEnd`).
    - Returns a chronological list of `ExpandedCalendarEventInstance` objects (`{ id, eventId, masterEventId, title, description, startTime, endTime, allDay, color, isRecurring, isOverride, rrule, instanceStartTime }`) consumed identically by both FullCalendar and `MB-03`'s `listEvents` agent tool. For override rows (`recurring_event_id IS NOT NULL`), `masterEventId` points to `recurring_event_id`, `isRecurring` is `true`, `isOverride` is `true`, and `instanceStartTime` is `original_start_time`.
  - `updateCalendarEvent`:
    - When `scope: 'entire_series'` (or a standalone non-recurring event): resolves `masterEventId` (if called on an override row, resolves its parent `recurring_event_id`), updates the target row, shifts any existing `exdates` and linked override `original_start_time` values by `deltaMs = Date.parse(newStartTime) - Date.parse(oldStartTime)` when `start_time` changes so previously excluded/overridden occurrences remain aligned, and emits `calendar:updated` (`reason: 'updated'`).
    - When `scope: 'this_instance'` on a recurring series or existing override row: resolves the parent master series, ensures the normalized UTC `instanceStartTime` is present in the parent row's `exdates` JSON array (without duplicating if already excluded), upserts the override row linked via `(recurring_event_id, original_start_time)`, and emits `calendar:updated` (`reason: 'updated'`).
  - `deleteCalendarEvent`:
    - When `scope: 'entire_series'` (or a standalone non-recurring event): resolves `masterEventId` (if called on an override row, resolves its parent `recurring_event_id`), deletes the master row (cascading any overrides), and emits `calendar:updated` (`reason: 'deleted'`).
    - When `scope: 'this_instance'` on a recurring series or existing override row: resolves the parent master series, ensures `instanceStartTime` is in the parent row's `exdates` array, deletes any existing override row for `(recurring_event_id, original_start_time)`, and emits `calendar:updated` (`reason: 'deleted'`).
- Output: Persisted event records, expanded occurrence instances, and emitted `calendar:updated` sync events.
- Failure:
  - Throws a descriptive error if the target event ID does not exist or if `scope: 'this_instance'` is called on a non-recurring event.
- Method: `tdd` + `integration/e2e` (against real SQLite via `src/core/db.ts`).
- Verification:
  - Vitest suite exercising the public service API against a real SQLite database across all 4 dimensions:
    1. Normal path: creating one-time and recurring (e.g., M/W/F) events and expanding them across a week range.
    2. Boundaries/edge cases: editing a single Tuesday occurrence (`this_instance`) so Tuesday moves to a new time while Monday/Wednesday/Friday remain unchanged; deleting a single Friday occurrence (`this_instance`) via `exdates`.
    3. Error paths: updating/deleting a non-existent event ID or requesting `this_instance` on a non-recurring event.
    4. Core invariants: `calendar:updated` sync event fires on every create, update, and delete; deleting a master series cascades its single-instance overrides.
- Commit:
  - `test(calendar): add TDD integration tests for CRUD, RRuleSet expansion, exdates, and instance overrides`
  - `feat(calendar): implement calendar domain service with RFC 5545 recurrence and sync emission`

### BP-CAL-003: Customizable FullCalendar UI & Real-Time Sync (`CalendarView.tsx`)
- Serves: "Built on FullCalendar (`@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`) paired with `rrule.js`" and "must be updated in real-time in the app" in the Intent.
- Input:
  - `listCalendarEventsInRange` from `calendar.service.ts` and real-time `calendar:updated` events from `onSyncEvent('calendar:updated', ...)`.
  - Approved visual direction in `docs/design/brand.md`.
- Behavior:
  - Renders the Calendar view inside the Main Window with custom navigation controls (Today, Prev, Next, and Month / Week / Day view switcher) and custom React event cards (`eventContent`).
  - Uses FullCalendar's dynamic `events={(fetchInfo, successCallback) => ...}` source calling `listCalendarEventsInRange({ rangeStart: fetchInfo.startStr, rangeEnd: fetchInfo.endStr })` so FullCalendar renders the exact same `RRuleSet`-expanded occurrences, `exdates`, and single-instance overrides that the AI agent sees.
  - Allows clicking a time slot (or dragging across slots) to open the Create Event modal (supporting title, time range, all-day toggle, color tag, and recurrence preset or custom rule).
  - Allows clicking an existing event (or dragging/resizing it) to Edit or Delete; if `instance.isRecurring` is true, prompts whether to apply the edit/delete to `"This occurrence only"` (`scope: 'this_instance'`, passing `instance.masterEventId` and `instance.instanceStartTime`) or `"All events in the series"` (`scope: 'entire_series'`, passing `instance.masterEventId`).
  - Subscribes to `onSyncEvent('calendar:updated', ...)` on mount and calls `calendarRef.current?.getApi().refetchEvents()` so whenever `MB-03`'s agent tools mutate the calendar from either window, the calendar view reloads from SQLite and updates on screen immediately without a page reload.
- Output: Interactive, brand-aligned Calendar UI in the Main Window with real-time sync.
- Failure:
  - Displays an inline error banner in the modal/view if a database write or validation fails, keeping the user's draft form input intact.
- Method: `visual testing` (following `method/VISUAL_TESTING.md` and `docs/design/brand.md`).
- Verification:
  - Real browser verification via Visual QA walkthrough across desktop and compact viewports with screenshots at each step: viewing Month/Week/Day grids, creating a one-time event, creating a recurring event, editing a single occurrence vs. entire series, deleting a single occurrence, and triggering a `calendar:updated` sync event to verify immediate live UI refresh.
- Commit:
  - `feat(calendar-ui): build FullCalendar Month/Week/Day view with recurrence modal and real-time sync`

## Non-Goals

- Do not build the AI Agent runner or tool definitions in this blueprint (covered in `MB-03`, which calls `calendar.service.ts` directly).
- Do not build external Google Calendar / CalDAV network sync (Dialogue v0.1 is strictly local-first).
- Do not write unit tests for React component rendering or CSS layout (verified via `visual testing` per engineering rules).

## Not Covered Yet

- **Configurable Agent Connection & Calendar Tools (`MB-03`)**: Provider settings and the Vercel AI SDK agent tools wrapping `calendar.service.ts`.
- **Main Chat Threads & Quick Command Overlay (`MB-04`)**: Multi-thread Chat UI and Raycast-like Quick Command UI.

---
title: "Blueprint: MB-04 Main Chat Threads & Raycast-like Quick Command Overlay"
type: blueprint
parent_intent: docs/intent/20261110_dialogue_v0_1_foundation.md
status: Approved
last_updated: 2026-11-10
---

# Blueprint: MB-04 Main Chat Threads & Raycast-like Quick Command Overlay

This is the fourth and final connected micro-blueprint for Dialogue v0.1 (`MB-01` -> `MB-02` -> `MB-03` -> `MB-04`). Building on `MB-01` (multi-window shell, SQLite, cross-window sync), `MB-02` (Calendar domain & UI), and `MB-03` (Provider settings & `runAgentTurn` with Calendar tools), this blueprint delivers the two conversational user interfaces powered by **Vercel AI UI SDK (`@ai-sdk/react`)**: persistent multi-thread Chat inside the Main Window (`src/features/chat/`) and the ephemeral Raycast-like Quick Command overlay (`src/features/quick-command/`) with its "Continue in App" handoff.

## Design

### Module Boundaries & Locality of Behavior

```text
src/
  features/
    chat/
      chat.schema.ts        # Zod boundary schemas for ChatThread, ChatMessage, ToolCallBadge, and PromoteExchangeInput
      chat.service.ts       # SQLite CRUD for threads/messages, sendThreadMessage() calling runAgentTurn, and promoteQuickExchangeToThread()
      ChatView.tsx          # Multi-thread sidebar + @ai-sdk/react streaming conversation view with tool-invocation parts
    quick-command/
      QuickCommandView.tsx  # Frameless Raycast-like prompt bar, @ai-sdk/react streaming response + inline tool pills, and "Continue in App" handoff
```

### How MB-04 Completes the Connected v0.1 Loop

1. **Ephemeral by Default in Quick Command (`QuickCommandView.tsx`)**: When summoned via the global shortcut (`MB-01`), `QuickCommandView.tsx` keeps its current prompt/response exchange strictly in local component memory and calls `MB-03`'s `runAgentTurn` directly. Any calendar tool executed during that prompt still writes to SQLite via `MB-02`'s `calendar.service.ts` and broadcasts `calendar:updated` (`MB-01`), so the calendar updates immediately without polluting `chat_threads` with one-line commands. When the overlay is dismissed (`Escape` or hotkey toggle), the ephemeral prompt resets cleanly for next time.
2. **"Continue in App" Handoff (`promoteQuickExchangeToThread`)**: When the user clicks `"Continue in App"` (or presses `CommandOrControl+Enter` after an answer) inside Quick Command, `chat.service.ts` runs `promoteQuickExchangeToThread({ exchanges })`, which persists those ephemeral messages as a new thread in SQLite, emits `chat:promoted` (`{ threadId, timestamp }`) via `MB-01`'s `sync.ts`, calls `focusMainWindow()` from `MB-01` (`src/core/shortcut.ts`), and hides the `quick-command` overlay.
3. **Unified Main Window Navigation (`src/App.tsx`)**: Connects `ChatView.tsx` (`MB-04`), `CalendarView.tsx` (`MB-02`), and `SettingsView.tsx` (`MB-03`) inside the Main Window shell. Both `onSyncEvent('chat:promoted', ({ threadId }) => ...)` and `onSyncEvent('navigation:requested', ({ tab, threadId }) => ...)` are mounted at the `main` window shell level in `src/App.tsx` so promoting an exchange or clicking `"Configure AI Provider in App"` inside Quick Command switches `main` to the target tab (`chat` or `settings`) and selects `threadId` even if another tab was open.

## Contracts

### BP-CHAT-001: Persistent Chat Threads & Ephemeral Promotion Service (`chat.schema.ts` & `chat.service.ts`)
- Serves: "Main Application Window: Houses persistent multi-thread Chat", "Conversations here are ephemeral by default so they do not clutter the main chat history, with a 'Continue in App' action to promote an exchange into a saved chat thread in the Main Window", and "No chat clutter from Quick Commands" in the Intent.
- Input:
  - Migration `004_create_chat_threads_and_messages` registered in `src/core/db.ts`.
  - Public service functions in `src/features/chat/chat.service.ts`, validated at the entry boundary with Zod (`chat.schema.ts`):
    - `createChatThread(title?: string): Promise<ChatThread>`
    - `listChatThreads(): Promise<ChatThread[]>`
    - `getChatThreadMessages(threadId: string): Promise<ChatMessage[]>`
    - `deleteChatThread(threadId: string): Promise<void>`
    - `sendThreadMessage(input: { threadId: string; userText: string; onTextDelta?: (delta: string) => void }): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>`
    - `promoteQuickExchangeToThread(input: { exchanges: Array<{ role: 'user' | 'assistant'; content: string; toolExecutions?: ExecutedCalendarToolSummary[] }> }): Promise<ChatThread>`
- Behavior:
  - Creates `chat_threads` (`id`, `title`, `created_at`, `updated_at`) and `chat_messages` (`id`, `thread_id REFERENCES chat_threads(id) ON DELETE CASCADE`, `role`, `content`, `tool_calls_json`, `created_at`), and `deleteChatThread` explicitly deletes linked `chat_messages` rows alongside `ON DELETE CASCADE`.
  - `sendThreadMessage`: Validates the input and verifies the thread exists, loads the existing thread messages, invokes `MB-03`'s `runAgentTurn` with the conversation history plus the new user prompt, and upon completion persists both the user message and the assistant reply (including structured `tool_calls_json` summaries) and updates the thread's `updated_at` (auto-titling untitled threads from the first user prompt). Persisting after `runAgentTurn` succeeds ensures failed or unconfigured turns never leave duplicate orphaned user messages in SQLite when the user retries.
  - `promoteQuickExchangeToThread`: Validates a non-empty ephemeral exchange from Quick Command, creates a new `ChatThread` in SQLite, inserts all messages from the exchange in a single batched `INSERT` statement (avoiding multi-call transaction pooling issues), and emits `chat:promoted` (`{ threadId, timestamp }`) via `MB-01`'s `src/core/sync.ts`.
- Output: Persisted `ChatThread` and `ChatMessage` records.
- Failure:
  - Rejects empty user prompts or empty promotion exchanges at the Zod boundary before touching SQLite or the AI provider.
  - Throws a descriptive error if `threadId` does not exist.
- Method: `tdd` + `integration/e2e` (against real SQLite).
- Verification:
  - Vitest suite verifying:
    1. Creating, listing, messaging, and deleting chat threads (with `ON DELETE CASCADE` cleaning up messages).
    2. Running an ephemeral Quick Command turn does **not** create rows in `chat_threads` or `chat_messages`.
    3. Calling `promoteQuickExchangeToThread` persists the full exchange into a new thread and emits the `chat:promoted` sync event.
    4. Empty messages or non-existent thread IDs fail fast and loud.
- Commit:
  - `test(chat): add TDD integration tests for chat threads, messaging, and ephemeral handoff promotion`
  - `feat(chat): implement chat SQLite schema, thread service, and quick-command promotion handoff`

### BP-CHAT-002: Main Window Multi-Thread Chat UI with `@ai-sdk/react` (`ChatView.tsx`)
- Serves: "Main Application Window: Houses persistent multi-thread Chat, the interactive Calendar UI, and Settings" in the Intent.
- Input:
  - Public functions from `chat.service.ts` and `promotedThreadId?: string` prop passed down from `src/App.tsx` (which listens to `onSyncEvent('chat:promoted', ...)` at the top-level window shell).
  - Approved visual direction in `docs/design/brand.md` (Section 5: AI UI & Interaction Patterns).
- Behavior:
  - Renders the thread list sidebar (New Chat button, chronological thread list, delete thread action) and the active conversation panel.
  - Powered by `@ai-sdk/react` for message lifecycle: maps chat history to typed UI messages with structured parts (`type: 'text'` and `type: 'tool-invocation'`).
  - Streams assistant responses with a minimalist vertical bar cursor and renders compact, brand-aligned workspace cards for calendar tool activity (`listEvents`, `createEvent`, `updateEvent`, `deleteEvent`) in pending, completed, or failed states.
  - Whenever `promotedThreadId` changes (when an exchange is promoted from the Quick Command overlay and `src/App.tsx` switches the active tab to `Chat`), reloads `listChatThreads()`, selects `promotedThreadId`, and loads that thread's messages immediately.
  - If the user has not configured an AI provider yet (`ProviderNotConfiguredError`), shows a direct action banner that switches the Main Window to the Settings tab (`MB-03`).
- Output: Interactive multi-thread Chat UI inside the Main Window with `@ai-sdk/react` streaming and tool rendering.
- Failure:
  - Surfaces provider or network errors clearly inline in the conversation with a retry option without losing the user's prompt text.
- Method: `visual testing` (following `method/VISUAL_TESTING.md` and `docs/design/brand.md`).
- Verification:
  - Real browser Visual QA walkthrough with screenshots verifying thread creation, sending a calendar command in chat, viewing inline tool badges, verifying the Calendar tab updated in real time, and deleting a thread.
- Commit:
  - `feat(chat-ui): build multi-thread chat interface with @ai-sdk/react streaming and tool badges`

### BP-CHAT-003: Raycast-like Quick Command Overlay UI with `@ai-sdk/react` (`QuickCommandView.tsx`)
- Serves: "Raycast-like Quick Command Overlay: Summoned via a custom global keyboard shortcut for fast questions ('What's on my schedule today?') and quick calendar commands. Conversations here are ephemeral by default... with a 'Continue in App' action" in the Intent.
- Input:
  - `runAgentTurn` from `MB-03` (`src/features/agent/agent.service.ts`) and `promoteQuickExchangeToThread` from `chat.service.ts`.
  - Approved visual direction in `docs/design/brand.md` (Section 5: AI UI & Interaction Patterns).
- Behavior:
  - Renders a compact, keyboard-first floating command bar with an auto-focused `"Ask AI..."` search input when summoned.
  - Pressing `Enter` triggers an ephemeral `@ai-sdk/react` streaming turn via `runAgentTurn`, displaying the streaming response and inline tool pills (`Created: ...`, `Updated: ...`, `Listed N events`) below the search bar.
  - Pressing `Escape` dismisses the overlay and resets the ephemeral state.
  - Displays a `"Continue in App"` button (and keyboard shortcut hint `⌘⏎`) whenever an exchange is active; triggering it calls `promoteQuickExchangeToThread`, calls `focusMainWindow()` (`src/core/shortcut.ts`) so the `main` window is shown/unminimized/focused on that new thread, and hides the `quick-command` overlay.
- Output: Frameless Raycast-like Quick Command overlay connected to the agent, calendar, and main chat.
- Failure:
  - Displays a compact inline error state inside the overlay; if `ProviderNotConfiguredError` occurs, renders a `"Configure AI Provider in App"` button that emits `emitSyncEvent('navigation:requested', { tab: 'settings', timestamp: Date.now() })`, calls `focusMainWindow()`, and hides the `quick-command` overlay.
- Method: `visual testing` (following `method/VISUAL_TESTING.md` and `docs/design/brand.md`).
- Verification:
  - Real browser Visual QA walkthrough with screenshots verifying the compact Raycast-like overlay layout, submitting a quick calendar prompt, inspecting the inline response and tool confirmation pill, and triggering `"Continue in App"` to verify the exchange lands in the Main Window's chat thread list without prior clutter.
- Commit:
  - `feat(quick-command): build Raycast-like quick command overlay with Continue in App handoff`

## Non-Goals

- Do not persist Quick Command exchanges automatically unless the user triggers `"Continue in App"`.
- Do not add file attachments, voice input, or non-calendar command plugins in v0.1.

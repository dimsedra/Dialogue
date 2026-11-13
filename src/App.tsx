import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  HardDrive,
  PanelLeftClose,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import {
  registerQuickCommandShortcut,
  toggleQuickCommandWindow,
} from "./core/shortcut";
import { initDatabase, connectReadWriteDatabase } from "./core/db";
import { onSyncEvent } from "./core/sync";
import { cn } from "./core/cn";
import { CalendarView } from "./features/calendar/CalendarView";
import { GlanceableCalendar } from "./features/calendar/GlanceableCalendar";
import { SettingsView } from "./features/settings/SettingsView";
import { getAppSettings } from "./features/settings/settings.service";
import { ChatView } from "./features/chat/ChatView";
import { QuickCommandView } from "./features/quick-command/QuickCommandView";
import {
  listChatThreads,
  createChatThread,
  deleteChatThread,
} from "./features/chat/chat.service";
import type { ChatThread } from "./features/chat/chat.schema";
import { LogoMark } from "./components/Brand";
import type { PillarId } from "./components/pillars";

const LEFT_W = 280;
const RIGHT_W = 372;
const PINNED_STORAGE_KEY = "dialogue.pinnedThreadIds";

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function loadPinnedIds(): string[] {
  try {
    const raw = window.localStorage.getItem(PINNED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function getThreadGroup(updatedAt: string): "Today" | "Yesterday" | "Earlier" {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return "Today";
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dateUtc = Date.UTC(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
  const diffDays = Math.round((todayUtc - dateUtc) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Earlier";
}

/** Inline column on wide screens, slide-over drawer on narrow viewports. */
function Panel({
  side,
  open,
  inline,
  width,
  onClose,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  inline: boolean;
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  if (inline) {
    return (
      <aside
        inert={!open}
        style={{ width: open ? width : 0 }}
        className={cn(
          "shrink-0 overflow-hidden border-line bg-canvas transition-[width] duration-300 ease-out",
          side === "left" ? "border-r" : "border-l"
        )}
      >
        <div className="h-full" style={{ width }}>
          {children}
        </div>
      </aside>
    );
  }

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "fixed inset-0 z-30 bg-black/55 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        inert={!open}
        style={{ width: `min(${width}px, 92vw)` }}
        className={cn(
          "fixed inset-y-0 z-40 bg-canvas transition-[transform,visibility,box-shadow] duration-300 ease-out",
          side === "left"
            ? "left-0 border-r border-line"
            : "right-0 border-l border-line",
          open
            ? "visible translate-x-0 shadow-float"
            : cn(
                "invisible shadow-none",
                side === "left" ? "-translate-x-full" : "translate-x-full"
              )
        )}
      >
        {children}
      </aside>
    </>
  );
}

export function QuickCommandShell() {
  useEffect(() => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void connectReadWriteDatabase().catch(() => {});
    }
  }, []);

  return <QuickCommandView />;
}

const GROUP_ORDER = ["Pinned", "Today", "Yesterday", "Earlier"] as const;

export function MainWindowShell() {
  const inlineLeft = useMedia("(min-width: 860px)");
  const inlineRight = useMedia("(min-width: 1240px)");

  const [activeTab, setActiveTab] = useState<"chat" | "calendar" | "settings">(
    "chat"
  );
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>(loadPinnedIds);
  const [query, setQuery] = useState("");

  const [leftOpen, setLeftOpen] = useState(inlineLeft);
  const [rightOpen, setRightOpen] = useState(inlineRight);
  const [quickTab, setQuickTab] = useState<PillarId>("calendar");
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(
    null
  );
  const [draftOverride, setDraftOverride] = useState<string | undefined>(
    undefined
  );
  const [focusTick, setFocusTick] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const leftOpenRef = useRef(leftOpen);
  leftOpenRef.current = leftOpen;

  useEffect(() => setLeftOpen(inlineLeft), [inlineLeft]);
  useEffect(() => setRightOpen(inlineRight), [inlineRight]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PINNED_STORAGE_KEY,
        JSON.stringify(pinnedIds)
      );
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }, [pinnedIds]);

  useEffect(() => {
    if (!highlightedEventId) return;
    const timer = window.setTimeout(() => setHighlightedEventId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [highlightedEventId]);

  const loadThreads = useCallback(
    async (selectId?: string) => {
      try {
        const all = await listChatThreads();
        setThreads(all);
        if (selectId) {
          setActiveThreadId(selectId);
        } else if (all.length > 0 && !activeThreadId) {
          setActiveThreadId(all[0].id);
        }
      } catch {
        // Non-Tauri browser preview
      }
    },
    [activeThreadId]
  );

  useEffect(() => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void (async () => {
        try {
          await initDatabase();
          await loadThreads();
          const settings = await getAppSettings();
          await registerQuickCommandShortcut(
            settings.globalShortcut,
            toggleQuickCommandWindow
          );
        } catch {
          // Non-blocking fallback
        }
      })();
    }

    let unlistenNavigation: (() => void) | undefined;
    void onSyncEvent("navigation:requested", (payload) => {
      setActiveTab(payload.tab);
      if (payload.threadId) {
        setActiveThreadId(payload.threadId);
      }
    })
      .then((unlisten) => {
        unlistenNavigation = unlisten;
      })
      .catch(() => {});

    let unlistenChatPromoted: (() => void) | undefined;
    void onSyncEvent("chat:promoted", (payload) => {
      setActiveTab("chat");
      void loadThreads(payload.threadId);
    })
      .then((unlisten) => {
        unlistenChatPromoted = unlisten;
      })
      .catch(() => {});

    return () => {
      unlistenNavigation?.();
      unlistenChatPromoted?.();
    };
  }, [loadThreads]);

  // ⌘K / Ctrl+K focuses thread search, opening the sidebar first if collapsed
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (leftOpenRef.current) {
          searchRef.current?.focus();
        } else {
          setLeftOpen(true);
          window.setTimeout(() => searchRef.current?.focus(), 320);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleCreateThread = async () => {
    setQuery("");
    setActiveTab("chat");
    try {
      const created = await createChatThread();
      setThreads((prev) => [created, ...prev]);
      setActiveThreadId(created.id);
    } catch {
      // Browser preview fallback: reset to fresh empty chat state
      setActiveThreadId(null);
    }
    setFocusTick((n) => n + 1);
    if (!inlineLeft) setLeftOpen(false);
  };

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setActiveTab("chat");
    if (!inlineLeft) setLeftOpen(false);
  };

  const handleTogglePin = (threadId: string) => {
    setPinnedIds((prev) =>
      prev.includes(threadId)
        ? prev.filter((id) => id !== threadId)
        : [...prev, threadId]
    );
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      await deleteChatThread(threadId);
      const remaining = threads.filter((t) => t.id !== threadId);
      setThreads(remaining);
      setPinnedIds((prev) => prev.filter((id) => id !== threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch {
      // Non-blocking
    }
  };

  const handleViewCalendarEvent = (startTimeIso: string, eventId?: string) => {
    const parsed = new Date(startTimeIso);
    if (!Number.isNaN(parsed.getTime())) {
      setSelectedDate(parsed);
    }
    setQuickTab("calendar");
    setRightOpen(true);
    if (eventId) setHighlightedEventId(eventId);
  };

  const handleWishPillar = (promptPrefix: string) => {
    setDraftOverride(promptPrefix);
    setFocusTick((n) => n + 1);
    setActiveTab("chat");
    if (!inlineRight) setRightOpen(false);
  };

  const threadGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? threads.filter((t) => t.title.toLowerCase().includes(q))
      : threads;

    return GROUP_ORDER.map((label) => ({
      label,
      items: filtered.filter((t) => {
        const isPinned = pinnedIds.includes(t.id);
        if (label === "Pinned") return isPinned;
        return !isPinned && getThreadGroup(t.updatedAt) === label;
      }),
    })).filter((g) => g.items.length > 0);
  }, [threads, query, pinnedIds]);

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="flex h-full w-full overflow-hidden bg-paper text-ink select-none">
      {/* Left Sidebar: Brand, Search, Conversations & Local-First Footer */}
      <Panel
        side="left"
        open={leftOpen}
        inline={inlineLeft}
        width={LEFT_W}
        onClose={() => setLeftOpen(false)}
      >
        <div className="flex h-full w-full flex-col bg-canvas">
          {/* Brand Header */}
          <div className="flex h-14 shrink-0 items-center justify-between pl-5 pr-3">
            <div className="flex items-center gap-2.5">
              <LogoMark className="size-8" />
              <span className="font-display text-[20px] font-semibold tracking-[-0.01em] text-ink">
                Dialogue
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLeftOpen(false)}
              aria-label="Hide sidebar"
              title="Hide sidebar"
              className="grid size-8 place-items-center rounded-lg text-ink-2 transition hover:bg-active hover:text-ink"
            >
              <PanelLeftClose className="size-[18px]" />
            </button>
          </div>

          {/* Primary Actions */}
          <div className="space-y-2.5 px-3 pb-2 pt-1">
            <button
              type="button"
              onClick={() => void handleCreateThread()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[14px] font-semibold text-paper transition hover:bg-white active:scale-[0.99]"
            >
              <Plus className="size-4" strokeWidth={2.5} />
              New conversation
            </button>
            <label className="relative block">
              <span className="sr-only">Search conversations</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setQuery("");
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Search conversations"
                className="h-9 w-full rounded-xl border border-line bg-paper pl-9 pr-12 text-[13.5px] text-ink outline-none transition placeholder:text-ink-4 focus:border-calendar focus:ring-2 focus:ring-calendar/20"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-ink-2">
                ⌘K
              </kbd>
            </label>
          </div>

          {/* Thread List */}
          <nav
            aria-label="Conversations"
            className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
          >
            {threadGroups.length === 0 ? (
              <p className="px-3 pt-8 text-center text-[13px] leading-relaxed text-ink-2">
                {query.trim()
                  ? `Nothing matches “${query}”.`
                  : "No conversations yet. Start one above."}
              </p>
            ) : (
              threadGroups.map((group) => (
                <section key={group.label} className="pt-4">
                  <h2 className="px-3 pb-1.5 text-[12px] font-semibold tracking-wide text-ink-2">
                    {group.label}
                  </h2>
                  <ul className="space-y-0.5">
                    {group.items.map((thread) => {
                      const isActive =
                        thread.id === activeThreadId && activeTab === "chat";
                      const isPinned = pinnedIds.includes(thread.id);
                      return (
                        <li key={thread.id} className="group relative">
                          <button
                            type="button"
                            onClick={() => handleSelectThread(thread.id)}
                            aria-current={isActive ? "true" : undefined}
                            className={cn(
                              "flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13.5px] transition",
                              "group-hover:pr-[3.9rem] group-focus-within:pr-[3.9rem]",
                              isActive
                                ? "bg-active font-semibold text-ink ring-1 ring-line"
                                : "text-ink-2 hover:bg-sunken hover:text-ink"
                            )}
                          >
                            <span
                              className={cn(
                                "size-2 shrink-0 rounded-full",
                                isActive ? "bg-calendar" : "bg-ink-4"
                              )}
                            />
                            <span className="truncate">{thread.title}</span>
                          </button>
                          <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex group-focus-within:flex">
                            <button
                              type="button"
                              onClick={() => handleTogglePin(thread.id)}
                              aria-label={
                                isPinned
                                  ? `Unpin ${thread.title}`
                                  : `Pin ${thread.title}`
                              }
                              title={isPinned ? "Unpin" : "Pin"}
                              className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-active hover:text-ink"
                            >
                              {isPinned ? (
                                <PinOff className="size-[15px]" />
                              ) : (
                                <Pin className="size-[15px]" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteThread(thread.id)}
                              aria-label={`Delete ${thread.title}`}
                              title="Delete"
                              className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-active hover:text-rose-300"
                            >
                              <Trash2 className="size-[15px]" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </nav>

          {/* Local-first Footer */}
          <div className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-todo-tint text-todo-fg">
              <HardDrive className="size-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[13px] font-semibold text-ink">Local-first</p>
              <p className="truncate text-[12px] text-ink-2">
                Stays on this device · v0.1
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab((prev) =>
                  prev === "settings" ? "chat" : "settings"
                );
                if (!inlineLeft) setLeftOpen(false);
              }}
              aria-label="Settings"
              aria-pressed={activeTab === "settings"}
              title="Settings"
              className={cn(
                "grid size-8 place-items-center rounded-lg transition",
                activeTab === "settings"
                  ? "bg-active text-ink ring-1 ring-line"
                  : "text-ink-2 hover:bg-active hover:text-ink"
              )}
            >
              <Settings className="size-[18px]" />
            </button>
          </div>
        </div>
      </Panel>

      {/* Center Workspace */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-paper">
        {activeTab === "chat" ? (
          <ChatView
            activeThreadId={activeThreadId}
            activeThreadTitle={activeThread?.title}
            draftOverride={draftOverride}
            focusTick={focusTick}
            leftOpen={leftOpen}
            rightOpen={rightOpen}
            onActiveThreadChange={setActiveThreadId}
            onNavigateToSettings={() => setActiveTab("settings")}
            onThreadsRefresh={() => void loadThreads()}
            onViewCalendarEvent={handleViewCalendarEvent}
            onOpenLeft={() => setLeftOpen(true)}
            onToggleRight={() => setRightOpen((prev) => !prev)}
          />
        ) : activeTab === "calendar" ? (
          <CalendarView
            leftOpen={leftOpen}
            onOpenLeft={() => setLeftOpen(true)}
            onBackToChat={() => setActiveTab("chat")}
          />
        ) : (
          <SettingsView
            leftOpen={leftOpen}
            onOpenLeft={() => setLeftOpen(true)}
            onBackToChat={() => setActiveTab("chat")}
          />
        )}
      </main>

      {/* Right Panel: Four-Pillar Quick Look */}
      {activeTab !== "calendar" && (
        <Panel
          side="right"
          open={rightOpen}
          inline={inlineRight}
          width={RIGHT_W}
          onClose={() => setRightOpen(false)}
        >
          <GlanceableCalendar
            tab={quickTab}
            selectedDate={selectedDate}
            highlightedEventId={highlightedEventId}
            onTabChange={setQuickTab}
            onSelectDate={setSelectedDate}
            onOpenFullCalendar={() => {
              setActiveTab("calendar");
              if (!inlineRight) setRightOpen(false);
            }}
            onCloseSidebar={() => setRightOpen(false)}
            onWishPillar={handleWishPillar}
          />
        </Panel>
      )}
    </div>
  );
}

export default function App() {
  const [windowLabel, setWindowLabel] = useState<string>("main");

  useEffect(() => {
    try {
      const win = getCurrentWebviewWindow();
      if (win?.label) {
        setWindowLabel(win.label);
      }
    } catch {
      const params = new URLSearchParams(window.location.search);
      setWindowLabel(params.get("window") || "main");
    }
  }, []);

  if (windowLabel === "quick-command") {
    return <QuickCommandShell />;
  }

  return <MainWindowShell />;
}

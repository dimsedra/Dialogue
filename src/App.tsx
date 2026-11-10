import { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  registerQuickCommandShortcut,
  toggleQuickCommandWindow,
} from "./core/shortcut";
import { initDatabase, connectReadWriteDatabase } from "./core/db";
import { onSyncEvent } from "./core/sync";
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

export function QuickCommandShell() {
  useEffect(() => {
    try {
      void connectReadWriteDatabase();
    } catch {
      // Non-Tauri environment
    }
  }, []);

  return <QuickCommandView />;
}

export function MainWindowShell() {
  const [activeTab, setActiveTab] = useState<"chat" | "calendar" | "settings">(
    "chat"
  );
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Resizable panel dimensions
  const [leftWidth, setLeftWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(350);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

  const isLeftDraggingRef = useRef(false);
  const isRightDraggingRef = useRef(false);

  const loadThreads = useCallback(async (selectId?: string) => {
    try {
      const all = await listChatThreads();
      setThreads(all);

      if (selectId) {
        setActiveThreadId(selectId);
      } else if (all.length > 0 && !activeThreadId) {
        setActiveThreadId(all[0].id);
      }
    } catch {
      // Graceful fallback
    }
  }, [activeThreadId]);

  useEffect(() => {
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
        // Non-Tauri environment
      }
    })();

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

  // Resizing mouse handlers
  const handleLeftResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isLeftDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = leftWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isLeftDraggingRef.current) return;
      const newWidth = Math.min(380, Math.max(200, startWidth + (moveEvent.clientX - startX)));
      setLeftWidth(newWidth);
    };

    const onMouseUp = () => {
      isLeftDraggingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleRightResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isRightDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = rightWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isRightDraggingRef.current) return;
      const newWidth = Math.min(480, Math.max(260, startWidth - (moveEvent.clientX - startX)));
      setRightWidth(newWidth);
    };

    const onMouseUp = () => {
      isRightDraggingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleCreateThread = async () => {
    try {
      const newThread = await createChatThread();
      setThreads((prev) => [newThread, ...prev]);
      setActiveThreadId(newThread.id);
      setActiveTab("chat");
    } catch {
      // Non-blocking
    }
  };

  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    try {
      await deleteChatThread(threadId);
      const remaining = threads.filter((t) => t.id !== threadId);
      setThreads(remaining);
      if (activeThreadId === threadId) {
        setActiveThreadId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch {
      // Non-blocking
    }
  };

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="w-screen h-screen flex bg-[#090a0c] text-[#f3f4f6] overflow-hidden select-none font-sans">
      {/* Left Rail: Unified Navigation + Chat Threads */}
      <aside
        style={{ width: `${leftWidth}px` }}
        className="bg-[#131417] border-r border-[#22242a] flex flex-col shrink-0 relative transition-none"
      >
        {/* App Title & Version Header */}
        <div className="h-14 px-4 border-b border-[#22242a] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" />
            <span className="font-semibold text-base tracking-tight text-[#f3f4f6]">
              Dialogue
            </span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 bg-[#090a0c] text-[#8b8f98] rounded border border-[#22242a]">
            v0.1
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="p-3 space-y-1.5 shrink-0">
          <button
            onClick={() => setActiveTab("chat")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "chat"
                ? "bg-[#1c1e24] text-[#f3f4f6] border border-[#22242a]"
                : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 3h12a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 3V4a1 1 0 011-1z" />
            </svg>
            <span>Chat</span>
          </button>

          <button
            onClick={() => setActiveTab("calendar")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "calendar"
                ? "bg-[#1c1e24] text-[#f3f4f6] border border-[#22242a]"
                : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3" width="12" height="11" rx="1.5" />
              <path d="M2 6.5h12M5 1.5v2.5M11 1.5v2.5" />
            </svg>
            <span>Calendar</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "settings"
                ? "bg-[#1c1e24] text-[#f3f4f6] border border-[#22242a]"
                : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
            </svg>
            <span>Settings</span>
          </button>
        </nav>

        {/* Divider */}
        <div className="mx-3.5 my-1 border-t border-[#22242a]" />

        {/* Conversation Threads Section */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3.5 py-2 flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-[#8b8f98] uppercase tracking-wider">
              Conversations
            </span>
            <button
              onClick={handleCreateThread}
              className="px-2 py-0.5 bg-[#1c1e24] hover:bg-[#252830] border border-[#22242a] text-[#f3f4f6] rounded text-xs font-medium transition-colors"
              title="New Conversation"
            >
              + New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2.5 space-y-1">
            {threads.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#525660]">
                No conversations yet
              </div>
            ) : (
              threads.map((t) => {
                const isActive = t.id === activeThreadId && activeTab === "chat";
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setActiveThreadId(t.id);
                      setActiveTab("chat");
                    }}
                    className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                      isActive
                        ? "bg-[#1c1e24] text-[#f3f4f6] border border-[#22242a] font-medium"
                        : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
                    }`}
                  >
                    <span className="truncate pr-2">{t.title}</span>
                    <button
                      onClick={(e) => void handleDeleteThread(e, t.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#525660] hover:text-red-400 text-xs transition-opacity p-0.5"
                      title="Delete conversation"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Rail Footer */}
        <div className="h-11 px-4 border-t border-[#22242a] flex items-center justify-between text-xs font-mono text-[#525660] shrink-0">
          <span>Quick: ⌘⇧Space</span>
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={handleLeftResizeStart}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#3b82f6]/40 transition-colors z-10"
        />
      </aside>

      {/* Center Main Workspace */}
      <main className="flex-1 flex flex-col bg-[#090a0c] overflow-hidden min-w-0">
        {activeTab === "chat" ? (
          <ChatView
            activeThreadId={activeThreadId}
            activeThreadTitle={activeThread?.title}
            onActiveThreadChange={setActiveThreadId}
            onNavigateToSettings={() => setActiveTab("settings")}
            onThreadsRefresh={loadThreads}
          />
        ) : activeTab === "calendar" ? (
          <CalendarView />
        ) : (
          <SettingsView />
        )}
      </main>

      {/* Right Sidebar: Life Organizer (Glanceable Calendar) */}
      {!isRightCollapsed && activeTab !== "calendar" && (
        <aside
          style={{ width: `${rightWidth}px` }}
          className="bg-[#131417] border-l border-[#22242a] flex flex-col shrink-0 relative transition-none"
        >
          {/* Left Resize Handle */}
          <div
            onMouseDown={handleRightResizeStart}
            className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-[#3b82f6]/40 transition-colors z-10"
          />

          <GlanceableCalendar
            onOpenFullCalendar={() => setActiveTab("calendar")}
            onCloseSidebar={() => setIsRightCollapsed(true)}
          />
        </aside>
      )}

      {/* Uncollapse Button */}
      {isRightCollapsed && activeTab !== "calendar" && (
        <button
          onClick={() => setIsRightCollapsed(false)}
          className="fixed right-4 top-4 z-30 p-2.5 bg-[#131417] hover:bg-[#1c1e24] border border-[#22242a] text-[#8b8f98] hover:text-[#f3f4f6] rounded-lg text-sm shadow-md transition-colors"
          title="Open Life Organizer"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="12" height="11" rx="1.5" />
            <path d="M2 6.5h12" />
          </svg>
        </button>
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
      // In browser preview, support ?window=quick-command
      const params = new URLSearchParams(window.location.search);
      setWindowLabel(params.get("window") || "main");
    }
  }, []);

  if (windowLabel === "quick-command") {
    return <QuickCommandShell />;
  }

  return <MainWindowShell />;
}

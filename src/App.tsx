import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  registerQuickCommandShortcut,
  toggleQuickCommandWindow,
} from "./core/shortcut";
import { initDatabase, connectReadWriteDatabase } from "./core/db";
import { onSyncEvent } from "./core/sync";
import { CalendarView } from "./features/calendar/CalendarView";
import { SettingsView } from "./features/settings/SettingsView";
import { getAppSettings } from "./features/settings/settings.service";
import { ChatView } from "./features/chat/ChatView";
import { QuickCommandView } from "./features/quick-command/QuickCommandView";

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
  const [promotedThreadId, setPromotedThreadId] = useState<string | undefined>();

  useEffect(() => {
    void (async () => {
      try {
        await initDatabase();
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
        setPromotedThreadId(payload.threadId);
      }
    })
      .then((unlisten) => {
        unlistenNavigation = unlisten;
      })
      .catch(() => {
        // Non-Tauri environment
      });

    let unlistenChatPromoted: (() => void) | undefined;
    void onSyncEvent("chat:promoted", (payload) => {
      setActiveTab("chat");
      setPromotedThreadId(payload.threadId);
    })
      .then((unlisten) => {
        unlistenChatPromoted = unlisten;
      })
      .catch(() => {
        // Non-Tauri environment
      });

    return () => {
      unlistenNavigation?.();
      unlistenChatPromoted?.();
    };
  }, []);

  return (
    <div className="w-screen h-screen flex bg-[#090a0c] text-[#f3f4f6] overflow-hidden select-none">
      {/* Left Rail: Navigation */}
      <aside className="w-[180px] bg-[#131417] border-r border-[#22242a] flex flex-col shrink-0">
        <div className="p-3 border-b border-[#22242a] flex items-center justify-between">
          <span className="font-medium text-sm tracking-tight text-[#f3f4f6]">
            Dialogue
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#090a0c] text-[#8b8f98] rounded border border-[#22242a]">
            v0.1
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="p-2 space-y-1 flex-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === "chat"
                ? "bg-[#1c1e24] text-[#f3f4f6] border border-[#22242a]"
                : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === "calendar"
                ? "bg-[#1c1e24] text-[#f3f4f6] border border-[#22242a]"
                : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
            }`}
          >
            Calendar
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === "settings"
                ? "bg-[#1c1e24] text-[#f3f4f6] border border-[#22242a]"
                : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
            }`}
          >
            Settings
          </button>
        </nav>

        <div className="p-2 border-t border-[#22242a] text-[10px] text-[#525660] flex items-center justify-between font-mono">
          <span>Quick: ⌘⇧Space</span>
        </div>
      </aside>

      {/* Center Main Workspace */}
      <main className="flex-1 flex flex-col bg-[#090a0c] overflow-hidden">
        {activeTab === "chat" ? (
          <ChatView
            onNavigateToSettings={() => setActiveTab("settings")}
            promotedThreadId={promotedThreadId}
          />
        ) : activeTab === "calendar" ? (
          <CalendarView />
        ) : (
          <SettingsView />
        )}
      </main>

      {/* Right Sidebar: Life Organizer (visible on chat / settings for immediate schedule awareness) */}
      {activeTab !== "calendar" && (
        <aside className="w-[340px] min-w-[280px] max-w-[480px] bg-[#131417] border-l border-[#22242a] flex flex-col shrink-0">
          <div className="p-3 border-b border-[#22242a] flex items-center justify-between">
            <span className="font-medium text-xs text-[#f3f4f6]">
              Life Organizer
            </span>
            <button
              onClick={() => setActiveTab("calendar")}
              className="text-[10px] font-mono text-[#3b82f6] hover:underline"
            >
              Open Full View →
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <CalendarView />
          </div>
        </aside>
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
      // In browser preview
      setWindowLabel("main");
    }
  }, []);

  if (windowLabel === "quick-command") {
    return <QuickCommandShell />;
  }

  return <MainWindowShell />;
}

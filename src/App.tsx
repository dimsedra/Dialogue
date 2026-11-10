import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  registerQuickCommandShortcut,
  toggleQuickCommandWindow,
} from "./core/shortcut";
import { initDatabase, connectReadWriteDatabase } from "./core/db";
import { onSyncEvent } from "./core/sync";

export function QuickCommandOverlay() {
  const [query, setQuery] = useState("");

  useEffect(() => {
    try {
      void connectReadWriteDatabase();
    } catch {
      // Running in non-Tauri preview mode
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        try {
          const win = getCurrentWebviewWindow();
          void win.hide();
        } catch {
          // Running in non-Tauri preview mode
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="w-full h-full flex items-center justify-center p-2 bg-transparent select-none">
      <div className="w-[660px] bg-[#090a0c] border border-[#22242a] rounded-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center px-4 py-3 border-b border-[#22242a]">
          <span className="text-[#3b82f6] mr-2 text-sm">✦</span>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask AI..."
            className="flex-1 bg-transparent text-[#f3f4f6] placeholder-[#525660] text-sm outline-none font-sans"
          />
          <span className="text-[11px] font-mono text-[#525660] bg-[#131417] px-2 py-0.5 rounded border border-[#22242a]">
            Esc to close
          </span>
        </div>

        <div className="px-4 py-6 text-center text-xs text-[#8b8f98]">
          Ready for commands or questions
        </div>

        <div className="px-3 py-2 bg-[#131417] border-t border-[#22242a] flex items-center justify-between text-[11px] text-[#525660]">
          <span>Dialogue Assistant</span>
          <div className="flex items-center space-x-3 font-mono">
            <span>↵ Run</span>
            <span>⌘↵ Continue in App</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MainWindowShell() {
  const [activeTab, setActiveTab] = useState<"chat" | "calendar" | "settings">(
    "chat"
  );

  useEffect(() => {
    try {
      void initDatabase();
      void registerQuickCommandShortcut(
        "CommandOrControl+Shift+Space",
        toggleQuickCommandWindow
      );
    } catch {
      // Non-Tauri environment
    }

    let unlistenNavigation: (() => void) | undefined;
    void onSyncEvent("navigation:requested", (payload) => {
      setActiveTab(payload.tab);
    })
      .then((unlisten) => {
        unlistenNavigation = unlisten;
      })
      .catch(() => {
        // Non-Tauri environment
      });

    return () => {
      unlistenNavigation?.();
    };
  }, []);

  return (
    <div className="w-screen h-screen flex bg-[#090a0c] text-[#f3f4f6] overflow-hidden select-none">
      {/* Left Rail: Navigation & Chat Threads */}
      <aside className="w-[240px] min-w-[200px] max-w-[360px] bg-[#131417] border-r border-[#22242a] flex flex-col">
        <div className="p-3 border-b border-[#22242a] flex items-center justify-between">
          <span className="font-medium text-sm tracking-tight text-[#f3f4f6]">
            Dialogue
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#090a0c] text-[#8b8f98] rounded border border-[#22242a]">
            v0.1
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="p-2 space-y-1">
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

        {/* Chat Threads Section */}
        <div className="flex-1 overflow-y-auto px-2 py-3 border-t border-[#22242a]">
          <div className="text-[11px] font-medium text-[#525660] px-2 mb-2 uppercase tracking-wider">
            Threads
          </div>
          <div className="px-2 py-4 text-center text-xs text-[#525660]">
            No conversations yet
          </div>
        </div>

        <div className="p-2 border-t border-[#22242a] text-[11px] text-[#525660] flex items-center justify-between font-mono">
          <span>Quick: ⌘⇧Space</span>
        </div>
      </aside>

      {/* Center Workspace */}
      <main className="flex-1 flex flex-col bg-[#090a0c] overflow-hidden">
        <header className="h-10 border-b border-[#22242a] flex items-center px-4 justify-between">
          <span className="text-xs font-medium text-[#8b8f98] capitalize">
            {activeTab}
          </span>
        </header>
        <div className="flex-1 p-6 flex items-center justify-center text-xs text-[#525660]">
          Active view: {activeTab}
        </div>
      </main>

      {/* Right Sidebar: Life Organizer (Calendar in v0.1) */}
      <aside className="w-[340px] min-w-[280px] max-w-[520px] bg-[#131417] border-l border-[#22242a] flex flex-col">
        <div className="p-3 border-b border-[#22242a] flex items-center justify-between">
          <span className="font-medium text-xs text-[#f3f4f6]">
            Life Organizer
          </span>
          <span className="text-[10px] font-mono text-[#8b8f98]">Calendar</span>
        </div>
        <div className="flex-1 p-4 flex items-center justify-center text-xs text-[#525660] text-center">
          Calendar module ready for MB-02 integration
        </div>
      </aside>
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
    return <QuickCommandOverlay />;
  }

  return <MainWindowShell />;
}

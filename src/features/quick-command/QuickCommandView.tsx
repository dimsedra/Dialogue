import { useState, useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { focusMainWindow } from "../../core/shortcut";
import { emitSyncEvent } from "../../core/sync";
import { runAgentTurn, type ExecutedCalendarToolSummary } from "../agent/agent.service";
import { promoteQuickExchangeToThread } from "../chat/chat.service";
import { ProviderNotConfiguredError } from "../settings/settings.schema";

interface EphemeralExchange {
  user: string;
  assistant: string;
  tools: ExecutedCalendarToolSummary[];
}

export function QuickCommandView() {
  const [query, setQuery] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeExchange, setActiveExchange] =
    useState<EphemeralExchange | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProviderUnconfigured, setIsProviderUnconfigured] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setQuery("");
    setIsStreaming(false);
    setStreamingText("");
    setActiveExchange(null);
    setErrorMessage(null);
    setIsProviderUnconfigured(false);
  };

  const closeOverlay = () => {
    try {
      const win = getCurrentWebviewWindow();
      void win.hide();
    } catch {
      // In browser preview
    }
    resetState();
  };

  useEffect(() => {
    inputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        activeExchange
      ) {
        e.preventDefault();
        void handleContinueInApp();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeExchange]);

  const handleRunCommand = async () => {
    const text = query.trim();
    if (!text || isStreaming) return;

    setIsStreaming(true);
    setStreamingText("");
    setErrorMessage(null);
    setIsProviderUnconfigured(false);
    setActiveExchange(null);

    try {
      const { replyText, toolExecutions } = await runAgentTurn({
        messages: [{ role: "user", content: text }],
        onTextDelta: (delta) => {
          setStreamingText((prev) => prev + delta);
        },
      });

      setActiveExchange({
        user: text,
        assistant: replyText,
        tools: toolExecutions,
      });
      setStreamingText("");
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        setIsProviderUnconfigured(true);
        setErrorMessage(
          "AI Provider is not configured. Please enter your API key or model endpoint in Settings."
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleContinueInApp = async () => {
    if (!activeExchange) return;

    try {
      await promoteQuickExchangeToThread({
        exchanges: [
          {
            role: "user",
            content: activeExchange.user,
          },
          {
            role: "assistant",
            content: activeExchange.assistant,
            toolExecutions: activeExchange.tools,
          },
        ],
      });

      await focusMainWindow();
      closeOverlay();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to hand off to app: ${msg}`);
    }
  };

  const handleOpenSettingsInApp = async () => {
    await emitSyncEvent("navigation:requested", {
      tab: "settings",
      timestamp: Date.now(),
    });
    await focusMainWindow();
    closeOverlay();
  };

  const renderToolBadge = (tool: ExecutedCalendarToolSummary, idx: number) => {
    if (tool.toolName === "createEvent") {
      const res = tool.result as { title?: string };
      return (
        <span
          key={idx}
          className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-950/40 border border-emerald-800 text-emerald-300 rounded text-[11px] font-mono mr-1.5 mb-1"
        >
          <span>✦ Created:</span>
          <span className="font-semibold text-emerald-200">
            {res.title ?? "Event"}
          </span>
        </span>
      );
    }

    if (tool.toolName === "updateEvent") {
      const res = tool.result as { title?: string };
      return (
        <span
          key={idx}
          className="inline-flex items-center space-x-1 px-2 py-0.5 bg-amber-950/40 border border-amber-800 text-amber-300 rounded text-[11px] font-mono mr-1.5 mb-1"
        >
          <span>↻ Updated:</span>
          <span className="font-semibold text-amber-200">
            {res.title ?? "Event"}
          </span>
        </span>
      );
    }

    if (tool.toolName === "deleteEvent") {
      return (
        <span
          key={idx}
          className="inline-flex items-center px-2 py-0.5 bg-rose-950/40 border border-rose-800 text-rose-300 rounded text-[11px] font-mono mr-1.5 mb-1"
        >
          ✕ Deleted event
        </span>
      );
    }

    if (tool.toolName === "listEvents") {
      const count = Array.isArray(tool.result) ? tool.result.length : 0;
      return (
        <span
          key={idx}
          className="inline-flex items-center px-2 py-0.5 bg-blue-950/40 border border-blue-800 text-blue-300 rounded text-[11px] font-mono mr-1.5 mb-1"
        >
          📅 Found {count} event{count === 1 ? "" : "s"}
        </span>
      );
    }

    return null;
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-2 bg-transparent select-none">
      <div className="w-[660px] bg-[#090a0c] border border-[#22242a] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[420px]">
        {/* Search Header */}
        <div className="flex items-center px-4 py-3 border-b border-[#22242a] bg-[#131417]">
          <span className="text-[#3b82f6] mr-2.5 text-sm">✦</span>
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleRunCommand();
              }
            }}
            placeholder="Ask AI..."
            className="flex-1 bg-transparent text-[#f3f4f6] placeholder-[#525660] text-sm outline-none font-sans"
          />
          <span className="text-[11px] font-mono text-[#525660] bg-[#090a0c] px-2 py-0.5 rounded border border-[#22242a]">
            Esc to close
          </span>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto flex-1 min-h-[140px] flex flex-col justify-center">
          {errorMessage ? (
            <div className="space-y-2 p-3 bg-red-950/40 border border-red-800 rounded text-xs text-red-200">
              <p>{errorMessage}</p>
              {isProviderUnconfigured && (
                <button
                  onClick={handleOpenSettingsInApp}
                  className="px-2.5 py-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded text-[11px] font-medium transition-colors"
                >
                  Configure AI Provider in App
                </button>
              )}
            </div>
          ) : isStreaming ? (
            <div className="space-y-2">
              <div className="text-xs text-[#f3f4f6] leading-relaxed whitespace-pre-wrap">
                <span>{streamingText}</span>
                <span className="inline-block w-1.5 h-3.5 bg-[#3b82f6] ml-1 animate-pulse align-middle" />
              </div>
            </div>
          ) : activeExchange ? (
            <div className="space-y-2">
              {activeExchange.tools.length > 0 && (
                <div className="flex flex-wrap items-center">
                  {activeExchange.tools.map(renderToolBadge)}
                </div>
              )}
              <div className="text-xs text-[#f3f4f6] leading-relaxed whitespace-pre-wrap">
                {activeExchange.assistant}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-[#525660] space-y-1">
              <p>Ready for fast questions or calendar commands</p>
              <p className="text-[11px] text-[#525660] font-mono">
                "What's on my schedule today?" or "Lunch with team tomorrow at 12pm"
              </p>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-3.5 py-2.5 bg-[#131417] border-t border-[#22242a] flex items-center justify-between text-[11px] text-[#525660]">
          <span className="font-medium text-[#8b8f98]">Dialogue Assistant</span>
          <div className="flex items-center space-x-3 font-mono">
            <span>↵ Run</span>
            {activeExchange && (
              <button
                onClick={handleContinueInApp}
                className="text-[#3b82f6] hover:text-[#60a5fa] transition-colors flex items-center space-x-1 font-medium"
              >
                <span>⌘↵ Continue in App</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

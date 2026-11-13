import { useState, useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { focusMainWindow } from "../../core/shortcut";
import { emitSyncEvent } from "../../core/sync";
import { runAgentTurn, type ExecutedCalendarToolSummary } from "../agent/agent.service";
import { promoteQuickExchangeToThread } from "../chat/chat.service";
import { ProviderNotConfiguredError } from "../settings/settings.schema";
import { MarkdownContent } from "../chat/MarkdownContent";
import { ToolExecutionList } from "../chat/ToolExecutionList";
import { LogoMark } from "../../components/Brand";

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
          "AI Provider is not configured. Add your API key or model endpoint in Settings."
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
      }
    } finally {
      setIsStreaming(false);
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

  return (
    <div className="flex h-full w-full items-center justify-center bg-transparent p-4 select-none">
      <div className="flex max-h-[480px] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-float">
        {/* Prompt Input Header */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3.5 sm:gap-3 sm:px-4">
          <LogoMark className="size-8 rounded-[10px]" />
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
            placeholder="Ask Dialogue or log an event…"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4 sm:text-[15.5px]"
          />
          <kbd className="shrink-0 rounded-md border border-line bg-paper px-2 py-1 font-mono text-[11.5px] font-medium leading-none text-ink-2">
            Esc
          </kbd>
        </div>

        {/* Response Body */}
        <div className="flex min-h-[176px] flex-1 flex-col justify-center overflow-y-auto p-5">
          {errorMessage ? (
            <div className="space-y-3 rounded-xl border border-rose-800/70 bg-rose-950/30 p-4 text-[13.5px] text-rose-200">
              <p className="leading-relaxed">{errorMessage}</p>
              {isProviderUnconfigured && (
                <button
                  type="button"
                  onClick={() => void handleOpenSettingsInApp()}
                  className="rounded-lg bg-calendar px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-calendar-hover"
                >
                  Configure AI Provider in Settings
                </button>
              )}
            </div>
          ) : isStreaming ? (
            streamingText ? (
              <div className="animate-rise space-y-2">
                <MarkdownContent content={streamingText} />
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 py-2"
                role="status"
                aria-label="Dialogue is thinking"
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{ animationDelay: `${i * 0.16}s` }}
                    className="size-2 animate-dot rounded-full bg-ink-2"
                  />
                ))}
              </div>
            )
          ) : activeExchange ? (
            <div className="animate-rise space-y-3">
              <MarkdownContent content={activeExchange.assistant} />
              <ToolExecutionList tools={activeExchange.tools} />
            </div>
          ) : (
            <div className="space-y-2 py-5 text-center">
              <p className="font-display text-[20px] font-medium text-ink">
                Quick command
              </p>
              <p className="text-[13.5px] text-ink-2">
                Try “What is on my schedule today?” or “Lunch with team tomorrow at 12pm”
              </p>
            </div>
          )}
        </div>

        {/* Bottom Command Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-line bg-surface px-5 py-3 text-[12px] text-ink-2">
          <span className="font-medium text-ink-2">Dialogue Command</span>
          <div className="flex items-center gap-4 font-mono">
            <span>↵ Run</span>
            {activeExchange && (
              <button
                type="button"
                onClick={() => void handleContinueInApp()}
                className="flex items-center gap-1 font-medium text-calendar-fg transition hover:text-ink"
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

import { useState, useEffect, useRef } from "react";
import {
  createChatThread,
  getChatThreadMessages,
  sendThreadMessage,
} from "./chat.service";
import type { ChatMessage } from "./chat.schema";
import type { ExecutedCalendarToolSummary } from "../agent/agent.service";
import { ProviderNotConfiguredError } from "../settings/settings.schema";

export interface ChatViewProps {
  activeThreadId?: string | null;
  activeThreadTitle?: string;
  onActiveThreadChange?: (threadId: string) => void;
  onNavigateToSettings?: () => void;
  onThreadsRefresh?: () => void;
}

export function ChatView({
  activeThreadId,
  activeThreadTitle,
  onActiveThreadChange,
  onNavigateToSettings,
  onThreadsRefresh,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamingDelta, setStreamingDelta] = useState<string>("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isProviderUnconfigured, setIsProviderUnconfigured] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    void (async () => {
      try {
        const msgs = await getChatThreadMessages(activeThreadId);
        setMessages(msgs);
        setErrorBanner(null);
        setIsProviderUnconfigured(false);
        setTimeout(scrollToBottom, 50);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorBanner(`Failed to load messages: ${msg}`);
      }
    })();
  }, [activeThreadId]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || isSending) return;

    let targetThreadId = activeThreadId;
    if (!targetThreadId) {
      try {
        const created = await createChatThread(text.slice(0, 30));
        targetThreadId = created.id;
        onActiveThreadChange?.(created.id);
        onThreadsRefresh?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorBanner(`Failed to create thread: ${msg}`);
        return;
      }
    }

    setInputText("");
    setIsSending(true);
    setStreamingDelta("");
    setErrorBanner(null);
    setIsProviderUnconfigured(false);

    // Optimistically show user message
    const tempUserMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      threadId: targetThreadId,
      role: "user",
      content: text,
      toolExecutions: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setTimeout(scrollToBottom, 50);

    try {
      const { assistantMessage } = await sendThreadMessage({
        threadId: targetThreadId,
        userText: text,
        onTextDelta: (delta) => {
          setStreamingDelta((prev) => prev + delta);
          scrollToBottom();
        },
      });

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        tempUserMsg,
        assistantMessage,
      ]);
      setStreamingDelta("");
      onThreadsRefresh?.();
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        setIsProviderUnconfigured(true);
        setErrorBanner(
          "AI Provider is not configured. Please enter your API key or model endpoint in Settings."
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorBanner(`Failed to complete turn: ${msg}`);
      }
      setInputText(text);
    } finally {
      setIsSending(false);
      setStreamingDelta("");
      setTimeout(scrollToBottom, 50);
    }
  };

  const renderToolBadge = (tool: ExecutedCalendarToolSummary, idx: number) => {
    if (tool.toolName === "createEvent") {
      const res = tool.result as { title?: string; startTime?: string };
      return (
        <div
          key={idx}
          className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-800 text-emerald-300 rounded text-[11px] font-mono my-1"
        >
          <span className="text-emerald-400 font-bold">✦</span>
          <span>Created event:</span>
          <span className="font-semibold text-emerald-100">
            {res.title ?? "Event"}
          </span>
        </div>
      );
    }

    if (tool.toolName === "updateEvent") {
      const res = tool.result as { title?: string };
      return (
        <div
          key={idx}
          className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-amber-950/40 border border-amber-800 text-amber-300 rounded text-[11px] font-mono my-1"
        >
          <span className="text-amber-400 font-bold">↻</span>
          <span>Updated event:</span>
          <span className="font-semibold text-amber-100">
            {res.title ?? "Event"}
          </span>
        </div>
      );
    }

    if (tool.toolName === "deleteEvent") {
      return (
        <div
          key={idx}
          className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-rose-950/40 border border-rose-800 text-rose-300 rounded text-[11px] font-mono my-1"
        >
          <span className="text-rose-400 font-bold">✕</span>
          <span>Deleted event</span>
        </div>
      );
    }

    if (tool.toolName === "listEvents") {
      const count = Array.isArray(tool.result) ? tool.result.length : 0;
      return (
        <div
          key={idx}
          className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-blue-950/40 border border-blue-800 text-blue-300 rounded text-[11px] font-mono my-1"
        >
          <span className="text-blue-400 font-bold">#</span>
          <span>Checked schedule: {count} events found</span>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#090a0c] text-[#f3f4f6] overflow-hidden select-none">
      {/* Top Header */}
      <header className="h-12 border-b border-[#22242a] px-6 flex items-center justify-between bg-[#090a0c] shrink-0">
        <div className="flex items-center space-x-2.5 min-w-0">
          <span className="text-xs font-semibold text-[#f3f4f6] truncate">
            {activeThreadTitle || "New Conversation"}
          </span>
        </div>
        <div className="flex items-center space-x-3 text-xs text-[#525660]">
          <span className="font-mono text-[11px]">Vercel AI SDK</span>
        </div>
      </header>

      {/* Warning / Error Banner */}
      {errorBanner && (
        <div className="px-6 py-2.5 bg-amber-950/40 border-b border-amber-800 text-amber-200 text-xs flex items-center justify-between shrink-0">
          <span>{errorBanner}</span>
          {isProviderUnconfigured && onNavigateToSettings && (
            <button
              onClick={onNavigateToSettings}
              className="ml-3 px-2.5 py-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded text-[11px] font-medium shrink-0 transition-colors"
            >
              Configure in Settings
            </button>
          )}
        </div>
      )}

      {/* Conversation Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 && !streamingDelta && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto my-auto py-12">
            <div className="w-10 h-10 rounded-lg bg-[#131417] border border-[#22242a] flex items-center justify-center text-[#3b82f6] text-base font-semibold">
              ✦
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[#f3f4f6]">
                Welcome to Dialogue
              </h3>
              <p className="text-xs text-[#8b8f98] leading-relaxed">
                Your minimalist desktop companion for conversations and calendar management.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full pt-2">
              <button
                onClick={() => void handleSendMessage("Schedule team standup tomorrow at 10am")}
                className="text-left p-3 rounded-lg bg-[#131417] hover:bg-[#18191e] border border-[#22242a] hover:border-[#363942] transition-colors"
              >
                <div className="text-xs text-[#f3f4f6] font-medium">
                  Schedule team standup
                </div>
                <div className="text-[11px] text-[#525660] font-mono mt-0.5">
                  "Schedule team standup tomorrow at 10am"
                </div>
              </button>
              <button
                onClick={() => void handleSendMessage("What events are on my calendar today?")}
                className="text-left p-3 rounded-lg bg-[#131417] hover:bg-[#18191e] border border-[#22242a] hover:border-[#363942] transition-colors"
              >
                <div className="text-xs text-[#f3f4f6] font-medium">
                  Check today's agenda
                </div>
                <div className="text-[11px] text-[#525660] font-mono mt-0.5">
                  "What events are on my calendar today?"
                </div>
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              {isUser ? (
                /* User Message: Sleek card */
                <div className="max-w-[70%] rounded-lg px-4 py-2.5 text-xs bg-[#18191e] text-[#f3f4f6] border border-[#22242a] shadow-sm">
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </p>
                </div>
              ) : (
                /* Assistant Message: Editorial layout, unboxed */
                <div className="max-w-[85%] text-xs space-y-2">
                  {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                    <div className="flex flex-col space-y-1 mb-1">
                      {msg.toolExecutions.map(renderToolBadge)}
                    </div>
                  )}
                  <div className="text-[#f3f4f6] leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Active Streaming Response */}
        {streamingDelta && (
          <div className="flex flex-col items-start">
            <div className="max-w-[85%] text-xs text-[#f3f4f6] leading-relaxed whitespace-pre-wrap">
              <span>{streamingDelta}</span>
              <span className="inline-block w-1.5 h-3.5 bg-[#3b82f6] ml-1 animate-pulse align-middle" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Bottom Input Dock */}
      <footer className="p-4 bg-[#090a0c] border-t border-[#22242a]">
        <div className="max-w-3xl mx-auto flex items-center space-x-2 bg-[#131417] border border-[#22242a] rounded-lg px-3.5 py-2.5 focus-within:border-[#3b82f6] focus-within:ring-1 focus-within:ring-[#3b82f6]/40 transition-colors shadow-lg">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            placeholder="Ask Dialogue anything or schedule an event..."
            className="flex-1 bg-transparent text-xs text-[#f3f4f6] placeholder-[#525660] outline-none font-sans"
          />
          <button
            onClick={() => void handleSendMessage()}
            disabled={isSending || !inputText.trim()}
            className="px-2.5 py-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs font-medium rounded transition-colors disabled:opacity-30 font-mono"
            title="Send message (Enter)"
          >
            ↵
          </button>
        </div>
      </footer>
    </div>
  );
}

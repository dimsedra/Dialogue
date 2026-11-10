import { useState, useEffect, useRef } from "react";
import {
  listChatThreads,
  createChatThread,
  getChatThreadMessages,
  deleteChatThread,
  sendThreadMessage,
} from "./chat.service";
import type { ChatThread, ChatMessage } from "./chat.schema";
import type { ExecutedCalendarToolSummary } from "../agent/agent.service";
import { ProviderNotConfiguredError } from "../settings/settings.schema";

export interface ChatViewProps {
  onNavigateToSettings?: () => void;
  promotedThreadId?: string;
}

export function ChatView({
  onNavigateToSettings,
  promotedThreadId,
}: ChatViewProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamingDelta, setStreamingDelta] = useState<string>("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isProviderUnconfigured, setIsProviderUnconfigured] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadThreads = async (selectId?: string) => {
    try {
      const allThreads = await listChatThreads();
      setThreads(allThreads);

      if (selectId) {
        setActiveThreadId(selectId);
        void loadMessages(selectId);
      } else if (allThreads.length > 0 && !activeThreadId) {
        setActiveThreadId(allThreads[0].id);
        void loadMessages(allThreads[0].id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(`Failed to load conversations: ${msg}`);
    }
  };

  const loadMessages = async (threadId: string) => {
    try {
      const msgs = await getChatThreadMessages(threadId);
      setMessages(msgs);
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(`Failed to load messages: ${msg}`);
    }
  };

  useEffect(() => {
    void loadThreads(promotedThreadId);
  }, [promotedThreadId]);

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setErrorBanner(null);
    setIsProviderUnconfigured(false);
    void loadMessages(threadId);
  };

  const handleCreateThread = async () => {
    try {
      const newThread = await createChatThread();
      setThreads((prev) => [newThread, ...prev]);
      setActiveThreadId(newThread.id);
      setMessages([]);
      setErrorBanner(null);
      setIsProviderUnconfigured(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(`Failed to create thread: ${msg}`);
    }
  };

  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    try {
      await deleteChatThread(threadId);
      const remaining = threads.filter((t) => t.id !== threadId);
      setThreads(remaining);
      if (activeThreadId === threadId) {
        if (remaining.length > 0) {
          setActiveThreadId(remaining[0].id);
          void loadMessages(remaining[0].id);
        } else {
          setActiveThreadId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(`Failed to delete thread: ${msg}`);
    }
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    let targetThreadId = activeThreadId;
    if (!targetThreadId) {
      const created = await createChatThread(text.slice(0, 30));
      targetThreadId = created.id;
      setActiveThreadId(created.id);
      setThreads((prev) => [created, ...prev]);
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
      void loadThreads(); // refresh thread title if auto-titled
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
      // Restore user text so they don't lose it
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
          className="inline-flex items-center space-x-1.5 px-2 py-1 bg-emerald-950/40 border border-emerald-800 text-emerald-300 rounded text-[11px] font-mono my-1"
        >
          <span>✦ Created event:</span>
          <span className="font-semibold text-emerald-200">
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
          className="inline-flex items-center space-x-1.5 px-2 py-1 bg-amber-950/40 border border-amber-800 text-amber-300 rounded text-[11px] font-mono my-1"
        >
          <span>↻ Updated event:</span>
          <span className="font-semibold text-amber-200">
            {res.title ?? "Event"}
          </span>
        </div>
      );
    }

    if (tool.toolName === "deleteEvent") {
      return (
        <div
          key={idx}
          className="inline-flex items-center space-x-1.5 px-2 py-1 bg-rose-950/40 border border-rose-800 text-rose-300 rounded text-[11px] font-mono my-1"
        >
          <span>✕ Deleted event</span>
        </div>
      );
    }

    if (tool.toolName === "listEvents") {
      const count = Array.isArray(tool.result) ? tool.result.length : 0;
      return (
        <div
          key={idx}
          className="inline-flex items-center space-x-1.5 px-2 py-1 bg-blue-950/40 border border-blue-800 text-blue-300 rounded text-[11px] font-mono my-1"
        >
          <span>📅 Checked schedule: {count} events found</span>
        </div>
      );
    }

    return null;
  };

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="flex-1 flex h-full bg-[#090a0c] text-[#f3f4f6] overflow-hidden select-none">
      {/* Threads Rail */}
      <aside className="w-[240px] bg-[#131417] border-r border-[#22242a] flex flex-col">
        <div className="p-3 border-b border-[#22242a] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#f3f4f6]">
            Conversations
          </span>
          <button
            onClick={handleCreateThread}
            className="px-2 py-1 bg-[#1c1e24] hover:bg-[#252830] border border-[#22242a] text-[#f3f4f6] rounded text-[11px] font-medium transition-colors"
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threads.length === 0 ? (
            <div className="p-4 text-center text-xs text-[#525660]">
              No conversations yet
            </div>
          ) : (
            threads.map((t) => {
              const isActive = t.id === activeThreadId;
              return (
                <div
                  key={t.id}
                  onClick={() => handleSelectThread(t.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-md text-xs cursor-pointer transition-colors ${
                    isActive
                      ? "bg-[#1c1e24] text-[#f3f4f6] border border-[#22242a]"
                      : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
                  }`}
                >
                  <span className="truncate pr-2">{t.title}</span>
                  <button
                    onClick={(e) => handleDeleteThread(e, t.id)}
                    className="opacity-0 group-hover:opacity-100 text-[#525660] hover:text-red-400 text-xs transition-opacity"
                    title="Delete conversation"
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Conversation Workspace */}
      <section className="flex-1 flex flex-col bg-[#090a0c] overflow-hidden">
        {/* Chat Header */}
        <header className="h-10 border-b border-[#22242a] px-4 flex items-center justify-between bg-[#131417]">
          <span className="text-xs font-semibold text-[#f3f4f6] truncate max-w-md">
            {activeThread ? activeThread.title : "Dialogue Chat"}
          </span>
        </header>

        {/* Warning banner */}
        {errorBanner && (
          <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-800 text-amber-200 text-xs flex items-center justify-between">
            <span>{errorBanner}</span>
            {isProviderUnconfigured && onNavigateToSettings && (
              <button
                onClick={onNavigateToSettings}
                className="ml-3 px-2 py-0.5 bg-[#3b82f6] text-white rounded text-[11px] font-medium shrink-0"
              >
                Go to Settings
              </button>
            )}
          </div>
        )}

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !streamingDelta && (
            <div className="h-full flex flex-col items-center justify-center text-center text-xs text-[#525660] space-y-2">
              <span className="text-[#3b82f6] text-lg">✦</span>
              <p>Ask Dialogue anything or schedule calendar events.</p>
              <p className="text-[11px] text-[#525660] font-mono">
                "Schedule lunch with Alex tomorrow at 12pm"
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-3.5 py-2.5 text-xs ${
                    isUser
                      ? "bg-[#1c1e24] text-[#f3f4f6] border border-[#22242a]"
                      : "bg-[#131417] text-[#f3f4f6] border border-[#22242a]"
                  }`}
                >
                  {/* Tool execution badges */}
                  {!isUser && msg.toolExecutions && msg.toolExecutions.length > 0 && (
                    <div className="flex flex-col space-y-1 mb-2">
                      {msg.toolExecutions.map(renderToolBadge)}
                    </div>
                  )}

                  <p className="whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Active Streaming Response */}
          {streamingDelta && (
            <div className="flex flex-col items-start">
              <div className="max-w-[75%] rounded-lg px-3.5 py-2.5 text-xs bg-[#131417] text-[#f3f4f6] border border-[#22242a]">
                <p className="whitespace-pre-wrap leading-relaxed inline">
                  {streamingDelta}
                </p>
                <span className="inline-block w-1.5 h-3.5 bg-[#3b82f6] ml-1 animate-pulse align-middle" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <footer className="p-3 border-t border-[#22242a] bg-[#131417]">
          <div className="flex items-center space-x-2 bg-[#090a0c] border border-[#22242a] rounded-lg px-3 py-2 focus-within:border-[#3b82f6] transition-colors">
            <input
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
              onClick={handleSendMessage}
              disabled={isSending || !inputText.trim()}
              className="px-2.5 py-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs font-medium rounded transition-colors disabled:opacity-40 font-mono"
            >
              ↵
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

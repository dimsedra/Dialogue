import { useState, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import {
  ArrowUp,
  CalendarDays,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
} from "lucide-react";
import {
  createChatThread,
  getChatThreadMessages,
  sendThreadMessage,
} from "./chat.service";
import type { ChatMessage } from "./chat.schema";
import { ProviderNotConfiguredError } from "../settings/settings.schema";
import { MarkdownContent } from "./MarkdownContent";
import { ToolExecutionList } from "./ToolExecutionList";
import { LogoMark } from "../../components/Brand";
import { PILLARS } from "../../components/pillars";
import { cn } from "../../core/cn";

export interface ChatViewProps {
  activeThreadId?: string | null;
  activeThreadTitle?: string;
  draftOverride?: string;
  focusTick?: number;
  leftOpen?: boolean;
  rightOpen?: boolean;
  onActiveThreadChange?: (threadId: string) => void;
  onNavigateToSettings?: () => void;
  onThreadsRefresh?: () => void;
  onViewCalendarEvent?: (startTimeIso: string, eventId?: string) => void;
  onOpenLeft?: () => void;
  onToggleRight?: () => void;
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function ChatView({
  activeThreadId,
  activeThreadTitle,
  draftOverride,
  focusTick = 0,
  leftOpen = true,
  rightOpen = true,
  onActiveThreadChange,
  onNavigateToSettings,
  onThreadsRefresh,
  onViewCalendarEvent,
  onOpenLeft,
  onToggleRight,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamingDelta, setStreamingDelta] = useState<string>("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isProviderUnconfigured, setIsProviderUnconfigured] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastThreadRef = useRef<string | null | undefined>(activeThreadId);

  useEffect(() => {
    if (draftOverride !== undefined) {
      setInputText(draftOverride);
    }
  }, [draftOverride, focusTick]);

  useEffect(() => {
    if (focusTick > 0) {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }, [focusTick]);

  // Auto-grow textarea up to ~6 lines (168px)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [inputText]);

  // Scroll smoothly on new messages, keep empty state anchored at the top
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const switched = lastThreadRef.current !== activeThreadId;
    lastThreadRef.current = activeThreadId;
    if (messages.length === 0 && !streamingDelta && !isSending) {
      el.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    el.scrollTo({
      top: el.scrollHeight,
      behavior: switched ? "instant" : "smooth",
    });
  }, [activeThreadId, messages.length, streamingDelta, isSending]);

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
        const created = await createChatThread(text.slice(0, 34));
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

    const tempUserMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      threadId: targetThreadId,
      role: "user",
      content: text,
      toolExecutions: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const { assistantMessage } = await sendThreadMessage({
        threadId: targetThreadId,
        userText: text,
        onTextDelta: (delta) => {
          setStreamingDelta((prev) => prev + delta);
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
          "AI Provider is not configured. Add your API key or local endpoint in Settings."
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorBanner(`Failed to complete turn: ${msg}`);
      }
      setInputText(text);
    } finally {
      setIsSending(false);
      setStreamingDelta("");
    }
  };

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const hasCalendarActivity = messages.some(
    (m) => m.toolExecutions && m.toolExecutions.length > 0
  );
  const canSend = inputText.trim().length > 0 && !isSending;
  const isEmpty = messages.length === 0 && !streamingDelta && !isSending;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-paper text-ink">
      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
        <div className="flex min-w-0 items-center gap-2">
          {!leftOpen && onOpenLeft && (
            <button
              type="button"
              onClick={onOpenLeft}
              aria-label="Show sidebar"
              title="Show sidebar"
              className="-ml-1 mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-ink-2 transition hover:bg-active hover:text-ink"
            >
              <PanelLeftOpen className="size-[18px]" />
            </button>
          )}
          <h1 className="truncate text-[15.5px] font-semibold text-ink">
            {activeThreadTitle || "New conversation"}
          </h1>
          {hasCalendarActivity && (
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-calendar-tint px-2.5 py-1 text-[12px] font-medium leading-none text-calendar-fg sm:inline-flex">
              <CalendarDays className="size-3" />
              Calendar
            </span>
          )}
        </div>

        {onToggleRight && (
          <button
            type="button"
            onClick={onToggleRight}
            aria-pressed={rightOpen}
            title={rightOpen ? "Hide quick look" : "Show quick look"}
            className={cn(
              "flex h-8 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-[13px] font-medium transition",
              rightOpen
                ? "border-line bg-surface text-ink"
                : "border-transparent text-ink-2 hover:bg-active hover:text-ink"
            )}
          >
            {rightOpen ? (
              <PanelRightClose className="size-[17px]" />
            ) : (
              <PanelRight className="size-[17px]" />
            )}
            <span className="hidden md:inline">Quick look</span>
          </button>
        )}
      </header>

      {/* Warning / Error Banner */}
      {errorBanner && (
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-amber-800/70 bg-amber-950/35 px-5 py-3 text-[13px] text-amber-200">
          <span className="leading-relaxed">{errorBanner}</span>
          {isProviderUnconfigured && onNavigateToSettings && (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="shrink-0 rounded-lg bg-calendar px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-calendar-hover"
            >
              Configure in Settings
            </button>
          )}
        </div>
      )}

      {/* Conversation Stream */}
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="mx-auto flex min-h-full w-full max-w-[46rem] flex-col justify-start px-5 py-6 sm:justify-center sm:px-6 sm:py-10">
            <LogoMark className="size-11 rounded-[12px] sm:size-12 sm:rounded-[14px]" />
            <h2 className="mt-5 font-display text-[28px] font-medium leading-[1.15] tracking-[-0.015em] text-ink sm:mt-6 sm:text-[34px]">
              What is on your plate today?
            </h2>
            <p className="mt-2.5 max-w-[34rem] text-[14.5px] leading-relaxed text-ink-2 sm:mt-3 sm:text-[15.5px]">
              Tell me about the appointment you keep postponing, or ask what your
              week looks like. I will handle it directly on this device.
            </p>
            <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2">
              {PILLARS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void handleSendMessage(p.suggestion)}
                  className="group flex flex-col items-start gap-2.5 rounded-2xl border border-line bg-surface p-3.5 text-left transition hover:-translate-y-0.5 hover:border-line-strong hover:bg-sunken sm:gap-3 sm:p-4"
                >
                  <span className="flex w-full items-center justify-between">
                    <span
                      className={cn(
                        "grid size-8 place-items-center rounded-lg",
                        p.tint,
                        p.fg
                      )}
                    >
                      <p.icon className="size-[17px]" />
                    </span>
                    <span className="text-[12px] font-medium text-ink-2">
                      {p.promptTag}
                    </span>
                  </span>
                  <span className="text-[14px] font-medium leading-snug text-ink sm:text-[14.5px]">
                    “{p.suggestion}”
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-8 px-6 pb-6 pt-8">
            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex animate-rise justify-end">
                    <p className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-line bg-sunken px-4 py-3 text-[15.5px] leading-[1.6] text-ink">
                      {msg.content}
                    </p>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex animate-rise gap-3.5">
                  <LogoMark className="mt-0.5 size-8 rounded-[10px]" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">
                        Dialogue
                      </span>
                      <span className="text-[12px] text-ink-2">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    </div>
                    <MarkdownContent content={msg.content} />
                    <ToolExecutionList
                      tools={msg.toolExecutions}
                      onViewEvent={onViewCalendarEvent}
                    />
                  </div>
                </div>
              );
            })}

            {isSending && !streamingDelta && (
              <div
                className="flex animate-rise gap-3.5"
                role="status"
                aria-label="Dialogue is thinking"
              >
                <LogoMark className="mt-0.5 size-8 rounded-[10px]" />
                <div className="flex h-9 items-center gap-1.5 pl-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{ animationDelay: `${i * 0.16}s` }}
                      className="size-2 animate-dot rounded-full bg-ink-2"
                    />
                  ))}
                </div>
              </div>
            )}

            {streamingDelta && (
              <div className="flex animate-rise gap-3.5">
                <LogoMark className="mt-0.5 size-8 rounded-[10px]" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <span className="text-[13.5px] font-semibold text-ink">
                      Dialogue
                    </span>
                  </div>
                  <MarkdownContent content={streamingDelta} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auto-Growing Composer */}
      <div className="shrink-0 pb-4 pt-2">
        <div className="mx-auto w-full max-w-[46rem] px-6">
          <div className="rounded-2xl border border-line-strong bg-surface transition focus-within:border-calendar focus-within:ring-2 focus-within:ring-calendar/20">
            <label className="sr-only" htmlFor="dialogue-composer">
              Message Dialogue
            </label>
            <textarea
              id="dialogue-composer"
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Tell me what is on your plate…"
              className="block max-h-[168px] w-full resize-none bg-transparent px-4 pb-1.5 pt-3.5 text-[15.5px] leading-[1.6] text-ink outline-none placeholder:text-ink-4"
            />
            <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pl-4">
              <p className="text-[12px] text-ink-2">
                <kbd className="font-sans font-semibold text-ink">Enter</kbd> to send ·{" "}
                <kbd className="font-sans font-semibold text-ink">Shift + Enter</kbd> for a new line
              </p>
              <button
                type="button"
                onClick={() => void handleSendMessage()}
                disabled={!canSend}
                aria-label="Send message"
                className={cn(
                  "grid size-9 place-items-center rounded-xl transition",
                  canSend
                    ? "bg-ink text-paper hover:bg-white active:scale-95"
                    : "bg-sunken text-ink-4"
                )}
              >
                <ArrowUp className="size-[18px]" strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <p className="mt-2.5 text-center text-[12px] text-ink-4">
            Dialogue sticks to your calendar, to-dos, habits and money, and keeps all of it on this device.
          </p>
        </div>
      </div>
    </div>
  );
}

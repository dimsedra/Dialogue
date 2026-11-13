import { useState } from "react";
import { CalendarCheck, CalendarSearch, CalendarX2, Undo2 } from "lucide-react";
import type { ExecutedCalendarToolSummary } from "../agent/agent.service";
import { deleteCalendarEvent } from "../calendar/calendar.service";

interface CalendarToolEventPayload {
  id?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  description?: string;
}

interface ToolExecutionListProps {
  tools: ExecutedCalendarToolSummary[];
  onViewEvent?: (startTimeIso: string, eventId?: string) => void;
  onEventUndone?: (deletedId: string) => void;
}

function formatEventRange(startIso?: string, allDay?: boolean): string {
  if (!startIso) return "Scheduled";
  const date = new Date(startIso);
  if (Number.isNaN(date.getTime())) return "Scheduled";

  const dayPart = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (allDay) return `${dayPart} · All day`;

  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dayPart} · ${timePart}`;
}

export function ToolExecutionList({
  tools,
  onViewEvent,
  onEventUndone,
}: ToolExecutionListProps) {
  const [undoneIds, setUndoneIds] = useState<string[]>([]);
  const [undoError, setUndoError] = useState<string | null>(null);

  if (!tools || tools.length === 0) return null;

  const handleUndo = async (eventId: string) => {
    setUndoError(null);
    try {
      await deleteCalendarEvent({ id: eventId, scope: "entire_series" });
      setUndoneIds((prev) => [...prev, eventId]);
      onEventUndone?.(eventId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUndoError(`Could not undo event: ${msg}`);
    }
  };

  return (
    <div className="mt-3 space-y-2.5">
      {tools.map((tool, idx) => {
        if (tool.toolName === "createEvent" || tool.toolName === "updateEvent") {
          const payload = (tool.result ?? {}) as CalendarToolEventPayload;
          const isUndone = Boolean(payload.id && undoneIds.includes(payload.id));

          if (isUndone) {
            return (
              <div
                key={idx}
                className="flex max-w-[26rem] items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-[13.5px] text-ink-2"
              >
                <CalendarX2 className="size-4 shrink-0" />
                <span>Removed from your calendar.</span>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="flex max-w-[26rem] overflow-hidden rounded-xl border border-line bg-surface"
            >
              <span className="w-1 shrink-0 bg-calendar" />
              <div className="min-w-0 flex-1 p-3.5">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-calendar-fg">
                  <CalendarCheck className="size-3.5 shrink-0" />
                  {tool.toolName === "createEvent"
                    ? "On your calendar"
                    : "Updated on calendar"}
                </p>
                <p className="mt-1.5 truncate text-[15.5px] font-semibold leading-snug text-ink">
                  {payload.title ?? "Calendar event"}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  {formatEventRange(payload.startTime, payload.allDay)}
                </p>

                {(onViewEvent || (tool.toolName === "createEvent" && payload.id)) && (
                  <div className="mt-3 flex items-center gap-1.5">
                    {onViewEvent && payload.startTime && (
                      <button
                        type="button"
                        onClick={() => onViewEvent(payload.startTime!, payload.id)}
                        className="h-8 rounded-lg border border-line bg-sunken px-3 text-[12.5px] font-medium text-ink transition hover:border-line-strong hover:bg-active"
                      >
                        View in calendar
                      </button>
                    )}
                    {tool.toolName === "createEvent" && payload.id && (
                      <button
                        type="button"
                        onClick={() => void handleUndo(payload.id!)}
                        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-ink-2 transition hover:bg-active hover:text-ink"
                      >
                        <Undo2 className="size-3.5" />
                        Undo
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        }

        if (tool.toolName === "deleteEvent") {
          return (
            <div
              key={idx}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] font-medium text-ink-2"
            >
              <CalendarX2 className="size-3.5 text-rose-400" />
              <span>Removed event from calendar</span>
            </div>
          );
        }

        if (tool.toolName === "listEvents") {
          const count = Array.isArray(tool.result) ? tool.result.length : 0;
          return (
            <div
              key={idx}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] font-medium text-ink-2"
            >
              <CalendarSearch className="size-3.5 text-calendar-fg" />
              <span>
                Checked schedule · {count} event{count === 1 ? "" : "s"} found
              </span>
            </div>
          );
        }

        return null;
      })}

      {undoError && (
        <p className="text-[12.5px] text-rose-300">{undoError}</p>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  listCalendarEventsInRange,
  createCalendarEvent,
  type ExpandedCalendarEventInstance,
} from "./calendar.service";
import { onSyncEvent } from "../../core/sync";

export interface GlanceableCalendarProps {
  onOpenFullCalendar?: () => void;
  onCloseSidebar?: () => void;
}

export function GlanceableCalendar({
  onOpenFullCalendar,
  onCloseSidebar,
}: GlanceableCalendarProps) {
  const [events, setEvents] = useState<ExpandedCalendarEventInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickTime, setQuickTime] = useState("");

  const loadUpcomingEvents = async () => {
    try {
      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).toISOString();
      const endOfRange = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 7,
        23,
        59,
        59,
        999
      ).toISOString();

      const instances = await listCalendarEventsInRange({
        rangeStart: startOfToday,
        rangeEnd: endOfRange,
      });

      setEvents(instances);
    } catch {
      // Fallback gracefully if database is still initializing
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUpcomingEvents();

    let unlisten: (() => void) | undefined;
    void onSyncEvent("calendar:updated", () => {
      void loadUpcomingEvents();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;

    try {
      const now = new Date();
      const startTime = quickTime
        ? new Date(`${now.toISOString().slice(0, 10)}T${quickTime}:00`).toISOString()
        : new Date(now.getTime() + 3600000).toISOString();
      const endTime = new Date(Date.parse(startTime) + 3600000).toISOString();

      await createCalendarEvent({
        title: quickTitle.trim(),
        startTime,
        endTime,
      });

      setQuickTitle("");
      setQuickTime("");
      setIsQuickAddOpen(false);
      void loadUpcomingEvents();
    } catch {
      // Graceful error recovery
    }
  };

  const now = new Date();
  const todayDateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const groupedEvents: Record<string, ExpandedCalendarEventInstance[]> = {};
  for (const ev of events) {
    const evDate = new Date(ev.startTime);
    const isToday = evDate.toDateString() === now.toDateString();
    const isTomorrow =
      new Date(now.getTime() + 86400000).toDateString() === evDate.toDateString();

    let headerKey = evDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    if (isToday) headerKey = "Today";
    else if (isTomorrow) headerKey = "Tomorrow";

    if (!groupedEvents[headerKey]) {
      groupedEvents[headerKey] = [];
    }
    groupedEvents[headerKey].push(ev);
  }

  const formatEventTime = (ev: ExpandedCalendarEventInstance) => {
    if (ev.allDay) return "All day";
    const start = new Date(ev.startTime);
    const end = new Date(ev.endTime);
    const sStr = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const eStr = end.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${sStr} - ${eStr}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#131417] text-[#f3f4f6] select-none">
      {/* Sidebar Header */}
      <div className="px-4 py-3.5 border-b border-[#22242a] flex items-center justify-between bg-[#131417]">
        <div>
          <h2 className="text-xs font-semibold text-[#f3f4f6] tracking-tight">
            Life Organizer
          </h2>
          <p className="text-[11px] text-[#8b8f98] font-mono mt-0.5">
            {todayDateStr}
          </p>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsQuickAddOpen((prev) => !prev)}
            className="px-2 py-1 bg-[#1c1e24] hover:bg-[#252830] border border-[#22242a] text-[#f3f4f6] rounded text-[11px] font-medium transition-colors"
            title="Quick add event"
          >
            {isQuickAddOpen ? "Cancel" : "+ Add"}
          </button>
          {onOpenFullCalendar && (
            <button
              onClick={onOpenFullCalendar}
              className="p-1.5 text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#1c1e24] rounded text-xs transition-colors"
              title="Open full calendar view"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 12L12 4M12 4H6M12 4V10" />
              </svg>
            </button>
          )}
          {onCloseSidebar && (
            <button
              onClick={onCloseSidebar}
              className="p-1.5 text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#1c1e24] rounded text-xs transition-colors"
              title="Collapse sidebar"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 3L11 8L6 13" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Quick Add Drawer */}
      {isQuickAddOpen && (
        <form
          onSubmit={handleQuickAdd}
          className="p-3 bg-[#090a0c] border-b border-[#22242a] space-y-2"
        >
          <input
            autoFocus
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="Event title..."
            className="w-full bg-[#131417] border border-[#22242a] rounded px-2.5 py-1.5 text-xs text-[#f3f4f6] placeholder-[#525660] outline-none focus:border-[#3b82f6] transition-colors"
          />
          <div className="flex items-center space-x-2">
            <input
              type="time"
              value={quickTime}
              onChange={(e) => setQuickTime(e.target.value)}
              className="bg-[#131417] border border-[#22242a] rounded px-2 py-1 text-xs text-[#f3f4f6] font-mono outline-none focus:border-[#3b82f6]"
            />
            <button
              type="submit"
              className="flex-1 py-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs font-medium rounded transition-colors"
            >
              Save Event
            </button>
          </div>
        </form>
      )}

      {/* Upcoming Events List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-xs text-[#525660]">
            Loading schedule...
          </div>
        ) : Object.keys(groupedEvents).length === 0 ? (
          <div className="text-center py-12 text-xs text-[#525660] space-y-2">
            <p>No events in the next 7 days</p>
            <p className="text-[11px] text-[#525660]">Click "+ Add" to log an event</p>
          </div>
        ) : (
          Object.entries(groupedEvents).map(([dayHeader, dayEvents]) => (
            <div key={dayHeader} className="space-y-1.5">
              <div className="text-[10px] font-semibold text-[#8b8f98] uppercase tracking-wider px-1">
                {dayHeader}
              </div>

              <div className="space-y-1">
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="group flex items-start space-x-2.5 p-2 rounded-md bg-[#090a0c] border border-[#22242a] hover:border-[#363942] transition-colors"
                  >
                    <span
                      className="w-2 h-2 rounded-full mt-1 shrink-0"
                      style={{ backgroundColor: ev.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[#f3f4f6] truncate">
                          {ev.title}
                        </span>
                        {ev.isRecurring && (
                          <span
                            className="text-[10px] text-[#8b8f98] font-mono shrink-0 ml-1"
                            title={
                              ev.isOverride
                                ? "Modified occurrence"
                                : "Recurring series"
                            }
                          >
                            {ev.isOverride ? "mod" : "rep"}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-[#8b8f98] mt-0.5">
                        {formatEventTime(ev)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Footer Action */}
      <div className="px-4 py-2.5 border-t border-[#22242a] bg-[#131417] flex items-center justify-between text-[11px] text-[#525660]">
        <span>{events.length} upcoming events</span>
        {onOpenFullCalendar && (
          <button
            onClick={onOpenFullCalendar}
            className="text-[#3b82f6] hover:underline font-medium"
          >
            Full Calendar →
          </button>
        )}
      </div>
    </div>
  );
}

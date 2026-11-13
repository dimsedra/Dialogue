import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  PanelRightClose,
  Plus,
  X,
} from "lucide-react";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEventsInRange,
  type ExpandedCalendarEventInstance,
} from "./calendar.service";
import { onSyncEvent } from "../../core/sync";
import { cn } from "../../core/cn";
import { StatusChip } from "../../components/Brand";
import { PILLARS, PILLAR_BY_ID, type Pillar, type PillarId } from "../../components/pillars";

export interface GlanceableCalendarProps {
  tab?: PillarId;
  selectedDate?: Date;
  highlightedEventId?: string | null;
  onTabChange?: (tab: PillarId) => void;
  onSelectDate?: (date: Date) => void;
  onOpenFullCalendar?: () => void;
  onCloseSidebar?: () => void;
  onWishPillar?: (promptPrefix: string) => void;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function diffDays(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcA - utcB) / 86_400_000);
}

function dayLabel(d: Date, today: Date): string {
  const delta = diffDays(d, today);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayIndex);
  return Array.from({ length: 42 }, (_, i) => {
    return new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i
    );
  });
}

function formatEventTime(ev: ExpandedCalendarEventInstance): string {
  if (ev.allDay) return "All day";
  const start = new Date(ev.startTime);
  const end = new Date(ev.endTime);
  if (Number.isNaN(start.getTime())) return "";
  const sStr = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (Number.isNaN(end.getTime())) return sStr;
  const eStr = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${sStr} – ${eStr}`;
}

function PlannedSketch({ id }: { id: PillarId }) {
  if (id === "todo") {
    return (
      <ul className="space-y-3.5">
        {[
          { w: "w-3/4", done: true },
          { w: "w-2/3", done: false },
          { w: "w-1/2", done: false },
        ].map((row, idx) => (
          <li key={idx} className="flex items-center gap-3">
            <span
              className={cn(
                "size-5 shrink-0 rounded-full border-2",
                row.done ? "border-todo bg-todo-tint" : "border-line-strong"
              )}
            />
            <span
              className={cn(
                "h-2.5 rounded-full bg-active",
                row.w,
                row.done && "opacity-60"
              )}
            />
          </li>
        ))}
      </ul>
    );
  }

  if (id === "habit") {
    const rows = [
      [1, 1, 0, 1, 1, 0, 0],
      [1, 0, 0, 1, 0, 0, 0],
      [1, 1, 1, 1, 0, 1, 0],
    ];
    return (
      <ul className="space-y-3.5">
        {rows.map((dots, idx) => (
          <li key={idx} className="flex items-center justify-between gap-4">
            <span
              className={cn(
                "h-2.5 rounded-full bg-active",
                idx === 0 ? "w-20" : idx === 1 ? "w-14" : "w-24"
              )}
            />
            <span className="flex gap-1.5">
              {dots.map((on, dotIdx) => (
                <span
                  key={dotIdx}
                  className={cn(
                    "size-4 rounded-full",
                    on ? "bg-habit/55" : "bg-active"
                  )}
                />
              ))}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3.5">
        {["w-24", "w-32", "w-20"].map((w, idx) => (
          <li key={idx} className="flex items-center justify-between gap-4">
            <span className={cn("h-2.5 rounded-full bg-active", w)} />
            <span className="h-2.5 w-12 rounded-full bg-active" />
          </li>
        ))}
      </ul>
      <div className="h-2 overflow-hidden rounded-full bg-active">
        <div className="h-full w-2/3 rounded-full bg-finance/55" />
      </div>
    </div>
  );
}

function PlannedPillarView({
  pillar,
  onWish,
}: {
  pillar: Pillar;
  onWish: () => void;
}) {
  return (
    <div className="px-5 pb-8">
      <section className="rounded-2xl border border-line bg-paper p-4">
        <h4 className="text-[12px] font-semibold tracking-wide text-ink-2">
          What it will do
        </h4>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink">
          {pillar.promise}
        </p>
      </section>

      <section
        aria-hidden
        className="mt-4 select-none rounded-2xl border border-dashed border-line-strong p-4"
      >
        <p className="mb-4 text-[12px] font-semibold tracking-wide text-ink-2">
          A rough sketch
        </p>
        <PlannedSketch id={pillar.id} />
      </section>

      <button
        type="button"
        onClick={onWish}
        className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-sunken text-[13.5px] font-semibold text-ink transition hover:border-ink-2 hover:bg-active"
      >
        <MessageSquarePlus className="size-4" />
        Tell Dialogue what you would want
      </button>
    </div>
  );
}

export function GlanceableCalendar({
  tab: controlledTab,
  selectedDate: controlledSelected,
  highlightedEventId = null,
  onTabChange,
  onSelectDate,
  onOpenFullCalendar,
  onCloseSidebar,
  onWishPillar,
}: GlanceableCalendarProps) {
  const [today] = useState(() => startOfDay(new Date()));
  const [internalTab, setInternalTab] = useState<PillarId>("calendar");
  const [internalSelected, setInternalSelected] = useState<Date>(today);

  const tab = controlledTab ?? internalTab;
  const selected = controlledSelected ?? internalSelected;

  const setTab = (next: PillarId) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

  const setSelected = (next: Date) => {
    const normalized = startOfDay(next);
    setInternalSelected(normalized);
    onSelectDate?.(normalized);
  };

  const [viewMonth, setViewMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1)
  );
  const [events, setEvents] = useState<ExpandedCalendarEventInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickTime, setQuickTime] = useState("09:00");
  const [quickError, setQuickError] = useState<string | null>(null);

  useEffect(() => {
    setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [selected]);

  const cells = useMemo(
    () => monthMatrix(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth]
  );

  const loadMonthEvents = useCallback(async () => {
    try {
      const rangeStartDate = new Date(
        cells[0].getFullYear(),
        cells[0].getMonth(),
        cells[0].getDate() - 1
      );
      const lastCell = cells[cells.length - 1];
      const upcomingHorizon = new Date(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate() + 30
      );
      const rangeEndDate =
        upcomingHorizon > lastCell ? upcomingHorizon : lastCell;
      const endOfRange = new Date(
        rangeEndDate.getFullYear(),
        rangeEndDate.getMonth(),
        rangeEndDate.getDate(),
        23,
        59,
        59,
        999
      );

      const instances = await listCalendarEventsInRange({
        rangeStart: rangeStartDate.toISOString(),
        rangeEnd: endOfRange.toISOString(),
      });
      setEvents(instances);
    } catch {
      // Browser preview fallback when Tauri SQLite is not attached
    } finally {
      setIsLoading(false);
    }
  }, [cells, selected]);

  useEffect(() => {
    void loadMonthEvents();

    let unlisten: (() => void) | undefined;
    void onSyncEvent("calendar:updated", () => {
      void loadMonthEvents();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [loadMonthEvents]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ExpandedCalendarEventInstance[]>();
    const sorted = [...events].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
    for (const ev of sorted) {
      const d = new Date(ev.startTime);
      if (Number.isNaN(d.getTime())) continue;
      const key = dateKey(d);
      map.set(key, [...(map.get(key) ?? []), ev]);
    }
    return map;
  }, [events]);

  const selectedKey = dateKey(selected);
  const dayEvents = eventsByDay.get(selectedKey) ?? [];

  const upcoming = useMemo(() => {
    const afterSelected = new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate(),
      23,
      59,
      59,
      999
    ).getTime();
    return [...events]
      .filter((ev) => Date.parse(ev.startTime) > afterSelected)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 4);
  }, [events, selected]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;

    setQuickError(null);
    try {
      const [hoursStr, minsStr] = (quickTime || "09:00").split(":");
      const start = new Date(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
        Number(hoursStr) || 9,
        Number(minsStr) || 0,
        0,
        0
      );
      const end = new Date(start.getTime() + 3600_000);

      await createCalendarEvent({
        title,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      setQuickTitle("");
      setIsQuickAddOpen(false);
      await loadMonthEvents();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setQuickError(msg);
    }
  };

  const handleDeleteEvent = async (ev: ExpandedCalendarEventInstance) => {
    try {
      await deleteCalendarEvent({
        id: ev.masterEventId || ev.eventId,
        scope: ev.isRecurring ? "this_instance" : "entire_series",
        instanceStartTime: ev.isRecurring ? ev.instanceStartTime : undefined,
      });
      await loadMonthEvents();
    } catch {
      // Non-blocking fallback
    }
  };

  const pillar = PILLAR_BY_ID[tab];
  const viewingTodayMonth =
    viewMonth.getFullYear() === today.getFullYear() &&
    viewMonth.getMonth() === today.getMonth();
  const showTodayBtn = !viewingTodayMonth || !isSameDay(selected, today);

  return (
    <div className="flex h-full w-full flex-col bg-canvas text-ink select-none">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-5 pr-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[15.5px] font-semibold text-ink">Quick look</h2>
          <span className="text-[13px] text-ink-2">
            {today.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        {onCloseSidebar && (
          <button
            type="button"
            onClick={onCloseSidebar}
            aria-label="Hide quick look"
            title="Hide quick look"
            className="grid size-8 place-items-center rounded-lg text-ink-2 transition hover:bg-active hover:text-ink"
          >
            <PanelRightClose className="size-[18px]" />
          </button>
        )}
      </div>

      {/* Four-Pillar Segmented Switcher */}
      <div
        role="tablist"
        aria-label="Pillars"
        className="mx-4 mt-4 grid shrink-0 grid-cols-4 gap-1 rounded-2xl border border-line bg-sunken p-1"
      >
        {PILLARS.map((p) => {
          const active = p.id === tab;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`tab-${p.id}`}
              aria-selected={active}
              aria-controls="pillar-panel"
              onClick={() => setTab(p.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-2 text-[12px] font-semibold transition",
                active
                  ? "bg-canvas text-ink ring-1 ring-line"
                  : "text-ink-2 hover:text-ink"
              )}
            >
              <p.icon className={cn("size-[18px]", active && p.fg)} />
              {p.tab}
            </button>
          );
        })}
      </div>

      {/* Active Pillar Content */}
      <div
        id="pillar-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        key={tab}
        className="min-h-0 flex-1 animate-rise overflow-y-auto"
      >
        <div className="px-5 pb-3 pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-[22px] font-medium leading-tight tracking-[-0.01em] text-ink">
              {pillar.name}
            </h3>
            <StatusChip live={pillar.live}>{pillar.status}</StatusChip>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            {pillar.reality}
          </p>
        </div>

        {pillar.live ? (
          <div className="px-5 pb-6">
            {/* Compact Month Grid */}
            <section
              aria-label="Month"
              className="rounded-2xl border border-line bg-paper p-3"
            >
              <div className="flex items-center justify-between pb-2 pl-1.5">
                <h4 className="text-[15px] font-semibold text-ink">
                  {viewMonth.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </h4>
                <div className="flex items-center gap-0.5">
                  {showTodayBtn && (
                    <button
                      type="button"
                      onClick={() => setSelected(today)}
                      className="mr-1 h-7 rounded-lg px-2.5 text-[12.5px] font-semibold text-calendar-fg transition hover:bg-calendar-tint"
                    >
                      Today
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setViewMonth(
                        new Date(
                          viewMonth.getFullYear(),
                          viewMonth.getMonth() - 1,
                          1
                        )
                      )
                    }
                    aria-label="Previous month"
                    className="grid size-8 place-items-center rounded-lg text-ink-2 transition hover:bg-active hover:text-ink"
                  >
                    <ChevronLeft className="size-[18px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setViewMonth(
                        new Date(
                          viewMonth.getFullYear(),
                          viewMonth.getMonth() + 1,
                          1
                        )
                      )
                    }
                    aria-label="Next month"
                    className="grid size-8 place-items-center rounded-lg text-ink-2 transition hover:bg-active hover:text-ink"
                  >
                    <ChevronRight className="size-[18px]" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 pb-1 text-center">
                {WEEKDAYS.map((d) => (
                  <span
                    key={d}
                    className="py-1 text-[12px] font-semibold text-ink-2"
                  >
                    {d}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((d) => {
                  const inMonth = d.getMonth() === viewMonth.getMonth();
                  const isSel = isSameDay(d, selected);
                  const isToday = isSameDay(d, today);
                  const count = eventsByDay.get(dateKey(d))?.length ?? 0;

                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => setSelected(d)}
                      aria-label={`${d.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}${count ? `, ${count} event${count > 1 ? "s" : ""}` : ""}`}
                      aria-pressed={isSel}
                      className={cn(
                        "mx-auto flex size-[33px] flex-col items-center justify-center gap-[2px] rounded-full text-[13px] transition",
                        isSel
                          ? "bg-ink font-semibold text-paper"
                          : isToday
                            ? "font-semibold text-calendar-fg ring-[1.5px] ring-inset ring-calendar hover:bg-calendar-tint"
                            : inMonth
                              ? "font-medium text-ink hover:bg-active"
                              : "text-ink-4 hover:bg-active"
                      )}
                    >
                      <span className="leading-none">{d.getDate()}</span>
                      <span className="flex h-1 items-center gap-[3px]">
                        {Array.from({ length: Math.min(count, 3) }).map(
                          (_, i) => (
                            <span
                              key={i}
                              className={cn(
                                "size-1 rounded-full",
                                isSel ? "bg-paper" : "bg-calendar"
                              )}
                            />
                          )
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Selected Day Agenda */}
            <section aria-label="Agenda" className="mt-4">
              <div className="flex items-end justify-between gap-3 pb-2.5">
                <div className="min-w-0">
                  <h4 className="truncate text-[15px] font-semibold text-ink">
                    {dayLabel(selected, today)}
                    <span className="ml-2 font-normal text-ink-2">
                      {selected.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen((prev) => !prev)}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-paper px-2.5 text-[13px] font-medium text-ink transition hover:border-line-strong hover:bg-sunken"
                >
                  <Plus className="size-3.5" strokeWidth={2.5} />
                  {isQuickAddOpen ? "Cancel" : "Add"}
                </button>
              </div>

              {isQuickAddOpen && (
                <form
                  onSubmit={(e) => void handleQuickAdd(e)}
                  className="mb-3 space-y-2.5 rounded-xl border border-line bg-paper p-3"
                >
                  <input
                    autoFocus
                    type="text"
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    placeholder="Event title…"
                    className="h-9 w-full rounded-lg border border-line bg-sunken px-3 text-[13.5px] text-ink outline-none placeholder:text-ink-4 focus:border-calendar"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={quickTime}
                      onChange={(e) => setQuickTime(e.target.value)}
                      className="h-9 rounded-lg border border-line bg-sunken px-2.5 font-mono text-[12.5px] text-ink outline-none focus:border-calendar"
                    />
                    <button
                      type="submit"
                      className="h-9 flex-1 rounded-lg bg-calendar text-[13px] font-semibold text-white transition hover:bg-calendar-hover"
                    >
                      Save event
                    </button>
                  </div>
                  {quickError && (
                    <p className="text-[12px] text-rose-300">{quickError}</p>
                  )}
                </form>
              )}

              {isLoading ? (
                <div className="py-6 text-center text-[13px] text-ink-2">
                  Loading schedule…
                </div>
              ) : dayEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center">
                  <p className="text-[14px] font-medium text-ink">
                    Nothing planned
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                    Enjoy the quiet, or tell Dialogue what is coming up.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {dayEvents.map((ev) => {
                    const isHighlighted =
                      Boolean(highlightedEventId) &&
                      (ev.eventId === highlightedEventId ||
                        ev.id === highlightedEventId);
                    return (
                      <li
                        key={ev.id}
                        className={cn(
                          "group relative flex gap-3 rounded-xl border border-line bg-paper p-3 pr-9 transition hover:border-line-strong",
                          isHighlighted && "animate-flash"
                        )}
                      >
                        <span
                          className="w-1 shrink-0 self-stretch rounded-full"
                          style={{ backgroundColor: ev.color || "#3b82f6" }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[12.5px] font-semibold text-calendar-fg">
                              {formatEventTime(ev)}
                            </p>
                            {ev.isRecurring && (
                              <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-ink-2">
                                {ev.isOverride ? "Modified" : "Repeats"}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-[14.5px] font-semibold leading-snug text-ink">
                            {ev.title}
                          </p>
                          {ev.description && (
                            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-2">
                              {ev.description}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteEvent(ev)}
                          aria-label={`Remove ${ev.title}`}
                          title="Remove"
                          className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md text-ink-2 opacity-0 transition hover:bg-active hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <X className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Coming Up */}
            {upcoming.length > 0 && (
              <section aria-label="Coming up" className="mt-6">
                <h4 className="pb-2 text-[12px] font-semibold tracking-wide text-ink-2">
                  Coming up
                </h4>
                <ul className="-mx-1.5 space-y-0.5">
                  {upcoming.map((ev) => {
                    const d = new Date(ev.startTime);
                    return (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(d)}
                          className="flex w-full items-center gap-3 rounded-xl px-1.5 py-2 text-left transition hover:bg-active"
                        >
                          <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-paper">
                            <span className="text-[11px] font-semibold leading-none text-ink-2">
                              {d.toLocaleDateString("en-US", {
                                month: "short",
                              })}
                            </span>
                            <span className="mt-1 text-[16px] font-semibold leading-none text-ink">
                              {d.getDate()}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-medium text-ink">
                              {ev.title}
                            </span>
                            <span className="block text-[12.5px] text-ink-2">
                              {dayLabel(d, today)} · {formatEventTime(ev)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Open Full Calendar View */}
            {onOpenFullCalendar && (
              <button
                type="button"
                onClick={onOpenFullCalendar}
                className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-paper text-[13.5px] font-semibold text-ink transition hover:border-line-strong hover:bg-sunken"
              >
                <CalendarDays className="size-4 text-calendar-fg" />
                Open full calendar
              </button>
            )}
          </div>
        ) : (
          <PlannedPillarView
            pillar={pillar}
            onWish={() => onWishPillar?.(pillar.wish)}
          />
        )}
      </div>
    </div>
  );
}

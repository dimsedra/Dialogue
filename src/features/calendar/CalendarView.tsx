import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, PanelLeftOpen, Plus, X } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventContentArg,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import {
  listCalendarEventsInRange,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarEventById,
  type ExpandedCalendarEventInstance,
} from "./calendar.service";
import { onSyncEvent } from "../../core/sync";
import type { WeekdayCode, FrequencyType } from "./calendar.schema";

const COLOR_OPTIONS = [
  { label: "Blue", value: "#3b82f6" },
  { label: "Emerald", value: "#10b981" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Purple", value: "#8b5cf6" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Slate", value: "#64748b" },
];

const WEEKDAYS: Array<{ label: string; code: WeekdayCode }> = [
  { label: "M", code: "MO" },
  { label: "T", code: "TU" },
  { label: "W", code: "WE" },
  { label: "T", code: "TH" },
  { label: "F", code: "FR" },
  { label: "S", code: "SA" },
  { label: "S", code: "SU" },
];

interface EventModalState {
  isOpen: boolean;
  mode: "create" | "edit";
  instance?: ExpandedCalendarEventInstance;
  title: string;
  description: string;
  startTime: string; // ISO string or datetime-local
  endTime: string;
  allDay: boolean;
  color: string;
  isRecurring: boolean;
  frequency: FrequencyType;
  byWeekday: WeekdayCode[];
  scope: "this_instance" | "entire_series";
  error: string | null;
}

const DEFAULT_MODAL_STATE: EventModalState = {
  isOpen: false,
  mode: "create",
  title: "",
  description: "",
  startTime: "",
  endTime: "",
  allDay: false,
  color: "#3b82f6",
  isRecurring: false,
  frequency: "WEEKLY",
  byWeekday: ["MO", "WE", "FR"],
  scope: "entire_series",
  error: null,
};

function toLocalDatetimeString(isoString: string): string {
  const d = new Date(isoString);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export interface CalendarViewProps {
  leftOpen?: boolean;
  onOpenLeft?: () => void;
  onBackToChat?: () => void;
}

export function CalendarView({
  leftOpen = true,
  onOpenLeft,
  onBackToChat,
}: CalendarViewProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const [currentView, setCurrentView] = useState<string>("timeGridWeek");
  const [headerTitle, setHeaderTitle] = useState<string>("");
  const [modal, setModal] = useState<EventModalState>(DEFAULT_MODAL_STATE);
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const updateHeaderTitle = useCallback(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      setHeaderTitle(api.view.title);
    }
  }, []);

  useEffect(() => {
    updateHeaderTitle();
  }, [updateHeaderTitle]);

  // Real-time synchronization listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onSyncEvent("calendar:updated", () => {
      calendarRef.current?.getApi().refetchEvents();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const handlePrev = () => {
    const api = calendarRef.current?.getApi();
    api?.prev();
    updateHeaderTitle();
  };

  const handleNext = () => {
    const api = calendarRef.current?.getApi();
    api?.next();
    updateHeaderTitle();
  };

  const handleToday = () => {
    const api = calendarRef.current?.getApi();
    api?.today();
    updateHeaderTitle();
  };

  const handleViewChange = (viewName: string) => {
    const api = calendarRef.current?.getApi();
    api?.changeView(viewName);
    setCurrentView(viewName);
    updateHeaderTitle();
  };

  const openCreateModal = (startTime?: string, endTime?: string) => {
    const now = new Date();
    const defaultStart = startTime ?? now.toISOString();
    const defaultEnd =
      endTime ?? new Date(Date.parse(defaultStart) + 3600000).toISOString();

    setModal({
      ...DEFAULT_MODAL_STATE,
      isOpen: true,
      mode: "create",
      startTime: toLocalDatetimeString(defaultStart),
      endTime: toLocalDatetimeString(defaultEnd),
    });
  };

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    openCreateModal(selectInfo.startStr, selectInfo.endStr);
    selectInfo.view.calendar.unselect();
  };

  const handleEventClick = async (clickInfo: EventClickArg) => {
    const props = clickInfo.event.extendedProps as {
      eventId: string;
      masterEventId: string;
      description: string;
      isRecurring: boolean;
      isOverride: boolean;
      instanceStartTime: string;
    };

    const instance: ExpandedCalendarEventInstance = {
      id: clickInfo.event.id,
      eventId: props.eventId,
      masterEventId: props.masterEventId,
      title: clickInfo.event.title,
      description: props.description,
      startTime: clickInfo.event.start?.toISOString() ?? "",
      endTime: clickInfo.event.end?.toISOString() ?? "",
      allDay: clickInfo.event.allDay,
      color: clickInfo.event.backgroundColor,
      isRecurring: props.isRecurring,
      isOverride: props.isOverride,
      rrule: null,
      instanceStartTime: props.instanceStartTime,
    };

    // Prefill recurrence frequency if editing a master recurring series
    let freq: FrequencyType = "WEEKLY";
    if (props.isRecurring) {
      try {
        const master = await getCalendarEventById(props.masterEventId);
        if (master.rrule) {
          if (master.rrule.includes("FREQ=DAILY")) freq = "DAILY";
          if (master.rrule.includes("FREQ=MONTHLY")) freq = "MONTHLY";
          if (master.rrule.includes("FREQ=YEARLY")) freq = "YEARLY";
        }
      } catch {
        // Fallback
      }
    }

    setModal({
      isOpen: true,
      mode: "edit",
      instance,
      title: instance.title,
      description: instance.description,
      startTime: toLocalDatetimeString(instance.startTime),
      endTime: toLocalDatetimeString(instance.endTime),
      allDay: instance.allDay,
      color: instance.color,
      isRecurring: instance.isRecurring,
      frequency: freq,
      byWeekday: ["MO", "WE", "FR"],
      scope: instance.isRecurring ? "this_instance" : "entire_series",
      error: null,
    });
  };

  const handleEventDrop = async (dropInfo: EventDropArg) => {
    const props = dropInfo.event.extendedProps as {
      eventId: string;
      masterEventId: string;
      isRecurring: boolean;
      instanceStartTime: string;
    };

    try {
      if (props.isRecurring) {
        await updateCalendarEvent({
          id: props.masterEventId,
          startTime: dropInfo.event.start?.toISOString(),
          endTime: dropInfo.event.end?.toISOString(),
          scope: "this_instance",
          instanceStartTime: props.instanceStartTime,
        });
      } else {
        await updateCalendarEvent({
          id: props.eventId,
          startTime: dropInfo.event.start?.toISOString(),
          endTime: dropInfo.event.end?.toISOString(),
          scope: "entire_series",
        });
      }
    } catch {
      dropInfo.revert();
    }
  };

  const handleEventResize = async (resizeInfo: EventResizeDoneArg) => {
    const props = resizeInfo.event.extendedProps as {
      eventId: string;
      masterEventId: string;
      isRecurring: boolean;
      instanceStartTime: string;
    };

    try {
      if (props.isRecurring) {
        await updateCalendarEvent({
          id: props.masterEventId,
          startTime: resizeInfo.event.start?.toISOString(),
          endTime: resizeInfo.event.end?.toISOString(),
          scope: "this_instance",
          instanceStartTime: props.instanceStartTime,
        });
      } else {
        await updateCalendarEvent({
          id: props.eventId,
          startTime: resizeInfo.event.start?.toISOString(),
          endTime: resizeInfo.event.end?.toISOString(),
          scope: "entire_series",
        });
      }
    } catch {
      resizeInfo.revert();
    }
  };

  const handleSaveModal = async () => {
    if (!modal.title.trim()) {
      setModal((prev) => ({ ...prev, error: "Title is required" }));
      return;
    }

    const startIso = new Date(modal.startTime).toISOString();
    const endIso = new Date(modal.endTime).toISOString();

    if (Date.parse(endIso) < Date.parse(startIso)) {
      setModal((prev) => ({
        ...prev,
        error: "End time cannot be earlier than start time",
      }));
      return;
    }

    try {
      if (modal.mode === "create") {
        await createCalendarEvent({
          title: modal.title.trim(),
          description: modal.description.trim(),
          startTime: startIso,
          endTime: endIso,
          allDay: modal.allDay,
          color: modal.color,
          recurrence: modal.isRecurring
            ? {
                frequency: modal.frequency,
                interval: 1,
                byWeekday:
                  modal.frequency === "WEEKLY" ? modal.byWeekday : undefined,
              }
            : undefined,
        });
      } else if (modal.mode === "edit" && modal.instance) {
        await updateCalendarEvent({
          id:
            modal.scope === "this_instance"
              ? modal.instance.masterEventId
              : modal.instance.eventId,
          title: modal.title.trim(),
          description: modal.description.trim(),
          startTime: startIso,
          endTime: endIso,
          allDay: modal.allDay,
          color: modal.color,
          scope: modal.scope,
          instanceStartTime: modal.instance.instanceStartTime,
        });
      }

      setModal(DEFAULT_MODAL_STATE);
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setModal((prev) => ({ ...prev, error: message }));
    }
  };

  const handleDeleteModal = async () => {
    if (!modal.instance) return;

    try {
      await deleteCalendarEvent({
        id:
          modal.scope === "this_instance"
            ? modal.instance.masterEventId
            : modal.instance.eventId,
        scope: modal.scope,
        instanceStartTime: modal.instance.instanceStartTime,
      });

      setModal(DEFAULT_MODAL_STATE);
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setModal((prev) => ({ ...prev, error: message }));
    }
  };

  const renderEventContent = (eventInfo: EventContentArg) => {
    const isRecurring = Boolean(
      (eventInfo.event.extendedProps as { isRecurring?: boolean }).isRecurring
    );
    const isOverride = Boolean(
      (eventInfo.event.extendedProps as { isOverride?: boolean }).isOverride
    );

    return (
      <div className="flex items-center space-x-1.5 px-1 py-0.5 overflow-hidden text-xs text-white">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: eventInfo.event.backgroundColor }}
        />
        <span className="truncate font-medium">{eventInfo.event.title}</span>
        {isRecurring && (
          <span
            className="text-[10px] text-zinc-300 shrink-0 font-mono"
            title={isOverride ? "Modified occurrence" : "Recurring series"}
          >
            {isOverride ? "✦" : "↻"}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-paper text-ink select-none">
      {/* Calendar Top Toolbar (uniform 56px height matching sidebar seam) */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line bg-paper px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {!leftOpen && onOpenLeft && (
            <button
              type="button"
              onClick={onOpenLeft}
              aria-label="Show sidebar"
              title="Show sidebar"
              className="-ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-ink-2 transition hover:bg-active hover:text-ink"
            >
              <PanelLeftOpen className="size-[18px]" />
            </button>
          )}
          <div className="hidden items-center overflow-hidden rounded-xl border border-line bg-surface sm:flex">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous period"
              className="grid size-8 place-items-center text-ink-2 transition hover:bg-active hover:text-ink"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="h-8 border-x border-line px-3 text-[12.5px] font-medium text-ink-2 transition hover:bg-active hover:text-ink"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next period"
              className="grid size-8 place-items-center text-ink-2 transition hover:bg-active hover:text-ink"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <h1 className="truncate font-sans text-[15.5px] font-semibold tracking-[-0.01em] text-ink tabular-nums sm:text-[16px]">
            {headerTitle}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden font-mono text-[11.5px] text-ink-2 lg:inline">
            {systemTimeZone}
          </span>

          {/* Desktop View Switcher */}
          <div className="hidden items-center rounded-xl border border-line bg-sunken p-0.5 sm:flex">
            <button
              type="button"
              onClick={() => handleViewChange("dayGridMonth")}
              className={`h-7 rounded-lg px-3 text-[12.5px] font-medium transition ${
                currentView === "dayGridMonth"
                  ? "bg-surface text-ink ring-1 ring-line"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => handleViewChange("timeGridWeek")}
              className={`h-7 rounded-lg px-3 text-[12.5px] font-medium transition ${
                currentView === "timeGridWeek"
                  ? "bg-surface text-ink ring-1 ring-line"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => handleViewChange("timeGridDay")}
              className={`h-7 rounded-lg px-3 text-[12.5px] font-medium transition ${
                currentView === "timeGridDay"
                  ? "bg-surface text-ink ring-1 ring-line"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              Day
            </button>
          </div>

          <button
            type="button"
            onClick={() => openCreateModal()}
            aria-label="New event"
            title="New event"
            className="flex h-8 items-center gap-1.5 rounded-xl bg-ink px-2.5 text-[12.5px] font-semibold text-paper transition hover:bg-white sm:px-3"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">New event</span>
          </button>

          {onBackToChat && (
            <button
              type="button"
              onClick={onBackToChat}
              aria-label="Back to chat"
              title="Back to chat"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] font-medium text-ink transition hover:border-line-strong hover:bg-sunken"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden md:inline">Back to chat</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Secondary Calendar Bar (date navigation + Month/Week/Day switcher) */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 sm:hidden">
        <div className="flex items-center overflow-hidden rounded-xl border border-line bg-paper">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous period"
            className="grid size-7 place-items-center text-ink-2 transition hover:bg-active hover:text-ink"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="h-7 border-x border-line px-2.5 text-[12px] font-medium text-ink-2 transition hover:bg-active hover:text-ink"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next period"
            className="grid size-7 place-items-center text-ink-2 transition hover:bg-active hover:text-ink"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        <div className="flex items-center rounded-xl border border-line bg-paper p-0.5">
          <button
            type="button"
            onClick={() => handleViewChange("dayGridMonth")}
            className={`h-6 rounded-lg px-2.5 text-[12px] font-medium transition ${
              currentView === "dayGridMonth"
                ? "bg-active text-ink ring-1 ring-line"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            Month
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("timeGridWeek")}
            className={`h-6 rounded-lg px-2.5 text-[12px] font-medium transition ${
              currentView === "timeGridWeek"
                ? "bg-active text-ink ring-1 ring-line"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("timeGridDay")}
            className={`h-6 rounded-lg px-2.5 text-[12px] font-medium transition ${
              currentView === "timeGridDay"
                ? "bg-active text-ink ring-1 ring-line"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            Day
          </button>
        </div>
      </div>

      {/* Main FullCalendar Area */}
      <div className="flex-1 p-2 overflow-hidden">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          timeZone="local"
          headerToolbar={false}
          allDaySlot={true}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          height="100%"
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          nowIndicator={true}
          datesSet={() => updateHeaderTitle()}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventContent={renderEventContent}
          events={async (fetchInfo, successCallback, failureCallback) => {
            try {
              const instances = await listCalendarEventsInRange({
                rangeStart: fetchInfo.startStr,
                rangeEnd: fetchInfo.endStr,
              });

              const fcEvents = instances.map((inst) => ({
                id: inst.id,
                title: inst.title,
                start: inst.startTime,
                end: inst.endTime,
                allDay: inst.allDay,
                backgroundColor: inst.color,
                borderColor: inst.color,
                extendedProps: {
                  eventId: inst.eventId,
                  masterEventId: inst.masterEventId,
                  description: inst.description,
                  isRecurring: inst.isRecurring,
                  isOverride: inst.isOverride,
                  instanceStartTime: inst.instanceStartTime,
                },
              }));

              successCallback(fcEvents);
            } catch (err) {
              failureCallback(err as Error);
            }
          }}
        />
      </div>

      {/* Event Modal Dialog */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-float">
            <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-4">
              <span className="text-[15px] font-semibold text-ink">
                {modal.mode === "create" ? "Create event" : "Edit event"}
              </span>
              <button
                type="button"
                onClick={() => setModal(DEFAULT_MODAL_STATE)}
                aria-label="Close modal"
                className="grid size-7 place-items-center rounded-lg text-ink-2 transition hover:bg-active hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 p-5 text-[13px]">
              {modal.error && (
                <div className="rounded-xl border border-rose-800/70 bg-rose-950/30 p-3 text-[12.5px] leading-relaxed text-rose-200">
                  {modal.error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[12px] font-semibold tracking-wide text-ink-2">
                  Title
                </label>
                <input
                  type="text"
                  value={modal.title}
                  onChange={(e) =>
                    setModal((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Event title"
                  className="h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink-4 focus:border-calendar"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold tracking-wide text-ink-2">
                    Start time
                  </label>
                  <input
                    type="datetime-local"
                    value={modal.startTime}
                    onChange={(e) =>
                      setModal((prev) => ({
                        ...prev,
                        startTime: e.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 font-mono text-[12.5px] text-ink outline-none transition focus:border-calendar"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold tracking-wide text-ink-2">
                    End time
                  </label>
                  <input
                    type="datetime-local"
                    value={modal.endTime}
                    onChange={(e) =>
                      setModal((prev) => ({ ...prev, endTime: e.target.value }))
                    }
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 font-mono text-[12.5px] text-ink outline-none transition focus:border-calendar"
                  />
                </div>
              </div>

              <div className="flex items-center gap-5 pt-0.5 text-[13px]">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={modal.allDay}
                    onChange={(e) =>
                      setModal((prev) => ({
                        ...prev,
                        allDay: e.target.checked,
                      }))
                    }
                    className="size-4 rounded border-line bg-surface accent-calendar"
                  />
                  <span className="text-[13px] text-ink-2">All-day event</span>
                </label>

                {modal.mode === "create" && (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={modal.isRecurring}
                      onChange={(e) =>
                        setModal((prev) => ({
                          ...prev,
                          isRecurring: e.target.checked,
                        }))
                      }
                      className="size-4 rounded border-line bg-surface accent-calendar"
                    />
                    <span className="text-[13px] text-ink-2">Repeat</span>
                  </label>
                )}
              </div>

              {/* Recurrence config (when creating recurring event) */}
              {modal.mode === "create" && modal.isRecurring && (
                <div className="p-2.5 bg-[#131417] border border-[#22242a] rounded space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-[#8b8f98]">Frequency:</span>
                    <select
                      value={modal.frequency}
                      onChange={(e) =>
                        setModal((prev) => ({
                          ...prev,
                          frequency: e.target.value as FrequencyType,
                        }))
                      }
                      className="bg-[#090a0c] border border-[#22242a] text-[#f3f4f6] rounded px-2 py-1 text-xs outline-none"
                    >
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                      <option value="YEARLY">Yearly</option>
                    </select>
                  </div>

                  {modal.frequency === "WEEKLY" && (
                    <div className="flex items-center space-x-1 pt-1">
                      {WEEKDAYS.map((day) => {
                        const isSelected = modal.byWeekday.includes(day.code);
                        return (
                          <button
                            key={day.code}
                            type="button"
                            onClick={() => {
                              setModal((prev) => {
                                const current = prev.byWeekday;
                                const next = isSelected
                                  ? current.filter((d) => d !== day.code)
                                  : [...current, day.code];
                                return {
                                  ...prev,
                                  byWeekday: next.length > 0 ? next : ["MO"],
                                };
                              });
                            }}
                            className={`w-6 h-6 rounded text-[11px] font-medium flex items-center justify-center border transition-colors ${
                              isSelected
                                ? "bg-[#3b82f6] border-[#3b82f6] text-white"
                                : "bg-[#090a0c] border-[#22242a] text-[#8b8f98] hover:text-[#f3f4f6]"
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Scope selection when editing recurring event */}
              {modal.mode === "edit" && modal.isRecurring && (
                <div className="p-2.5 bg-[#131417] border border-[#22242a] rounded space-y-1.5">
                  <span className="text-[#8b8f98] font-medium block">
                    Apply changes to:
                  </span>
                  <div className="space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="scope"
                        checked={modal.scope === "this_instance"}
                        onChange={() =>
                          setModal((prev) => ({
                            ...prev,
                            scope: "this_instance",
                          }))
                        }
                      />
                      <span className="text-[#f3f4f6]">
                        This occurrence only
                      </span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="scope"
                        checked={modal.scope === "entire_series"}
                        onChange={() =>
                          setModal((prev) => ({
                            ...prev,
                            scope: "entire_series",
                          }))
                        }
                      />
                      <span className="text-[#f3f4f6]">
                        All events in series
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Color Tag Picker */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold tracking-wide text-ink-2">
                  Color tag
                </label>
                <div className="flex items-center gap-2.5">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() =>
                        setModal((prev) => ({ ...prev, color: c.value }))
                      }
                      aria-label={c.label}
                      className={`size-5 rounded-full border-2 transition-transform ${
                        modal.color === c.value
                          ? "scale-110 border-white"
                          : "border-transparent opacity-75 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-semibold tracking-wide text-ink-2">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={modal.description}
                  onChange={(e) =>
                    setModal((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Notes, location, or details…"
                  className="w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2 text-[13.5px] text-ink outline-none transition placeholder:text-ink-4 focus:border-calendar"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line bg-surface px-5 py-3.5">
              {modal.mode === "edit" ? (
                <button
                  type="button"
                  onClick={handleDeleteModal}
                  className="h-9 rounded-xl border border-rose-800/70 bg-rose-950/40 px-3.5 text-[13px] font-medium text-rose-200 transition hover:bg-rose-950/70"
                >
                  Delete
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModal(DEFAULT_MODAL_STATE)}
                  className="h-9 rounded-xl px-3.5 text-[13px] font-medium text-ink-2 transition hover:bg-active hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveModal}
                  className="h-9 rounded-xl bg-calendar px-4 text-[13px] font-semibold text-white transition hover:bg-calendar-hover"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

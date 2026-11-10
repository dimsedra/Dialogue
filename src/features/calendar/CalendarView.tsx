import { useState, useEffect, useRef, useCallback } from "react";
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

export function CalendarView() {
  const calendarRef = useRef<FullCalendar>(null);
  const [currentView, setCurrentView] = useState<string>("timeGridWeek");
  const [headerTitle, setHeaderTitle] = useState<string>("");
  const [modal, setModal] = useState<EventModalState>(DEFAULT_MODAL_STATE);

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
    <div className="flex-1 flex flex-col h-full bg-[#090a0c] text-[#f3f4f6] overflow-hidden select-none">
      {/* Calendar Top Toolbar */}
      <header className="h-14 border-b border-[#22242a] flex items-center justify-between px-6 bg-[#131417] shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center border border-[#22242a] rounded-lg overflow-hidden bg-[#090a0c]">
            <button
              onClick={handlePrev}
              className="px-3 py-1.5 text-xs text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e] transition-colors"
            >
              ‹
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-xs text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e] border-x border-[#22242a] transition-colors font-medium"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="px-3 py-1.5 text-xs text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e] transition-colors"
            >
              ›
            </button>
          </div>
          <h2 className="text-base font-semibold text-[#f3f4f6] ml-2 tracking-tight">
            {headerTitle}
          </h2>
        </div>

        <div className="flex items-center space-x-3">
          {/* View switcher */}
          <div className="flex items-center border border-[#22242a] rounded-lg overflow-hidden bg-[#090a0c]">
            <button
              onClick={() => handleViewChange("dayGridMonth")}
              className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${
                currentView === "dayGridMonth"
                  ? "bg-[#1c1e24] text-[#f3f4f6]"
                  : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => handleViewChange("timeGridWeek")}
              className={`px-3.5 py-1.5 text-xs font-medium border-x border-[#22242a] transition-colors ${
                currentView === "timeGridWeek"
                  ? "bg-[#1c1e24] text-[#f3f4f6]"
                  : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => handleViewChange("timeGridDay")}
              className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${
                currentView === "timeGridDay"
                  ? "bg-[#1c1e24] text-[#f3f4f6]"
                  : "text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
              }`}
            >
              Day
            </button>
          </div>

          <button
            onClick={() => openCreateModal()}
            className="px-3.5 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
          >
            + New Event
          </button>
        </div>
      </header>

      {/* Main FullCalendar Area */}
      <div className="flex-1 p-2 overflow-hidden">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-[480px] bg-[#090a0c] border border-[#22242a] rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[#22242a] bg-[#131417] flex items-center justify-between">
              <span className="text-sm font-semibold text-[#f3f4f6]">
                {modal.mode === "create" ? "Create Event" : "Edit Event"}
              </span>
              <button
                onClick={() => setModal(DEFAULT_MODAL_STATE)}
                className="text-[#8b8f98] hover:text-[#f3f4f6] text-sm p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {modal.error && (
                <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded-lg text-xs leading-relaxed">
                  {modal.error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#8b8f98] uppercase tracking-wider mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={modal.title}
                  onChange={(e) =>
                    setModal((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Event title"
                  className="w-full bg-[#131417] border border-[#22242a] rounded-lg px-3.5 py-2 text-sm text-[#f3f4f6] outline-none focus:border-[#3b82f6] transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#8b8f98] uppercase tracking-wider mb-1.5">
                    Start Time
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
                    className="w-full bg-[#131417] border border-[#22242a] rounded-lg px-3 py-2 text-xs text-[#f3f4f6] outline-none focus:border-[#3b82f6] font-mono transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#8b8f98] uppercase tracking-wider mb-1.5">
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    value={modal.endTime}
                    onChange={(e) =>
                      setModal((prev) => ({ ...prev, endTime: e.target.value }))
                    }
                    className="w-full bg-[#131417] border border-[#22242a] rounded-lg px-3 py-2 text-xs text-[#f3f4f6] outline-none focus:border-[#3b82f6] font-mono transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-5 text-sm">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modal.allDay}
                    onChange={(e) =>
                      setModal((prev) => ({
                        ...prev,
                        allDay: e.target.checked,
                      }))
                    }
                    className="rounded border-[#22242a] bg-[#131417]"
                  />
                  <span className="text-xs text-[#8b8f98]">All-day event</span>
                </label>

                {modal.mode === "create" && (
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modal.isRecurring}
                      onChange={(e) =>
                        setModal((prev) => ({
                          ...prev,
                          isRecurring: e.target.checked,
                        }))
                      }
                      className="rounded border-[#22242a] bg-[#131417]"
                    />
                    <span className="text-xs text-[#8b8f98]">Repeat</span>
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
                <label className="block text-[#8b8f98] mb-1">Color Tag</label>
                <div className="flex items-center space-x-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() =>
                        setModal((prev) => ({ ...prev, color: c.value }))
                      }
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${
                        modal.color === c.value
                          ? "border-white scale-110"
                          : "border-transparent opacity-75 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[#8b8f98] mb-1">Description</label>
                <textarea
                  rows={2}
                  value={modal.description}
                  onChange={(e) =>
                    setModal((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Notes, location, or details..."
                  className="w-full bg-[#131417] border border-[#22242a] rounded px-2.5 py-1.5 text-[#f3f4f6] outline-none focus:border-[#3b82f6] resize-none"
                />
              </div>
            </div>

            <div className="px-4 py-3 border-t border-[#22242a] bg-[#131417] flex items-center justify-between">
              {modal.mode === "edit" ? (
                <button
                  type="button"
                  onClick={handleDeleteModal}
                  className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 rounded text-xs transition-colors"
                >
                  Delete
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setModal(DEFAULT_MODAL_STATE)}
                  className="px-3 py-1.5 text-[#8b8f98] hover:text-[#f3f4f6] text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveModal}
                  className="px-3.5 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded text-xs font-medium transition-colors"
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

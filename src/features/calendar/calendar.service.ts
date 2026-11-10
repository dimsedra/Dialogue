import { RRuleSet, rrulestr } from "rrule";
import { getDb } from "../../core/db";
import { emitSyncEvent, type SyncEventBridge } from "../../core/sync";
import {
  createEventInputSchema,
  updateEventInputSchema,
  deleteEventInputSchema,
  dateRangeQueryInputSchema,
  parseRecurrenceRule,
  type CreateEventInput,
  type UpdateEventInput,
  type DeleteEventInput,
  type DateRangeQueryInput,
} from "./calendar.schema";

export interface CalendarEventRow {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  all_day: number;
  color: string;
  rrule: string | null;
  exdates: string;
  recurring_event_id: string | null;
  original_start_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventRecord {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  color: string;
  rrule: string | null;
  exdates: string[];
  recurringEventId: string | null;
  originalStartTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpandedCalendarEventInstance {
  id: string;
  eventId: string;
  masterEventId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  color: string;
  isRecurring: boolean;
  isOverride: boolean;
  rrule: string | null;
  instanceStartTime: string;
}

export interface CalendarServiceOptions {
  bridge?: SyncEventBridge;
}

function mapRowToRecord(row: CalendarEventRow): CalendarEventRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    allDay: Boolean(row.all_day),
    color: row.color,
    rrule: row.rrule,
    exdates: JSON.parse(row.exdates || "[]") as string[],
    recurringEventId: row.recurring_event_id,
    originalStartTime: row.original_start_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createCalendarEvent(
  input: CreateEventInput,
  options: CalendarServiceOptions = {}
): Promise<CalendarEventRecord> {
  const validated = createEventInputSchema.parse(input);
  const db = getDb();

  const id = validated.id ?? crypto.randomUUID();
  const rruleString = parseRecurrenceRule(validated.recurrence);
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO events (
      id, title, description, start_time, end_time, all_day, color, rrule, exdates,
      recurring_event_id, original_start_time, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      validated.title,
      validated.description,
      validated.startTime,
      validated.endTime,
      validated.allDay ? 1 : 0,
      validated.color,
      rruleString,
      "[]",
      null,
      null,
      now,
      now,
    ]
  );

  await emitSyncEvent(
    "calendar:updated",
    {
      reason: "created",
      eventId: id,
      timestamp: Date.now(),
    },
    { bridge: options.bridge }
  );

  return getCalendarEventById(id);
}

export async function getCalendarEventById(
  eventId: string
): Promise<CalendarEventRecord> {
  const db = getDb();
  const rows = await db.select<CalendarEventRow>(
    "SELECT * FROM events WHERE id = ?",
    [eventId]
  );

  if (rows.length === 0) {
    throw new Error(`Calendar event not found: ${eventId}`);
  }

  return mapRowToRecord(rows[0]);
}

export async function listCalendarEventsInRange(
  query: DateRangeQueryInput
): Promise<ExpandedCalendarEventInstance[]> {
  const validated = dateRangeQueryInputSchema.parse(query);
  const db = getDb();

  // 1. Fetch standalone and single-instance override events overlapping range
  const standaloneRows = await db.select<CalendarEventRow>(
    "SELECT * FROM events WHERE rrule IS NULL AND start_time < ? AND end_time > ?",
    [validated.rangeEnd, validated.rangeStart]
  );

  const instances: ExpandedCalendarEventInstance[] = standaloneRows.map(
    (row) => {
      const isOverride = row.recurring_event_id !== null;
      return {
        id: row.id,
        eventId: row.id,
        masterEventId: row.recurring_event_id ?? row.id,
        title: row.title,
        description: row.description,
        startTime: row.start_time,
        endTime: row.end_time,
        allDay: Boolean(row.all_day),
        color: row.color,
        isRecurring: isOverride,
        isOverride,
        rrule: null,
        instanceStartTime: row.original_start_time ?? row.start_time,
      };
    }
  );

  // 2. Fetch master recurring series
  const recurringRows = await db.select<CalendarEventRow>(
    "SELECT * FROM events WHERE rrule IS NOT NULL"
  );

  for (const series of recurringRows) {
    const exdates = JSON.parse(series.exdates || "[]") as string[];
    const durationMs = Math.max(
      0,
      Date.parse(series.end_time) - Date.parse(series.start_time)
    );

    const set = new RRuleSet();
    const rule = rrulestr(series.rrule!, {
      dtstart: new Date(series.start_time),
    });
    set.rrule(rule);

    for (const ex of exdates) {
      set.exdate(new Date(ex));
    }

    const searchStart = new Date(Date.parse(validated.rangeStart) - durationMs);
    const searchEnd = new Date(validated.rangeEnd);
    const occurrences = set.between(searchStart, searchEnd, true);

    for (const occ of occurrences) {
      const occStartStr = occ.toISOString();
      const occEndStr = new Date(occ.getTime() + durationMs).toISOString();

      if (occStartStr < validated.rangeEnd && occEndStr > validated.rangeStart) {
        instances.push({
          id: `${series.id}_${occStartStr}`,
          eventId: series.id,
          masterEventId: series.id,
          title: series.title,
          description: series.description,
          startTime: occStartStr,
          endTime: occEndStr,
          allDay: Boolean(series.all_day),
          color: series.color,
          isRecurring: true,
          isOverride: false,
          rrule: series.rrule,
          instanceStartTime: occStartStr,
        });
      }
    }
  }

  // Sort chronologically by startTime
  instances.sort(
    (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)
  );

  return instances;
}

export async function updateCalendarEvent(
  input: UpdateEventInput,
  options: CalendarServiceOptions = {}
): Promise<CalendarEventRecord> {
  const validated = updateEventInputSchema.parse(input);
  const db = getDb();
  const target = await getCalendarEventById(validated.id);
  const now = new Date().toISOString();

  if (validated.scope === "this_instance") {
    if (!target.rrule && !target.recurringEventId) {
      throw new Error("Cannot update single instance of a non-recurring event");
    }

    const masterId = target.recurringEventId ?? target.id;
    const master = await getCalendarEventById(masterId);

    // Append instanceStartTime to master exdates if not present
    const exdatesSet = new Set(master.exdates);
    exdatesSet.add(validated.instanceStartTime!);
    await db.execute(
      "UPDATE events SET exdates = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(Array.from(exdatesSet)), now, masterId]
    );

    // Check if an override already exists for this instance
    const existingOverrides = await db.select<CalendarEventRow>(
      "SELECT * FROM events WHERE recurring_event_id = ? AND original_start_time = ?",
      [masterId, validated.instanceStartTime!]
    );

    let overrideId: string;
    if (existingOverrides.length > 0) {
      const existing = existingOverrides[0];
      overrideId = existing.id;
      const updatedTitle = validated.title ?? existing.title;
      const updatedDescription =
        validated.description !== undefined
          ? validated.description
          : existing.description;
      const updatedStartTime = validated.startTime ?? existing.start_time;
      const updatedEndTime = validated.endTime ?? existing.end_time;
      const updatedAllDay =
        validated.allDay !== undefined
          ? validated.allDay
            ? 1
            : 0
          : existing.all_day;
      const updatedColor = validated.color ?? existing.color;

      await db.execute(
        `UPDATE events SET
          title = ?, description = ?, start_time = ?, end_time = ?,
          all_day = ?, color = ?, updated_at = ?
        WHERE id = ?`,
        [
          updatedTitle,
          updatedDescription,
          updatedStartTime,
          updatedEndTime,
          updatedAllDay,
          updatedColor,
          now,
          overrideId,
        ]
      );
    } else {
      overrideId = crypto.randomUUID();
      const masterDurationMs = Math.max(
        0,
        Date.parse(master.endTime) - Date.parse(master.startTime)
      );
      const newStartTime =
        validated.startTime ?? validated.instanceStartTime!;
      const newEndTime =
        validated.endTime ??
        new Date(Date.parse(newStartTime) + masterDurationMs).toISOString();

      await db.execute(
        `INSERT INTO events (
          id, title, description, start_time, end_time, all_day, color, rrule,
          exdates, recurring_event_id, original_start_time, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          overrideId,
          validated.title ?? master.title,
          validated.description ?? master.description,
          newStartTime,
          newEndTime,
          validated.allDay !== undefined
            ? validated.allDay
              ? 1
              : 0
            : master.allDay
            ? 1
            : 0,
          validated.color ?? master.color,
          null,
          "[]",
          masterId,
          validated.instanceStartTime!,
          now,
          now,
        ]
      );
    }

    await emitSyncEvent(
      "calendar:updated",
      {
        reason: "updated",
        eventId: target.id,
        timestamp: Date.now(),
      },
      { bridge: options.bridge }
    );

    return getCalendarEventById(overrideId);
  }

  // Entire series (or standalone non-recurring event)
  const targetId = target.recurringEventId ?? target.id;
  const currentTarget = await getCalendarEventById(targetId);

  // If start_time changes and event is a master series, shift exdates and override records
  if (validated.startTime && currentTarget.rrule) {
    const deltaMs =
      Date.parse(validated.startTime) - Date.parse(currentTarget.startTime);
    if (deltaMs !== 0) {
      const shiftedExdates = currentTarget.exdates.map((ts) =>
        new Date(Date.parse(ts) + deltaMs).toISOString()
      );
      await db.execute(
        "UPDATE events SET exdates = ? WHERE id = ?",
        [JSON.stringify(shiftedExdates), targetId]
      );

      const linkedOverrides = await db.select<CalendarEventRow>(
        "SELECT * FROM events WHERE recurring_event_id = ?",
        [targetId]
      );
      for (const override of linkedOverrides) {
        const shiftedOrigStart = new Date(
          Date.parse(override.original_start_time!) + deltaMs
        ).toISOString();
        const shiftedStart = new Date(
          Date.parse(override.start_time) + deltaMs
        ).toISOString();
        const shiftedEnd = new Date(
          Date.parse(override.end_time) + deltaMs
        ).toISOString();

        await db.execute(
          `UPDATE events SET
            original_start_time = ?, start_time = ?, end_time = ?, updated_at = ?
          WHERE id = ?`,
          [shiftedOrigStart, shiftedStart, shiftedEnd, now, override.id]
        );
      }
    }
  }

  const updatedTitle = validated.title ?? currentTarget.title;
  const updatedDesc =
    validated.description !== undefined
      ? validated.description
      : currentTarget.description;
  const updatedStartTime = validated.startTime ?? currentTarget.startTime;
  const updatedEndTime = validated.endTime ?? currentTarget.endTime;
  const updatedAllDay =
    validated.allDay !== undefined
      ? validated.allDay
        ? 1
        : 0
      : currentTarget.allDay
      ? 1
      : 0;
  const updatedColor = validated.color ?? currentTarget.color;
  const updatedRrule =
    validated.recurrence !== undefined
      ? parseRecurrenceRule(validated.recurrence)
      : currentTarget.rrule;

  await db.execute(
    `UPDATE events SET
      title = ?, description = ?, start_time = ?, end_time = ?,
      all_day = ?, color = ?, rrule = ?, updated_at = ?
    WHERE id = ?`,
    [
      updatedTitle,
      updatedDesc,
      updatedStartTime,
      updatedEndTime,
      updatedAllDay,
      updatedColor,
      updatedRrule,
      now,
      targetId,
    ]
  );

  await emitSyncEvent(
    "calendar:updated",
    {
      reason: "updated",
      eventId: targetId,
      timestamp: Date.now(),
    },
    { bridge: options.bridge }
  );

  return getCalendarEventById(targetId);
}

export async function deleteCalendarEvent(
  input: DeleteEventInput,
  options: CalendarServiceOptions = {}
): Promise<{ deletedId: string; scope: "this_instance" | "entire_series" }> {
  const validated = deleteEventInputSchema.parse(input);
  const db = getDb();
  const target = await getCalendarEventById(validated.id);
  const now = new Date().toISOString();

  if (validated.scope === "this_instance") {
    if (!target.rrule && !target.recurringEventId) {
      throw new Error("Cannot delete single instance of a non-recurring event");
    }

    const masterId = target.recurringEventId ?? target.id;
    const master = await getCalendarEventById(masterId);

    const exdatesSet = new Set(master.exdates);
    exdatesSet.add(validated.instanceStartTime!);

    await db.execute(
      "UPDATE events SET exdates = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(Array.from(exdatesSet)), now, masterId]
    );

    // Delete any existing override row for this occurrence
    await db.execute(
      "DELETE FROM events WHERE recurring_event_id = ? AND original_start_time = ?",
      [masterId, validated.instanceStartTime!]
    );

    await emitSyncEvent(
      "calendar:updated",
      {
        reason: "deleted",
        eventId: target.id,
        timestamp: Date.now(),
      },
      { bridge: options.bridge }
    );

    return { deletedId: target.id, scope: "this_instance" };
  }

  // Entire series
  const masterId = target.recurringEventId ?? target.id;
  await db.execute("DELETE FROM events WHERE recurring_event_id = ?", [
    masterId,
  ]);
  await db.execute("DELETE FROM events WHERE id = ?", [masterId]);

  await emitSyncEvent(
    "calendar:updated",
    {
      reason: "deleted",
      eventId: masterId,
      timestamp: Date.now(),
    },
    { bridge: options.bridge }
  );

  return { deletedId: masterId, scope: "entire_series" };
}

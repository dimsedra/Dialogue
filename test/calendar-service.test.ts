import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  initDatabase,
  resetDbStateForTesting,
  createNodeSqlExecutor,
} from "../src/core/db";
import {
  createCalendarEvent,
  listCalendarEventsInRange,
  getCalendarEventById,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "../src/features/calendar/calendar.service";
import type { SyncEventBridge } from "../src/core/sync";

function createInMemoryBridge(): SyncEventBridge & { emitted: Array<{ event: string; payload: unknown }> } {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  return {
    emitted,
    async emit(event: string, payload: unknown) {
      emitted.push({ event, payload });
    },
    async listen() {
      return () => {};
    },
  };
}

describe("BP-CAL-002: Calendar Domain Service & RRuleSet Expansion", () => {
  let bridge: ReturnType<typeof createInMemoryBridge>;

  beforeEach(async () => {
    resetDbStateForTesting();
    const rawDb = new DatabaseSync(":memory:");
    const testExecutor = createNodeSqlExecutor(rawDb);
    await initDatabase({ executor: testExecutor });
    bridge = createInMemoryBridge();
  });

  it("creates a standalone one-time event and emits calendar:updated", async () => {
    const created = await createCalendarEvent(
      {
        title: "Product Sync",
        description: "Quarterly roadmap review",
        startTime: "2026-11-10T10:00:00Z",
        endTime: "2026-11-10T11:00:00Z",
        color: "#10b981",
      },
      { bridge }
    );

    expect(created.id).toBeDefined();
    expect(created.title).toBe("Product Sync");
    expect(created.startTime).toBe("2026-11-10T10:00:00.000Z");
    expect(created.endTime).toBe("2026-11-10T11:00:00.000Z");
    expect(created.rrule).toBeNull();
    expect(created.exdates).toEqual([]);

    expect(bridge.emitted).toHaveLength(1);
    expect(bridge.emitted[0].event).toBe("calendar:updated");
    expect(bridge.emitted[0].payload).toMatchObject({
      reason: "created",
      eventId: created.id,
    });

    const fetched = await getCalendarEventById(created.id);
    expect(fetched.title).toBe("Product Sync");
  });

  it("expands a recurring MWF series across a date range", async () => {
    // 2026-11-09 is a Monday
    const series = await createCalendarEvent(
      {
        title: "Morning Standup",
        startTime: "2026-11-09T09:00:00Z",
        endTime: "2026-11-09T09:30:00Z",
        recurrence: {
          frequency: "WEEKLY",
          interval: 1,
          byWeekday: ["MO", "WE", "FR"],
        },
      },
      { bridge }
    );

    expect(series.rrule).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR");

    // Query 1 week: Nov 9 (Mon) to Nov 15 (Sun)
    const instances = await listCalendarEventsInRange({
      rangeStart: "2026-11-09T00:00:00Z",
      rangeEnd: "2026-11-15T23:59:59Z",
    });

    // Should produce Monday Nov 9, Wednesday Nov 11, Friday Nov 13
    expect(instances).toHaveLength(3);

    expect(instances[0].startTime).toBe("2026-11-09T09:00:00.000Z");
    expect(instances[0].endTime).toBe("2026-11-09T09:30:00.000Z");
    expect(instances[0].isRecurring).toBe(true);
    expect(instances[0].isOverride).toBe(false);

    expect(instances[1].startTime).toBe("2026-11-11T09:00:00.000Z");
    expect(instances[2].startTime).toBe("2026-11-13T09:00:00.000Z");
  });

  it("handles single occurrence modification ('this_instance') via exdates and override row", async () => {
    // Create MWF series starting Monday Nov 9
    const series = await createCalendarEvent(
      {
        title: "Team Standup",
        startTime: "2026-11-09T09:00:00Z",
        endTime: "2026-11-09T09:30:00Z",
        recurrence: {
          frequency: "WEEKLY",
          byWeekday: ["MO", "WE", "FR"],
        },
      },
      { bridge }
    );

    // Edit only Wednesday Nov 11 occurrence: move from 09:00 to 14:00
    const override = await updateCalendarEvent(
      {
        id: series.id,
        title: "Special Afternoon Standup",
        startTime: "2026-11-11T14:00:00Z",
        endTime: "2026-11-11T14:30:00Z",
        scope: "this_instance",
        instanceStartTime: "2026-11-11T09:00:00Z",
      },
      { bridge }
    );

    expect(override.title).toBe("Special Afternoon Standup");
    expect(override.recurringEventId).toBe(series.id);
    expect(override.originalStartTime).toBe("2026-11-11T09:00:00.000Z");

    // Parent series exdates should contain the original Wednesday timestamp
    const parent = await getCalendarEventById(series.id);
    expect(parent.exdates).toContain("2026-11-11T09:00:00.000Z");

    // Listing events in range should yield Monday (9:00), Wednesday (14:00 override), Friday (9:00)
    const instances = await listCalendarEventsInRange({
      rangeStart: "2026-11-09T00:00:00Z",
      rangeEnd: "2026-11-15T23:59:59Z",
    });

    expect(instances).toHaveLength(3);
    expect(instances[0].startTime).toBe("2026-11-09T09:00:00.000Z");
    expect(instances[0].isOverride).toBe(false);

    expect(instances[1].title).toBe("Special Afternoon Standup");
    expect(instances[1].startTime).toBe("2026-11-11T14:00:00.000Z");
    expect(instances[1].isOverride).toBe(true);
    expect(instances[1].masterEventId).toBe(series.id);

    expect(instances[2].startTime).toBe("2026-11-13T09:00:00.000Z");
    expect(instances[2].isOverride).toBe(false);
  });

  it("handles single occurrence deletion ('this_instance') via exdates exclusion", async () => {
    // Create MWF series
    const series = await createCalendarEvent(
      {
        title: "Sprint Sync",
        startTime: "2026-11-09T09:00:00Z",
        endTime: "2026-11-09T09:30:00Z",
        recurrence: {
          frequency: "WEEKLY",
          byWeekday: ["MO", "WE", "FR"],
        },
      },
      { bridge }
    );

    // Delete Friday Nov 13 occurrence
    await deleteCalendarEvent(
      {
        id: series.id,
        scope: "this_instance",
        instanceStartTime: "2026-11-13T09:00:00Z",
      },
      { bridge }
    );

    const parent = await getCalendarEventById(series.id);
    expect(parent.exdates).toContain("2026-11-13T09:00:00.000Z");

    // Instances should now only be Monday and Wednesday
    const instances = await listCalendarEventsInRange({
      rangeStart: "2026-11-09T00:00:00Z",
      rangeEnd: "2026-11-15T23:59:59Z",
    });

    expect(instances).toHaveLength(2);
    expect(instances.map((i) => i.startTime)).toEqual([
      "2026-11-09T09:00:00.000Z",
      "2026-11-11T09:00:00.000Z",
    ]);
  });

  it("throws descriptive error when target event does not exist", async () => {
    await expect(getCalendarEventById("non-existent-id")).rejects.toThrow(
      /Calendar event not found: non-existent-id/
    );

    await expect(
      updateCalendarEvent({ id: "missing", title: "New" })
    ).rejects.toThrow(/Calendar event not found: missing/);

    await expect(deleteCalendarEvent({ id: "missing" })).rejects.toThrow(
      /Calendar event not found: missing/
    );
  });

  it("throws error when 'this_instance' is requested on non-recurring event", async () => {
    const oneTime = await createCalendarEvent({
      title: "One Time",
      startTime: "2026-11-10T10:00:00Z",
      endTime: "2026-11-10T11:00:00Z",
    });

    await expect(
      updateCalendarEvent({
        id: oneTime.id,
        title: "Attempted Instance",
        scope: "this_instance",
        instanceStartTime: "2026-11-10T10:00:00Z",
      })
    ).rejects.toThrow(/Cannot update single instance of a non-recurring event/);

    await expect(
      deleteCalendarEvent({
        id: oneTime.id,
        scope: "this_instance",
        instanceStartTime: "2026-11-10T10:00:00Z",
      })
    ).rejects.toThrow(/Cannot delete single instance of a non-recurring event/);
  });

  it("deleting entire series cascades and removes all linked override instances", async () => {
    const series = await createCalendarEvent({
      title: "Weekly 1on1",
      startTime: "2026-11-09T10:00:00Z",
      endTime: "2026-11-09T10:30:00Z",
      recurrence: {
        frequency: "WEEKLY",
      },
    });

    // Create an override for the second week (Nov 16)
    await updateCalendarEvent({
      id: series.id,
      title: "Rescheduled 1on1",
      startTime: "2026-11-16T11:00:00Z",
      endTime: "2026-11-16T11:30:00Z",
      scope: "this_instance",
      instanceStartTime: "2026-11-16T10:00:00Z",
    });

    // Delete entire series
    await deleteCalendarEvent({
      id: series.id,
      scope: "entire_series",
    });

    // Both master and override should be gone
    const instances = await listCalendarEventsInRange({
      rangeStart: "2026-11-01T00:00:00Z",
      rangeEnd: "2026-11-30T23:59:59Z",
    });
    expect(instances).toHaveLength(0);
  });
});

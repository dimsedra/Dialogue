import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  createEventInputSchema,
  updateEventInputSchema,
  deleteEventInputSchema,
  dateRangeQueryInputSchema,
  parseRecurrenceRule,
} from "../src/features/calendar/calendar.schema";

describe("BP-CAL-001: Calendar Schema & RFC 5545 Boundary Parsing", () => {
  it("normalizes timestamps to UTC ISO strings for valid one-time events", () => {
    const input = {
      title: "Team Standup",
      startTime: "2026-11-10 09:00:00",
      endTime: "2026-11-10 09:30:00",
    };

    const parsed = createEventInputSchema.parse(input);
    expect(parsed.title).toBe("Team Standup");
    expect(parsed.description).toBe("");
    expect(parsed.allDay).toBe(false);
    expect(parsed.color).toBe("#3b82f6");
    expect(parsed.startTime).toBe(new Date("2026-11-10 09:00:00").toISOString());
    expect(parsed.endTime).toBe(new Date("2026-11-10 09:30:00").toISOString());
    expect(parsed.recurrence).toBeUndefined();
  });

  it("fails loud when endTime is earlier than startTime", () => {
    const input = {
      title: "Backwards Event",
      startTime: "2026-11-10T10:00:00Z",
      endTime: "2026-11-10T09:00:00Z",
    };

    expect(() => createEventInputSchema.parse(input)).toThrow(ZodError);
  });

  it("parses structured recurrence into canonical RFC 5545 string", () => {
    const parsed = parseRecurrenceRule({
      frequency: "WEEKLY",
      interval: 1,
      byWeekday: ["MO", "WE", "FR"],
    });

    expect(parsed).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR");
  });

  it("validates and canonicalizes raw RFC 5545 string", () => {
    const parsed = parseRecurrenceRule("FREQ=DAILY;INTERVAL=2;COUNT=5");
    expect(parsed).toBe("FREQ=DAILY;INTERVAL=2;COUNT=5");
  });

  it("fails fast and loud on malformed raw recurrence string", () => {
    expect(() => parseRecurrenceRule("NOT_A_VALID_RRULE")).toThrow();
  });

  it("requires instanceStartTime when updateEventInputSchema scope is 'this_instance'", () => {
    const valid = {
      id: "evt-1",
      title: "Updated Single Occurrence",
      scope: "this_instance" as const,
      instanceStartTime: "2026-11-11T09:00:00Z",
    };

    const parsed = updateEventInputSchema.parse(valid);
    expect(parsed.instanceStartTime).toBe("2026-11-11T09:00:00.000Z");

    const invalid = {
      id: "evt-1",
      title: "Missing instanceStartTime",
      scope: "this_instance" as const,
    };

    expect(() => updateEventInputSchema.parse(invalid)).toThrow(ZodError);
  });

  it("requires instanceStartTime when deleteEventInputSchema scope is 'this_instance'", () => {
    const valid = {
      id: "evt-1",
      scope: "this_instance" as const,
      instanceStartTime: "2026-11-11T09:00:00Z",
    };

    const parsed = deleteEventInputSchema.parse(valid);
    expect(parsed.instanceStartTime).toBe("2026-11-11T09:00:00.000Z");

    const invalid = {
      id: "evt-1",
      scope: "this_instance" as const,
    };

    expect(() => deleteEventInputSchema.parse(invalid)).toThrow(ZodError);
  });

  it("validates dateRangeQueryInputSchema and enforces rangeEnd >= rangeStart", () => {
    const valid = {
      rangeStart: "2026-11-01T00:00:00Z",
      rangeEnd: "2026-11-30T23:59:59Z",
    };
    const parsed = dateRangeQueryInputSchema.parse(valid);
    expect(parsed.rangeStart).toBe("2026-11-01T00:00:00.000Z");
    expect(parsed.rangeEnd).toBe("2026-11-30T23:59:59.000Z");

    const invalid = {
      rangeStart: "2026-11-30T00:00:00Z",
      rangeEnd: "2026-11-01T00:00:00Z",
    };
    expect(() => dateRangeQueryInputSchema.parse(invalid)).toThrow(ZodError);
  });
});

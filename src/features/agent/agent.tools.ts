import { tool } from "ai";
import { z } from "zod";
import {
  createCalendarEvent,
  listCalendarEventsInRange,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "../calendar/calendar.service";
import type { SyncEventBridge } from "../../core/sync";

export interface CalendarToolsOptions {
  bridge?: SyncEventBridge;
}

export function createCalendarTools(options: CalendarToolsOptions = {}) {
  return {
    listEvents: tool({
      description:
        "List calendar events and recurring occurrences within a specified date range [rangeStart, rangeEnd].",
      inputSchema: z.object({
        rangeStart: z
          .string()
          .describe("ISO 8601 start date-time, e.g. 2026-11-10T00:00:00Z"),
        rangeEnd: z
          .string()
          .describe("ISO 8601 end date-time, e.g. 2026-11-10T23:59:59Z"),
      }),
      execute: async ({ rangeStart, rangeEnd }) => {
        return listCalendarEventsInRange({ rangeStart, rangeEnd });
      },
    }),

    createEvent: tool({
      description:
        "Create a new calendar event. Supports one-time events and recurring events (e.g. DAILY, WEEKLY on specific weekdays).",
      inputSchema: z.object({
        title: z.string().describe("Event title"),
        startTime: z.string().describe("Start time as ISO 8601 string"),
        endTime: z.string().describe("End time as ISO 8601 string"),
        description: z
          .string()
          .optional()
          .describe("Optional notes or location"),
        allDay: z
          .boolean()
          .optional()
          .describe("Whether this is an all-day event"),
        color: z
          .string()
          .optional()
          .describe("Color hex code, e.g. #3b82f6"),
        recurrence: z
          .object({
            frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
            interval: z.number().int().positive().optional(),
            byWeekday: z
              .array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]))
              .optional(),
            count: z.number().int().positive().optional(),
            until: z.string().optional(),
          })
          .optional()
          .describe("Recurrence rule configuration if repeating"),
      }),
      execute: async (args) => {
        return createCalendarEvent(args, { bridge: options.bridge });
      },
    }),

    updateEvent: tool({
      description:
        "Update an existing calendar event. Can update an entire series or a single recurring occurrence (via scope='this_instance' and instanceStartTime).",
      inputSchema: z.object({
        id: z
          .string()
          .describe(
            "The ID of the event or master recurring series to update"
          ),
        title: z.string().optional().describe("New title"),
        startTime: z
          .string()
          .optional()
          .describe("New start time as ISO 8601 string"),
        endTime: z
          .string()
          .optional()
          .describe("New end time as ISO 8601 string"),
        description: z.string().optional().describe("New description"),
        allDay: z.boolean().optional(),
        color: z.string().optional(),
        scope: z
          .enum(["this_instance", "entire_series"])
          .optional()
          .default("entire_series")
          .describe(
            "Whether to update only this single occurrence ('this_instance') or all occurrences in the series ('entire_series')"
          ),
        instanceStartTime: z
          .string()
          .optional()
          .describe(
            "The original occurrence start time as ISO 8601 string. Required when scope is 'this_instance'"
          ),
      }),
      execute: async (args) => {
        return updateCalendarEvent(args, { bridge: options.bridge });
      },
    }),

    deleteEvent: tool({
      description:
        "Delete a calendar event. Can delete an entire series or a single recurring occurrence (via scope='this_instance' and instanceStartTime).",
      inputSchema: z.object({
        id: z
          .string()
          .describe(
            "The ID of the event or master recurring series to delete"
          ),
        scope: z
          .enum(["this_instance", "entire_series"])
          .optional()
          .default("entire_series")
          .describe(
            "Whether to delete only this single occurrence ('this_instance') or all occurrences in the series ('entire_series')"
          ),
        instanceStartTime: z
          .string()
          .optional()
          .describe(
            "The original occurrence start time as ISO 8601 string. Required when scope is 'this_instance'"
          ),
      }),
      execute: async (args) => {
        return deleteCalendarEvent(args, { bridge: options.bridge });
      },
    }),
  };
}

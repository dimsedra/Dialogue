import { z } from "zod";
import { RRule, rrulestr, type Frequency } from "rrule";

export const weekdaySchema = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
export type WeekdayCode = z.infer<typeof weekdaySchema>;

export const frequencySchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
export type FrequencyType = z.infer<typeof frequencySchema>;

export const structuredRecurrenceSchema = z.object({
  frequency: frequencySchema,
  interval: z.number().int().positive().optional().default(1),
  byWeekday: z.array(weekdaySchema).min(1).optional(),
  count: z.number().int().positive().optional(),
  until: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid ISO timestamp for 'until'")
    .transform((val) => new Date(val).toISOString())
    .optional(),
});
export type StructuredRecurrence = z.infer<typeof structuredRecurrenceSchema>;

export const recurrenceInputSchema = z.union([
  structuredRecurrenceSchema,
  z.string().min(1),
]);
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;

const FREQUENCY_MAP: Record<FrequencyType, Frequency> = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
};

const WEEKDAY_MAP: Record<WeekdayCode, typeof RRule.MO> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

export function parseRecurrenceRule(
  input: RecurrenceInput | null | undefined
): string | null {
  if (!input) {
    return null;
  }

  if (typeof input === "string") {
    try {
      const cleanInput = input.startsWith("RRULE:") ? input.slice(6) : input;
      const parsed = rrulestr(cleanInput);
      return parsed.toString().replace(/^RRULE:/, "");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid RFC 5545 recurrence rule '${input}': ${message}`);
    }
  }

  try {
    const validated = structuredRecurrenceSchema.parse(input);
    const rule = new RRule({
      freq: FREQUENCY_MAP[validated.frequency],
      interval: validated.interval,
      byweekday: validated.byWeekday?.map((d) => WEEKDAY_MAP[d]),
      count: validated.count,
      until: validated.until ? new Date(validated.until) : undefined,
    });
    return rule.toString().replace(/^RRULE:/, "");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid structured recurrence rule: ${message}`);
  }
}

export const createEventInputSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().min(1, "Title is required"),
    description: z.string().optional().default(""),
    startTime: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), "Invalid start_time ISO timestamp")
      .transform((val) => new Date(val).toISOString()),
    endTime: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), "Invalid end_time ISO timestamp")
      .transform((val) => new Date(val).toISOString()),
    allDay: z.boolean().optional().default(false),
    color: z.string().optional().default("#3b82f6"),
    recurrence: recurrenceInputSchema.optional(),
  })
  .refine((data) => Date.parse(data.endTime) >= Date.parse(data.startTime), {
    message: "end_time must be greater than or equal to start_time",
    path: ["endTime"],
  });
export type CreateEventInput = z.input<typeof createEventInputSchema>;

export const updateEventInputSchema = z
  .object({
    id: z.string().min(1, "Event ID is required"),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    startTime: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), "Invalid start_time ISO timestamp")
      .transform((val) => new Date(val).toISOString())
      .optional(),
    endTime: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), "Invalid end_time ISO timestamp")
      .transform((val) => new Date(val).toISOString())
      .optional(),
    allDay: z.boolean().optional(),
    color: z.string().optional(),
    recurrence: recurrenceInputSchema.nullable().optional(),
    scope: z.enum(["this_instance", "entire_series"]).optional().default("entire_series"),
    instanceStartTime: z
      .string()
      .refine(
        (val) => !isNaN(Date.parse(val)),
        "Invalid instanceStartTime ISO timestamp"
      )
      .transform((val) => new Date(val).toISOString())
      .optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return Date.parse(data.endTime) >= Date.parse(data.startTime);
      }
      return true;
    },
    {
      message: "end_time must be greater than or equal to start_time",
      path: ["endTime"],
    }
  )
  .refine(
    (data) => {
      if (data.scope === "this_instance" && !data.instanceStartTime) {
        return false;
      }
      return true;
    },
    {
      message: "instanceStartTime is required when scope is 'this_instance'",
      path: ["instanceStartTime"],
    }
  );
export type UpdateEventInput = z.input<typeof updateEventInputSchema>;

export const deleteEventInputSchema = z
  .object({
    id: z.string().min(1, "Event ID is required"),
    scope: z.enum(["this_instance", "entire_series"]).optional().default("entire_series"),
    instanceStartTime: z
      .string()
      .refine(
        (val) => !isNaN(Date.parse(val)),
        "Invalid instanceStartTime ISO timestamp"
      )
      .transform((val) => new Date(val).toISOString())
      .optional(),
  })
  .refine(
    (data) => {
      if (data.scope === "this_instance" && !data.instanceStartTime) {
        return false;
      }
      return true;
    },
    {
      message: "instanceStartTime is required when scope is 'this_instance'",
      path: ["instanceStartTime"],
    }
  );
export type DeleteEventInput = z.input<typeof deleteEventInputSchema>;

export const dateRangeQueryInputSchema = z
  .object({
    rangeStart: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), "Invalid rangeStart ISO timestamp")
      .transform((val) => new Date(val).toISOString()),
    rangeEnd: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), "Invalid rangeEnd ISO timestamp")
      .transform((val) => new Date(val).toISOString()),
  })
  .refine((data) => Date.parse(data.rangeEnd) >= Date.parse(data.rangeStart), {
    message: "rangeEnd must be greater than or equal to rangeStart",
    path: ["rangeEnd"],
  });
export type DateRangeQueryInput = z.input<typeof dateRangeQueryInputSchema>;

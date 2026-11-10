import { emit, listen } from "@tauri-apps/api/event";
import { z } from "zod";

export const calendarUpdatedPayloadSchema = z.object({
  reason: z.enum(["created", "updated", "deleted"]),
  eventId: z.string().optional(),
  timestamp: z.number(),
});
export type CalendarUpdatedPayload = z.infer<typeof calendarUpdatedPayloadSchema>;

export const chatPromotedPayloadSchema = z.object({
  threadId: z.string().min(1),
  timestamp: z.number(),
});
export type ChatPromotedPayload = z.infer<typeof chatPromotedPayloadSchema>;

export const settingsUpdatedPayloadSchema = z.object({
  timestamp: z.number(),
});
export type SettingsUpdatedPayload = z.infer<typeof settingsUpdatedPayloadSchema>;

export const navigationRequestedPayloadSchema = z.object({
  tab: z.enum(["chat", "calendar", "settings"]),
  threadId: z.string().optional(),
  timestamp: z.number(),
});
export type NavigationRequestedPayload = z.infer<typeof navigationRequestedPayloadSchema>;

export const syncEventSchemas = {
  "calendar:updated": calendarUpdatedPayloadSchema,
  "chat:promoted": chatPromotedPayloadSchema,
  "settings:updated": settingsUpdatedPayloadSchema,
  "navigation:requested": navigationRequestedPayloadSchema,
} as const;

export type SyncChannel = keyof typeof syncEventSchemas;

export type SyncPayloadMap = {
  "calendar:updated": CalendarUpdatedPayload;
  "chat:promoted": ChatPromotedPayload;
  "settings:updated": SettingsUpdatedPayload;
  "navigation:requested": NavigationRequestedPayload;
};

export interface SyncEventBridge {
  emit(event: string, payload: unknown): Promise<void>;
  listen<T>(
    event: string,
    handler: (event: { payload: T }) => void | Promise<void>
  ): Promise<() => void>;
}

const defaultBridge: SyncEventBridge = {
  async emit(event: string, payload: unknown): Promise<void> {
    await emit(event, payload);
  },
  async listen<T>(
    event: string,
    handler: (event: { payload: T }) => void | Promise<void>
  ): Promise<() => void> {
    return listen<T>(event, handler);
  },
};

export interface SyncEventOptions {
  bridge?: SyncEventBridge;
}

export async function emitSyncEvent<C extends SyncChannel>(
  channel: C,
  payload: SyncPayloadMap[C],
  options: SyncEventOptions = {}
): Promise<void> {
  const schema = syncEventSchemas[channel];
  const validatedPayload = schema.parse(payload);
  const bridge = options.bridge ?? defaultBridge;
  await bridge.emit(channel, validatedPayload);
}

export async function onSyncEvent<C extends SyncChannel>(
  channel: C,
  handler: (payload: SyncPayloadMap[C]) => void | Promise<void>,
  options: SyncEventOptions = {}
): Promise<() => void> {
  const schema = syncEventSchemas[channel];
  const bridge = options.bridge ?? defaultBridge;

  return bridge.listen<unknown>(channel, async (event) => {
    const validatedPayload = schema.parse(event.payload);
    await handler(validatedPayload as SyncPayloadMap[C]);
  });
}

import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";
import {
  emitSyncEvent,
  onSyncEvent,
  type SyncEventBridge,
  type SyncChannel,
} from "../src/core/sync";

function createInMemoryBridge(): SyncEventBridge {
  const listeners = new Map<string, Set<(event: { payload: unknown }) => void | Promise<void>>>();

  return {
    async emit(event: string, payload: unknown): Promise<void> {
      const handlers = listeners.get(event);
      if (handlers) {
        for (const handler of Array.from(handlers)) {
          await handler({ payload });
        }
      }
    },
    async listen<T>(
      event: string,
      handler: (event: { payload: T }) => void | Promise<void>
    ): Promise<() => void> {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      const set = listeners.get(event)!;
      const wrappedHandler = handler as (event: { payload: unknown }) => void | Promise<void>;
      set.add(wrappedHandler);

      return () => {
        set.delete(wrappedHandler);
      };
    },
  };
}

describe("BP-CORE-003: Typed Cross-Window Real-Time Event Bus", () => {
  it("validates and delivers 'calendar:updated' events across windows", async () => {
    const bridge = createInMemoryBridge();
    const received: unknown[] = [];

    const unlisten = await onSyncEvent(
      "calendar:updated",
      (payload) => {
        received.push(payload);
      },
      { bridge }
    );

    const validPayload = {
      reason: "created" as const,
      eventId: "evt-100",
      timestamp: 1710000000000,
    };

    await emitSyncEvent("calendar:updated", validPayload, { bridge });

    expect(received).toEqual([validPayload]);
    unlisten();
  });

  it("throws ZodError on invalid 'calendar:updated' payload on emit", async () => {
    const bridge = createInMemoryBridge();

    await expect(
      emitSyncEvent(
        "calendar:updated",
        // @ts-expect-error invalid reason
        { reason: "invalid-reason", timestamp: Date.now() },
        { bridge }
      )
    ).rejects.toThrow(ZodError);
  });

  it("validates and delivers 'chat:promoted' events", async () => {
    const bridge = createInMemoryBridge();
    const received: unknown[] = [];

    const unlisten = await onSyncEvent(
      "chat:promoted",
      (payload) => {
        received.push(payload);
      },
      { bridge }
    );

    const validPayload = {
      threadId: "thread-abc-123",
      timestamp: 1710000000000,
    };

    await emitSyncEvent("chat:promoted", validPayload, { bridge });

    expect(received).toEqual([validPayload]);
    unlisten();
  });

  it("throws ZodError when 'chat:promoted' threadId is empty", async () => {
    const bridge = createInMemoryBridge();

    await expect(
      emitSyncEvent(
        "chat:promoted",
        { threadId: "", timestamp: Date.now() },
        { bridge }
      )
    ).rejects.toThrow(ZodError);
  });

  it("validates and delivers 'settings:updated' events", async () => {
    const bridge = createInMemoryBridge();
    const received: unknown[] = [];

    const unlisten = await onSyncEvent(
      "settings:updated",
      (payload) => {
        received.push(payload);
      },
      { bridge }
    );

    const validPayload = {
      timestamp: 1710000000000,
    };

    await emitSyncEvent("settings:updated", validPayload, { bridge });

    expect(received).toEqual([validPayload]);
    unlisten();
  });

  it("validates and delivers 'navigation:requested' events with and without threadId", async () => {
    const bridge = createInMemoryBridge();
    const received: unknown[] = [];

    const unlisten = await onSyncEvent(
      "navigation:requested",
      (payload) => {
        received.push(payload);
      },
      { bridge }
    );

    await emitSyncEvent(
      "navigation:requested",
      { tab: "calendar", timestamp: 1710000000001 },
      { bridge }
    );

    await emitSyncEvent(
      "navigation:requested",
      { tab: "chat", threadId: "thread-42", timestamp: 1710000000002 },
      { bridge }
    );

    expect(received).toEqual([
      { tab: "calendar", timestamp: 1710000000001 },
      { tab: "chat", threadId: "thread-42", timestamp: 1710000000002 },
    ]);
    unlisten();
  });

  it("unlisten stops future events from firing the handler", async () => {
    const bridge = createInMemoryBridge();
    const handler = vi.fn();

    const unlisten = await onSyncEvent("settings:updated", handler, { bridge });

    await emitSyncEvent("settings:updated", { timestamp: 1 }, { bridge });
    expect(handler).toHaveBeenCalledTimes(1);

    unlisten();

    await emitSyncEvent("settings:updated", { timestamp: 2 }, { bridge });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("throws ZodError fast and loud when incoming received event payload violates schema", async () => {
    const bridge = createInMemoryBridge();
    const handler = vi.fn();

    await onSyncEvent("calendar:updated", handler, { bridge });

    // Directly emit malformed payload through the raw bridge to test incoming boundary validation
    await expect(
      bridge.emit("calendar:updated", { reason: "corrupted_payload", timestamp: "not-a-number" })
    ).rejects.toThrow(ZodError);

    expect(handler).not.toHaveBeenCalled();
  });
});

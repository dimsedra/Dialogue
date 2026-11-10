import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import {
  initDatabase,
  resetDbStateForTesting,
  createNodeSqlExecutor,
} from "../src/core/db";
import {
  saveAppSettings,
} from "../src/features/settings/settings.service";
import { ProviderNotConfiguredError } from "../src/features/settings/settings.schema";
import {
  createCalendarTools,
} from "../src/features/agent/agent.tools";
import {
  runAgentTurn,
  testProviderConnection,
} from "../src/features/agent/agent.service";
import { getCalendarEventById, listCalendarEventsInRange } from "../src/features/calendar/calendar.service";
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

describe("BP-AGENT-002: AI Agent Runner, Tools & Multi-Step Execution", () => {
  let bridge: ReturnType<typeof createInMemoryBridge>;

  beforeEach(async () => {
    resetDbStateForTesting();
    const rawDb = new DatabaseSync(":memory:");
    const testExecutor = createNodeSqlExecutor(rawDb);
    await initDatabase({ executor: testExecutor });
    bridge = createInMemoryBridge();
  });

  it("fails fast with ProviderNotConfiguredError when provider credentials are empty", async () => {
    // DB has default empty API key
    await expect(
      runAgentTurn({
        messages: [{ role: "user", content: "What is on my schedule today?" }],
      })
    ).rejects.toThrow(ProviderNotConfiguredError);

    await expect(testProviderConnection()).rejects.toThrow(
      ProviderNotConfiguredError
    );
  });

  it("calendar tools directly execute against SQLite and emit sync events", async () => {
    const tools = createCalendarTools({ bridge });

    // 1. createEvent tool
    const createResult = await tools.createEvent.execute({
      title: "Design Review",
      startTime: "2026-11-10T14:00:00Z",
      endTime: "2026-11-10T15:00:00Z",
    });

    expect(createResult.title).toBe("Design Review");
    expect(bridge.emitted.some((e) => e.event === "calendar:updated")).toBe(true);

    // 2. listEvents tool
    const listResult = await tools.listEvents.execute({
      rangeStart: "2026-11-10T00:00:00Z",
      rangeEnd: "2026-11-10T23:59:59Z",
    });

    expect(listResult).toHaveLength(1);
    expect(listResult[0].title).toBe("Design Review");

    // 3. updateEvent tool
    const updateResult = await tools.updateEvent.execute({
      id: createResult.id,
      title: "Updated Design Review",
      scope: "entire_series",
    });

    expect(updateResult.title).toBe("Updated Design Review");

    // 4. deleteEvent tool
    const deleteResult = await tools.deleteEvent.execute({
      id: createResult.id,
      scope: "entire_series",
    });

    expect(deleteResult.deletedId).toBe(createResult.id);

    const remaining = await listCalendarEventsInRange({
      rangeStart: "2026-11-10T00:00:00Z",
      rangeEnd: "2026-11-10T23:59:59Z",
    });
    expect(remaining).toHaveLength(0);
  });

  it("runAgentTurn executes multi-step tool call and returns assistant reply", async () => {
    let callIndex = 0;
    const mockModel = new MockLanguageModelV4({
      doStream: async () => {
        callIndex++;
        if (callIndex === 1) {
          // First turn: model calls createEvent tool
          const inputStr = JSON.stringify({
            title: "Dentist Appointment",
            startTime: "2026-11-12T10:00:00.000Z",
            endTime: "2026-11-12T11:00:00.000Z",
          });
          return {
            stream: simulateReadableStream({
              initialDelayInMs: 0,
              chunkDelayInMs: 0,
              chunks: [
                {
                  type: "tool-input-start",
                  id: "call_1",
                  toolName: "createEvent",
                },
                {
                  type: "tool-input-delta",
                  id: "call_1",
                  delta: inputStr,
                },
                {
                  type: "tool-input-end",
                  id: "call_1",
                },
                {
                  type: "tool-call",
                  toolCallId: "call_1",
                  toolName: "createEvent",
                  input: inputStr,
                },
                {
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: "tool-calls" },
                  usage: {
                    inputTokens: { total: 10 },
                    outputTokens: { total: 20 },
                  },
                },
              ],
            }),
            rawCall: {},
          };
        }

        // Second turn: model answers the user with confirmation text
        return {
          stream: simulateReadableStream({
            initialDelayInMs: 0,
            chunkDelayInMs: 0,
            chunks: [
              {
                type: "text-start",
                id: "t1",
              },
              {
                type: "text-delta",
                id: "t1",
                delta: "I've scheduled your Dentist Appointment for Nov 12 at 10:00 AM.",
              },
              {
                type: "text-end",
                id: "t1",
              },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: { total: 15 },
                  outputTokens: { total: 18 },
                },
              },
            ],
          }),
          rawCall: {},
        };
      },
    });

    const textDeltas: string[] = [];
    const turnResult = await runAgentTurn({
      messages: [{ role: "user", content: "Schedule dentist for Nov 12 at 10am" }],
      modelOverride: mockModel,
      bridge,
      onTextDelta: (delta) => textDeltas.push(delta),
    });

    expect(turnResult.replyText).toBe(
      "I've scheduled your Dentist Appointment for Nov 12 at 10:00 AM."
    );
    expect(textDeltas.join("")).toBe(
      "I've scheduled your Dentist Appointment for Nov 12 at 10:00 AM."
    );
    expect(turnResult.toolExecutions).toHaveLength(1);
    expect(turnResult.toolExecutions[0].toolName).toBe("createEvent");

    // Verify SQLite has the event
    const instances = await listCalendarEventsInRange({
      rangeStart: "2026-11-12T00:00:00Z",
      rangeEnd: "2026-11-12T23:59:59Z",
    });
    expect(instances).toHaveLength(1);
    expect(instances[0].title).toBe("Dentist Appointment");
  });

  it("testProviderConnection succeeds with mock model", async () => {
    const mockModel = new MockLanguageModelV4({
      doGenerate: async () => ({
        rawCall: {},
        finishReason: "stop",
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        content: [{ type: "text", text: "ok" }],
      }),
    });

    const result = await testProviderConnection({
      candidateSettings: {
        provider: "openai",
        modelId: "gpt-4o-mini",
        apiKey: "sk-mock-key",
      },
      modelOverride: mockModel,
    });

    expect(result.ok).toBe(true);
    expect(result.modelId).toBe("gpt-4o-mini");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

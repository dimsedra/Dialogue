import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { ZodError } from "zod";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import {
  initDatabase,
  resetDbStateForTesting,
  createNodeSqlExecutor,
} from "../src/core/db";
import {
  createChatThread,
  listChatThreads,
  getChatThreadMessages,
  deleteChatThread,
  sendThreadMessage,
  promoteQuickExchangeToThread,
} from "../src/features/chat/chat.service";
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

describe("BP-CHAT-001: Chat Threads & Ephemeral Promotion Service", () => {
  let bridge: ReturnType<typeof createInMemoryBridge>;

  beforeEach(async () => {
    resetDbStateForTesting();
    const rawDb = new DatabaseSync(":memory:");
    const testExecutor = createNodeSqlExecutor(rawDb);
    await initDatabase({ executor: testExecutor });
    bridge = createInMemoryBridge();
  });

  it("creates, lists, and retrieves messages for chat threads", async () => {
    const thread = await createChatThread("Planning 2027");
    expect(thread.id).toBeDefined();
    expect(thread.title).toBe("Planning 2027");

    const threads = await listChatThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe(thread.id);

    const messages = await getChatThreadMessages(thread.id);
    expect(messages).toHaveLength(0);
  });

  it("sendThreadMessage executes agent turn and persists user and assistant messages", async () => {
    const thread = await createChatThread();

    const mockModel = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
          chunks: [
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Here is your plan for today." },
            { type: "text-end", id: "t1" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: { inputTokens: { total: 5 }, outputTokens: { total: 7 } },
            },
          ],
        }),
        rawCall: {},
      }),
    });

    const { userMessage, assistantMessage } = await sendThreadMessage({
      threadId: thread.id,
      userText: "What is my plan for today?",
      modelOverride: mockModel,
      bridge,
    });

    expect(userMessage.role).toBe("user");
    expect(userMessage.content).toBe("What is my plan for today?");
    expect(assistantMessage.role).toBe("assistant");
    expect(assistantMessage.content).toBe("Here is your plan for today.");

    const messages = await getChatThreadMessages(thread.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe(userMessage.id);
    expect(messages[1].id).toBe(assistantMessage.id);

    // Thread title should have updated automatically from untitled
    const updatedThreads = await listChatThreads();
    expect(updatedThreads[0].title).toBe("What is my plan for today?");
  });

  it("promoteQuickExchangeToThread persists ephemeral exchange into a new thread and emits chat:promoted", async () => {
    const promotedThread = await promoteQuickExchangeToThread(
      {
        exchanges: [
          {
            role: "user",
            content: "Schedule sync meeting tomorrow at 3pm",
          },
          {
            role: "assistant",
            content: "Scheduled sync meeting for tomorrow at 3:00 PM.",
            toolExecutions: [
              {
                toolName: "createEvent",
                args: { title: "sync meeting" },
                result: { id: "evt-123" },
              },
            ],
          },
        ],
      },
      { bridge }
    );

    expect(promotedThread.id).toBeDefined();
    expect(promotedThread.title).toBe("Schedule sync meeting tomorrow");

    expect(bridge.emitted).toHaveLength(1);
    expect(bridge.emitted[0].event).toBe("chat:promoted");
    expect(bridge.emitted[0].payload).toMatchObject({
      threadId: promotedThread.id,
    });

    const messages = await getChatThreadMessages(promotedThread.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Schedule sync meeting tomorrow at 3pm");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe(
      "Scheduled sync meeting for tomorrow at 3:00 PM."
    );
    expect(messages[1].toolExecutions).toHaveLength(1);
    expect(messages[1].toolExecutions[0].toolName).toBe("createEvent");
  });

  it("deleteChatThread deletes the thread and cascades to messages", async () => {
    const thread = await createChatThread("Temporary");
    await promoteQuickExchangeToThread(
      {
        title: "To be deleted",
        exchanges: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
      },
      { bridge }
    );

    const threadsBefore = await listChatThreads();
    expect(threadsBefore).toHaveLength(2);

    await deleteChatThread(thread.id);

    const threadsAfter = await listChatThreads();
    expect(threadsAfter).toHaveLength(1);
    expect(threadsAfter[0].title).toBe("To be deleted");

    const orphanedMessages = await getChatThreadMessages(thread.id);
    expect(orphanedMessages).toHaveLength(0);
  });

  it("throws error when sending message to non-existent thread", async () => {
    await expect(
      sendThreadMessage({
        threadId: "non-existent-thread",
        userText: "Hello?",
      })
    ).rejects.toThrow(/Chat thread not found/);
  });

  it("rejects empty user message text with ZodError", async () => {
    const thread = await createChatThread();
    await expect(
      sendThreadMessage({
        threadId: thread.id,
        userText: "   ",
      })
    ).rejects.toThrow(ZodError);
  });

  it("rejects empty exchanges when promoting to thread with ZodError", async () => {
    await expect(
      promoteQuickExchangeToThread({
        exchanges: [],
      })
    ).rejects.toThrow(ZodError);
  });
});

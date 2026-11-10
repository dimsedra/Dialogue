import { getDb } from "../../core/db";
import { emitSyncEvent, type SyncEventBridge } from "../../core/sync";
import { runAgentTurn, type ExecutedCalendarToolSummary } from "../agent/agent.service";
import type { LanguageModel } from "ai";
import {
  sendMessageInputSchema,
  promoteExchangeInputSchema,
  createChatThreadInputSchema,
  type ChatThread,
  type ChatMessage,
  type PromoteExchangeInput,
} from "./chat.schema";

interface ChatThreadRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  tool_calls_json: string;
  created_at: string;
}

export interface SendThreadMessageOptions {
  threadId: string;
  userText: string;
  onTextDelta?: (delta: string) => void;
  modelOverride?: LanguageModel;
  bridge?: SyncEventBridge;
}

export interface PromoteExchangeOptions {
  bridge?: SyncEventBridge;
}

function mapThreadRow(row: ChatThreadRow): ChatThread {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageRow(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role as "user" | "assistant",
    content: row.content,
    toolExecutions: JSON.parse(
      row.tool_calls_json || "[]"
    ) as ExecutedCalendarToolSummary[],
    createdAt: row.created_at,
  };
}

export async function createChatThread(title?: string): Promise<ChatThread> {
  createChatThreadInputSchema.parse({ title });
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const threadTitle = title?.trim() || "New Conversation";

  await db.execute(
    "INSERT INTO chat_threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, threadTitle, now, now]
  );

  return {
    id,
    title: threadTitle,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listChatThreads(): Promise<ChatThread[]> {
  const db = getDb();
  const rows = await db.select<ChatThreadRow>(
    "SELECT * FROM chat_threads ORDER BY updated_at DESC"
  );
  return rows.map(mapThreadRow);
}

export async function getChatThreadMessages(
  threadId: string
): Promise<ChatMessage[]> {
  const db = getDb();
  const rows = await db.select<ChatMessageRow>(
    "SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC",
    [threadId]
  );
  return rows.map(mapMessageRow);
}

export async function deleteChatThread(threadId: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM chat_messages WHERE thread_id = ?", [threadId]);
  await db.execute("DELETE FROM chat_threads WHERE id = ?", [threadId]);
}

export async function sendThreadMessage(
  options: SendThreadMessageOptions
): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
  const validated = sendMessageInputSchema.parse({
    threadId: options.threadId,
    userText: options.userText,
  });

  const db = getDb();
  const threadRows = await db.select<ChatThreadRow>(
    "SELECT * FROM chat_threads WHERE id = ?",
    [validated.threadId]
  );

  if (threadRows.length === 0) {
    throw new Error(`Chat thread not found: ${validated.threadId}`);
  }

  const existingMessages = await getChatThreadMessages(validated.threadId);
  const agentMessages = [
    ...existingMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: "user" as const,
      content: validated.userText,
    },
  ];

  const turnResult = await runAgentTurn({
    messages: agentMessages,
    modelOverride: options.modelOverride,
    bridge: options.bridge,
    onTextDelta: options.onTextDelta,
  });

  const userMsgId = crypto.randomUUID();
  const userCreatedAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO chat_messages (id, thread_id, role, content, tool_calls_json, created_at)
     VALUES (?, ?, 'user', ?, '[]', ?)`,
    [userMsgId, validated.threadId, validated.userText, userCreatedAt]
  );

  const asstMsgId = crypto.randomUUID();
  const asstCreatedAt = new Date().toISOString();
  const toolCallsJson = JSON.stringify(turnResult.toolExecutions);
  await db.execute(
    `INSERT INTO chat_messages (id, thread_id, role, content, tool_calls_json, created_at)
     VALUES (?, ?, 'assistant', ?, ?, ?)`,
    [asstMsgId, validated.threadId, turnResult.replyText, toolCallsJson, asstCreatedAt]
  );

  const currentThread = threadRows[0];
  const now = new Date().toISOString();
  if (currentThread.title === "New Conversation") {
    const autoTitle = validated.userText.slice(0, 30);
    await db.execute(
      "UPDATE chat_threads SET title = ?, updated_at = ? WHERE id = ?",
      [autoTitle, now, validated.threadId]
    );
  } else {
    await db.execute(
      "UPDATE chat_threads SET updated_at = ? WHERE id = ?",
      [now, validated.threadId]
    );
  }

  return {
    userMessage: {
      id: userMsgId,
      threadId: validated.threadId,
      role: "user",
      content: validated.userText,
      toolExecutions: [],
      createdAt: userCreatedAt,
    },
    assistantMessage: {
      id: asstMsgId,
      threadId: validated.threadId,
      role: "assistant",
      content: turnResult.replyText,
      toolExecutions: turnResult.toolExecutions,
      createdAt: asstCreatedAt,
    },
  };
}

export async function promoteQuickExchangeToThread(
  input: PromoteExchangeInput,
  options: PromoteExchangeOptions = {}
): Promise<ChatThread> {
  const validated = promoteExchangeInputSchema.parse(input);
  const db = getDb();
  const threadId = crypto.randomUUID();
  const now = new Date().toISOString();

  const firstUserMsg = validated.exchanges.find((e) => e.role === "user");
  const threadTitle =
    validated.title ??
    (firstUserMsg ? firstUserMsg.content.slice(0, 30) : "Quick Command Exchange");

  await db.execute(
    "INSERT INTO chat_threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [threadId, threadTitle, now, now]
  );

  for (const exchange of validated.exchanges) {
    const msgId = crypto.randomUUID();
    const toolCallsJson = JSON.stringify(exchange.toolExecutions ?? []);
    await db.execute(
      `INSERT INTO chat_messages (id, thread_id, role, content, tool_calls_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [msgId, threadId, exchange.role, exchange.content, toolCallsJson, now]
    );
  }

  await emitSyncEvent(
    "chat:promoted",
    {
      threadId,
      timestamp: Date.now(),
    },
    { bridge: options.bridge }
  );

  return {
    id: threadId,
    title: threadTitle,
    createdAt: now,
    updatedAt: now,
  };
}

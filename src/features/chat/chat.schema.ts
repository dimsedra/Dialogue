import { z } from "zod";
import type { ExecutedCalendarToolSummary } from "../agent/agent.service";

export const createChatThreadInputSchema = z.object({
  title: z.string().optional(),
});
export type CreateChatThreadInput = z.input<typeof createChatThreadInputSchema>;

export const sendMessageInputSchema = z.object({
  threadId: z.string().min(1, "threadId is required"),
  userText: z.string().trim().min(1, "Message text cannot be empty"),
});
export type SendMessageInput = z.input<typeof sendMessageInputSchema>;

export const promoteExchangeInputSchema = z.object({
  title: z.string().optional(),
  exchanges: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1, "Message content cannot be empty"),
        toolExecutions: z.array(z.any()).optional().default([]),
      })
    )
    .min(1, "Cannot promote an empty exchange"),
});
export type PromoteExchangeInput = z.input<typeof promoteExchangeInputSchema>;

export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  toolExecutions: ExecutedCalendarToolSummary[];
  createdAt: string;
}

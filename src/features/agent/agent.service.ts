import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  streamText,
  generateText,
  isStepCount,
  type LanguageModel,
} from "ai";
import { getAppSettings } from "../settings/settings.service";
import {
  assertProviderConfigured,
  updateSettingsInputSchema,
  type AppSettings,
  type UpdateSettingsInput,
} from "../settings/settings.schema";
import { createCalendarTools } from "./agent.tools";
import type { SyncEventBridge } from "../../core/sync";

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ExecutedCalendarToolSummary {
  toolName: string;
  args: unknown;
  result: unknown;
}

export interface RunAgentTurnInput {
  messages: AgentMessage[];
  nowIso?: string;
  settings?: AppSettings;
  modelOverride?: LanguageModel;
  bridge?: SyncEventBridge;
  onTextDelta?: (delta: string) => void;
  onToolCall?: (toolCall: { name: string; args: unknown }) => void;
}

export function createProviderModel(settings: AppSettings): LanguageModel {
  assertProviderConfigured(settings);

  if (settings.provider === "openai") {
    const openai = createOpenAI({ apiKey: settings.apiKey });
    return openai(settings.modelId);
  }

  if (settings.provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey: settings.apiKey });
    return anthropic(settings.modelId);
  }

  if (settings.provider === "google") {
    const google = createGoogleGenerativeAI({ apiKey: settings.apiKey });
    return google(settings.modelId);
  }

  // openai-compatible
  const custom = createOpenAICompatible({
    name: "custom",
    baseURL: settings.baseUrl,
    apiKey: settings.apiKey || "no-key",
  });
  return custom(settings.modelId);
}

export async function testProviderConnection(options: {
  candidateSettings?: UpdateSettingsInput;
  modelOverride?: LanguageModel;
} = {}): Promise<{ ok: true; modelId: string; latencyMs: number }> {
  let model: LanguageModel;
  let modelId: string;

  if (options.modelOverride) {
    model = options.modelOverride;
    modelId = options.candidateSettings?.modelId ?? "mock-model";
  } else {
    let settings: AppSettings;
    if (options.candidateSettings) {
      const validated = updateSettingsInputSchema.parse(
        options.candidateSettings
      );
      settings = {
        ...validated,
        updatedAt: new Date().toISOString(),
      };
    } else {
      settings = await getAppSettings();
    }

    assertProviderConfigured(settings);
    model = createProviderModel(settings);
    modelId = settings.modelId;
  }

  const startTime = Date.now();
  await generateText({
    model,
    prompt: "Hello",
  });
  const latencyMs = Math.max(0, Date.now() - startTime);

  return { ok: true, modelId, latencyMs };
}

export async function runAgentTurn(
  input: RunAgentTurnInput
): Promise<{ replyText: string; toolExecutions: ExecutedCalendarToolSummary[] }> {
  let model: LanguageModel;

  if (input.modelOverride) {
    model = input.modelOverride;
  } else {
    const settings = input.settings ?? (await getAppSettings());
    assertProviderConfigured(settings);
    model = createProviderModel(settings);
  }

  const now = input.nowIso ? new Date(input.nowIso) : new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  // Compute standard ISO offset, e.g. "+07:00" or "-05:00"
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const hours = String(Math.floor(absMin / 60)).padStart(2, "0");
  const mins = String(absMin % 60).padStart(2, "0");
  const offsetString = `${sign}${hours}:${mins}`;

  // Format local date-time string in ISO 8601 with local timezone offset
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const localFormatted = `${y}-${m}-${d}T${hh}:${mm}:${ss}${offsetString}`;

  const systemPrompt = `You are Dialogue, a helpful, concise personal organizer assistant.
Current user local time: ${localFormatted} (${weekday}, Timezone: ${timeZone}, UTC offset: ${offsetString}).

CRITICAL TIME AND DATE RULES:
1. Relative dates (e.g. "today", "tomorrow", "this Friday") MUST be resolved relative to the current user local time (${localFormatted}).
2. When creating or updating events, ALWAYS specify startTime and endTime in ISO 8601 format including the user's UTC offset (${offsetString}), for example: "${y}-${m}-${d}T11:00:00${offsetString}". Never use UTC "Z" unless the user explicitly asks for UTC.
3. If an event duration is not specified by the user, default to 1 hour after startTime.

You are equipped with calendar tools:
- listEvents: Inspect upcoming and past events and occurrences within a date range [rangeStart, rangeEnd].
- createEvent: Schedule a new standalone or recurring event.
- updateEvent: Edit an event or single recurring occurrence.
- deleteEvent: Remove an event or single recurring occurrence.

Always confirm scheduling, modifications, or deletions clearly and concisely.`;

  const tools = createCalendarTools({ bridge: input.bridge });

  const result = streamText({
    model,
    system: systemPrompt,
    messages: input.messages,
    tools,
    stopWhen: isStepCount(5),
  });

  let replyText = "";
  const toolExecutions: ExecutedCalendarToolSummary[] = [];

  for await (const chunk of result.fullStream) {
    if (chunk.type === "text-delta") {
      replyText += chunk.text;
      input.onTextDelta?.(chunk.text);
    } else if (chunk.type === "tool-call") {
      input.onToolCall?.({ name: chunk.toolName, args: chunk.input });
    } else if (chunk.type === "tool-result") {
      toolExecutions.push({
        toolName: chunk.toolName,
        args: chunk.input,
        result: chunk.output,
      });
    }
  }

  return { replyText, toolExecutions };
}

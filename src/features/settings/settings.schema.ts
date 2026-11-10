import { z } from "zod";
import { shortcutAcceleratorSchema } from "../../core/shortcut";

export const providerTypeSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "openai-compatible",
]);
export type ProviderType = z.infer<typeof providerTypeSchema>;

export const updateSettingsInputSchema = z.object({
  provider: providerTypeSchema.optional().default("openai"),
  modelId: z.string().min(1, "Model ID is required"),
  apiKey: z.string().optional().default(""),
  baseUrl: z
    .string()
    .optional()
    .default("")
    .refine(
      (val) => {
        if (!val || val.trim().length === 0) return true;
        try {
          const parsed = new URL(val);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "baseUrl must be a valid HTTP or HTTPS URL" }
    ),
  globalShortcut: shortcutAcceleratorSchema
    .optional()
    .default("CommandOrControl+Shift+Space"),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;

export interface AppSettings {
  provider: ProviderType;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  globalShortcut: string;
  updatedAt: string;
}

export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}

export function assertProviderConfigured(settings: AppSettings): void {
  if (
    settings.provider === "openai" ||
    settings.provider === "anthropic" ||
    settings.provider === "google"
  ) {
    if (!settings.apiKey || settings.apiKey.trim().length === 0) {
      throw new ProviderNotConfiguredError(
        `API key is required for ${settings.provider} provider. Please configure it in Settings.`
      );
    }
    return;
  }

  if (settings.provider === "openai-compatible") {
    if (!settings.baseUrl || settings.baseUrl.trim().length === 0) {
      throw new ProviderNotConfiguredError(
        "Base URL is required for OpenAI-Compatible provider (e.g. http://localhost:11434/v1)."
      );
    }
    return;
  }
}

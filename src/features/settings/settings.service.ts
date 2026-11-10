import { getDb } from "../../core/db";
import {
  registerQuickCommandShortcut,
  toggleQuickCommandWindow,
} from "../../core/shortcut";
import { emitSyncEvent, type SyncEventBridge } from "../../core/sync";
import {
  updateSettingsInputSchema,
  type AppSettings,
  type UpdateSettingsInput,
  type ProviderType,
} from "./settings.schema";

interface AppSettingsRow {
  id: string;
  provider: string;
  model_id: string;
  api_key: string;
  base_url: string;
  global_shortcut: string;
  updated_at: string;
}

export interface SaveSettingsOptions {
  bridge?: SyncEventBridge;
  skipShortcutRebind?: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  provider: "openai",
  modelId: "gpt-4o-mini",
  apiKey: "",
  baseUrl: "",
  globalShortcut: "CommandOrControl+Shift+Space",
  updatedAt: "",
};

const BROWSER_STORAGE_KEY = "dialogue_settings_preview";

function isBrowserPreview(): boolean {
  return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
}

export async function getAppSettings(): Promise<AppSettings> {
  if (isBrowserPreview()) {
    const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as AppSettings;
      } catch {
        // Fallback to defaults
      }
    }
    return {
      ...DEFAULT_SETTINGS,
      updatedAt: new Date().toISOString(),
    };
  }

  const db = getDb();
  const rows = await db.select<AppSettingsRow>(
    "SELECT * FROM app_settings WHERE id = 'singleton'"
  );

  if (rows.length === 0) {
    return {
      ...DEFAULT_SETTINGS,
      updatedAt: new Date().toISOString(),
    };
  }

  const row = rows[0];
  return {
    provider: row.provider as ProviderType,
    modelId: row.model_id,
    apiKey: row.api_key,
    baseUrl: row.base_url,
    globalShortcut: row.global_shortcut,
    updatedAt: row.updated_at,
  };
}

export async function saveAppSettings(
  input: UpdateSettingsInput,
  options: SaveSettingsOptions = {}
): Promise<AppSettings> {
  const validated = updateSettingsInputSchema.parse(input);
  const now = new Date().toISOString();

  if (isBrowserPreview()) {
    const saved: AppSettings = {
      provider: validated.provider,
      modelId: validated.modelId,
      apiKey: validated.apiKey,
      baseUrl: validated.baseUrl,
      globalShortcut: validated.globalShortcut,
      updatedAt: now,
    };
    localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(saved));
    return saved;
  }

  const db = getDb();
  const current = await getAppSettings();

  if (
    !options.skipShortcutRebind &&
    validated.globalShortcut !== current.globalShortcut
  ) {
    await registerQuickCommandShortcut(
      validated.globalShortcut,
      toggleQuickCommandWindow
    );
  }

  await db.execute(
    `INSERT INTO app_settings (id, provider, model_id, api_key, base_url, global_shortcut, updated_at)
     VALUES ('singleton', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider = excluded.provider,
       model_id = excluded.model_id,
       api_key = excluded.api_key,
       base_url = excluded.base_url,
       global_shortcut = excluded.global_shortcut,
       updated_at = excluded.updated_at`,
    [
      validated.provider,
      validated.modelId,
      validated.apiKey,
      validated.baseUrl,
      validated.globalShortcut,
      now,
    ]
  );

  await emitSyncEvent(
    "settings:updated",
    { timestamp: Date.now() },
    { bridge: options.bridge }
  );

  return getAppSettings();
}

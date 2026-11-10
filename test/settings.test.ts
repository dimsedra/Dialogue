import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { ZodError } from "zod";
import {
  initDatabase,
  resetDbStateForTesting,
  createNodeSqlExecutor,
} from "../src/core/db";
import {
  getAppSettings,
  saveAppSettings,
} from "../src/features/settings/settings.service";
import {
  assertProviderConfigured,
  ProviderNotConfiguredError,
  updateSettingsInputSchema,
} from "../src/features/settings/settings.schema";
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

describe("BP-AGENT-001: Provider & Shortcut Settings Storage", () => {
  let bridge: ReturnType<typeof createInMemoryBridge>;

  beforeEach(async () => {
    resetDbStateForTesting();
    const rawDb = new DatabaseSync(":memory:");
    const testExecutor = createNodeSqlExecutor(rawDb);
    await initDatabase({ executor: testExecutor });
    bridge = createInMemoryBridge();
  });

  it("returns default settings on first launch when no settings row exists", async () => {
    const settings = await getAppSettings();
    expect(settings.provider).toBe("openai");
    expect(settings.modelId).toBe("gpt-4o-mini");
    expect(settings.apiKey).toBe("");
    expect(settings.baseUrl).toBe("");
    expect(settings.globalShortcut).toBe("CommandOrControl+Shift+Space");
  });

  it("saves cloud provider settings, persists to SQLite, and emits settings:updated", async () => {
    const saved = await saveAppSettings(
      {
        provider: "anthropic",
        modelId: "claude-3-5-sonnet-latest",
        apiKey: "sk-ant-test-key",
        globalShortcut: "CommandOrControl+Shift+Space",
      },
      { bridge, skipShortcutRebind: true }
    );

    expect(saved.provider).toBe("anthropic");
    expect(saved.modelId).toBe("claude-3-5-sonnet-latest");
    expect(saved.apiKey).toBe("sk-ant-test-key");

    const reloaded = await getAppSettings();
    expect(reloaded).toEqual(saved);

    expect(bridge.emitted).toHaveLength(1);
    expect(bridge.emitted[0].event).toBe("settings:updated");
  });

  it("saves openai-compatible local settings with valid baseUrl", async () => {
    const saved = await saveAppSettings(
      {
        provider: "openai-compatible",
        modelId: "llama3.2:latest",
        baseUrl: "http://localhost:11434/v1",
        globalShortcut: "CommandOrControl+Shift+Space",
      },
      { bridge, skipShortcutRebind: true }
    );

    expect(saved.provider).toBe("openai-compatible");
    expect(saved.modelId).toBe("llama3.2:latest");
    expect(saved.baseUrl).toBe("http://localhost:11434/v1");

    // assertProviderConfigured passes for local model with baseUrl
    expect(() => assertProviderConfigured(saved)).not.toThrow();
  });

  it("throws ZodError when baseUrl is not a valid HTTP or HTTPS URL", () => {
    expect(() =>
      updateSettingsInputSchema.parse({
        provider: "openai-compatible",
        modelId: "llama3.2",
        baseUrl: "ftp://invalid-url",
      })
    ).toThrow(ZodError);

    expect(() =>
      updateSettingsInputSchema.parse({
        provider: "openai-compatible",
        modelId: "llama3.2",
        baseUrl: "not-a-url",
      })
    ).toThrow(ZodError);
  });

  it("assertProviderConfigured throws ProviderNotConfiguredError when cloud apiKey is missing", () => {
    const unconfigured = {
      provider: "openai" as const,
      modelId: "gpt-4o-mini",
      apiKey: "",
      baseUrl: "",
      globalShortcut: "CommandOrControl+Shift+Space",
      updatedAt: new Date().toISOString(),
    };

    expect(() => assertProviderConfigured(unconfigured)).toThrow(
      ProviderNotConfiguredError
    );
  });

  it("assertProviderConfigured throws ProviderNotConfiguredError when local baseUrl is missing", () => {
    const unconfigured = {
      provider: "openai-compatible" as const,
      modelId: "llama3.2",
      apiKey: "",
      baseUrl: "",
      globalShortcut: "CommandOrControl+Shift+Space",
      updatedAt: new Date().toISOString(),
    };

    expect(() => assertProviderConfigured(unconfigured)).toThrow(
      ProviderNotConfiguredError
    );
  });
});

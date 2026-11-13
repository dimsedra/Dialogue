import { useState, useEffect } from "react";
import { ArrowLeft, PanelLeftOpen } from "lucide-react";
import { getAppSettings, saveAppSettings } from "./settings.service";
import { testProviderConnection } from "../agent/agent.service";
import type { ProviderType } from "./settings.schema";
import { cn } from "../../core/cn";

export interface SettingsViewProps {
  leftOpen?: boolean;
  onOpenLeft?: () => void;
  onBackToChat?: () => void;
}

const PROVIDERS: Array<{
  id: ProviderType;
  name: string;
  defaultModel: string;
  description: string;
  isLocal: boolean;
}> = [
  {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-4o-mini",
    description: "Cloud models including GPT-4o, GPT-4o mini, and o1",
    isLocal: false,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultModel: "claude-3-5-sonnet-latest",
    description: "Cloud models including Claude 3.5 Sonnet and Haiku",
    isLocal: false,
  },
  {
    id: "google",
    name: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    description: "Gemini 2.5 Flash and Pro developer APIs",
    isLocal: false,
  },
  {
    id: "openai-compatible",
    name: "Local / Custom",
    defaultModel: "llama3.2",
    description: "Local Ollama, LM Studio, vLLM, or custom endpoint",
    isLocal: true,
  },
];

export function SettingsView({
  leftOpen = true,
  onOpenLeft,
  onBackToChat,
}: SettingsViewProps) {
  const [provider, setProvider] = useState<ProviderType>("openai");
  const [modelId, setModelId] = useState<string>("gpt-4o-mini");
  const [apiKey, setApiKey] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [globalShortcut, setGlobalShortcut] = useState<string>(
    "CommandOrControl+Shift+Space"
  );
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await getAppSettings();
        setProvider(settings.provider);
        setModelId(settings.modelId);
        setApiKey(settings.apiKey);
        setBaseUrl(settings.baseUrl);
        setGlobalShortcut(settings.globalShortcut);
      } catch {
        setProvider("openai");
        setModelId("gpt-4o-mini");
        setGlobalShortcut("CommandOrControl+Shift+Space");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleProviderSelect = (selectedProvider: ProviderType) => {
    setProvider(selectedProvider);
    setTestStatus(null);
    setSaveStatus(null);
    setErrorMessage(null);

    const config = PROVIDERS.find((p) => p.id === selectedProvider);
    if (config) {
      setModelId(config.defaultModel);
      if (config.isLocal && !baseUrl) {
        setBaseUrl("http://localhost:11434/v1");
      }
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestStatus(null);
    setErrorMessage(null);

    try {
      const res = await testProviderConnection({
        candidateSettings: {
          provider,
          modelId: modelId.trim(),
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim(),
          globalShortcut: globalShortcut.trim(),
        },
      });

      setTestStatus({
        ok: true,
        message: `Connected to ${res.modelId} in ${res.latencyMs}ms`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestStatus({
        ok: false,
        message: `Connection failed: ${msg}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    setErrorMessage(null);

    try {
      await saveAppSettings({
        provider,
        modelId: modelId.trim(),
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        globalShortcut: globalShortcut.trim(),
      });

      setSaveStatus("Settings saved successfully.");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to save settings: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedProviderConfig = PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-paper text-ink select-none">
      {/* Top Header matching 56px three-panel rhythm */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
        <div className="flex min-w-0 items-center gap-2">
          {!leftOpen && onOpenLeft && (
            <button
              type="button"
              onClick={onOpenLeft}
              aria-label="Show sidebar"
              title="Show sidebar"
              className="-ml-1 mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-ink-2 transition hover:bg-active hover:text-ink"
            >
              <PanelLeftOpen className="size-[18px]" />
            </button>
          )}
          <h1 className="truncate text-[15.5px] font-semibold text-ink">
            Settings
          </h1>
        </div>

        {onBackToChat && (
          <button
            type="button"
            onClick={onBackToChat}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink transition hover:border-line-strong hover:bg-sunken"
          >
            <ArrowLeft className="size-3.5" />
            Back to chat
          </button>
        )}
      </header>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-[13.5px] text-ink-2">
          Loading settings…
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto w-full max-w-[42rem] space-y-6 pb-12">
            <div>
              <h2 className="font-display text-[26px] font-medium tracking-[-0.01em] text-ink">
                Local preferences
              </h2>
              <p className="mt-1 text-[14px] text-ink-2">
                Configure your AI model provider, credentials, and Quick Command shortcut.
              </p>
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-rose-800/70 bg-rose-950/30 p-3.5 text-[13.5px] text-rose-200">
                {errorMessage}
              </div>
            )}

            {saveStatus && (
              <div className="rounded-xl border border-emerald-800/70 bg-todo-tint p-3.5 text-[13.5px] font-medium text-todo-fg">
                {saveStatus}
              </div>
            )}

            {/* AI Provider Section */}
            <section className="space-y-5 rounded-2xl border border-line bg-surface p-5">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">AI Provider</h3>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  Select the active model provider for chat and Quick Command.
                </p>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {PROVIDERS.map((p) => {
                  const isSelected = provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleProviderSelect(p.id)}
                      className={cn(
                        "rounded-xl border p-3.5 text-left transition",
                        isSelected
                          ? "border-calendar bg-active text-ink ring-1 ring-calendar/35"
                          : "border-line bg-paper text-ink-2 hover:border-line-strong hover:bg-sunken hover:text-ink"
                      )}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-[14px] font-semibold text-ink">
                          {p.name}
                        </span>
                        {p.isLocal && (
                          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-2">
                            Local
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-ink-2">
                        {p.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4 border-t border-line pt-4">
                {selectedProviderConfig?.isLocal ? (
                  <div className="space-y-1.5">
                    <label className="block text-[12px] font-semibold tracking-wide text-ink-2">
                      Base URL
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="http://localhost:11434/v1"
                      className="h-10 w-full rounded-xl border border-line bg-paper px-3.5 font-mono text-[13.5px] text-ink outline-none transition placeholder:text-ink-4 focus:border-calendar"
                    />
                    <p className="font-mono text-[12px] text-ink-4">
                      Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-[12px] font-semibold tracking-wide text-ink-2">
                        API Key
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowApiKey((prev) => !prev)}
                        className="text-[12px] font-medium text-ink-2 transition hover:text-ink"
                      >
                        {showApiKey ? "Hide" : "Show"}
                      </button>
                    </div>
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`Enter your ${selectedProviderConfig?.name} API key`}
                      className="h-10 w-full rounded-xl border border-line bg-paper px-3.5 font-mono text-[13.5px] text-ink outline-none transition placeholder:text-ink-4 focus:border-calendar"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-[12px] font-semibold tracking-wide text-ink-2">
                    Model ID
                  </label>
                  <input
                    type="text"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    placeholder="e.g. gpt-4o-mini, llama3.2"
                    className="h-10 w-full rounded-xl border border-line bg-paper px-3.5 font-mono text-[13.5px] text-ink outline-none transition placeholder:text-ink-4 focus:border-calendar"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    disabled={isTesting}
                    onClick={() => void handleTestConnection()}
                    className="h-9 rounded-xl border border-line bg-sunken px-4 text-[13px] font-semibold text-ink transition hover:border-line-strong hover:bg-active disabled:opacity-50"
                  >
                    {isTesting ? "Testing…" : "Test connection"}
                  </button>

                  {testStatus && (
                    <span
                      className={cn(
                        "font-mono text-[12.5px]",
                        testStatus.ok ? "text-todo-fg" : "text-rose-300"
                      )}
                    >
                      {testStatus.message}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Quick Command Shortcut */}
            <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">
                  Quick Command shortcut
                </h3>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  Global OS keyboard shortcut to summon and dismiss the floating command bar.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold tracking-wide text-ink-2">
                  Hotkey accelerator
                </label>
                <input
                  type="text"
                  value={globalShortcut}
                  onChange={(e) => setGlobalShortcut(e.target.value)}
                  placeholder="CommandOrControl+Shift+Space"
                  className="h-10 w-full rounded-xl border border-line bg-paper px-3.5 font-mono text-[13.5px] text-ink outline-none transition placeholder:text-ink-4 focus:border-calendar"
                />
                <p className="font-mono text-[12px] text-ink-4">
                  Default: CommandOrControl+Shift+Space
                </p>
              </div>
            </section>

            {/* System Timezone */}
            <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">
                  System timezone sync
                </h3>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  Dialogue stays aligned with your device timezone automatically.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-line bg-paper p-3.5">
                <div>
                  <p className="text-[14px] font-semibold text-ink">
                    {Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] text-ink-2">
                    Offset:{" "}
                    {(() => {
                      const offsetMin = -new Date().getTimezoneOffset();
                      const sign = offsetMin >= 0 ? "+" : "-";
                      const absMin = Math.abs(offsetMin);
                      const h = String(Math.floor(absMin / 60)).padStart(2, "0");
                      const m = String(absMin % 60).padStart(2, "0");
                      return `UTC${sign}${h}:${m}`;
                    })()}
                  </p>
                </div>
                <span className="rounded-full bg-todo-tint px-2.5 py-1 text-[12px] font-medium text-todo-fg">
                  Active sync
                </span>
              </div>
            </section>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSave()}
                className="h-10 rounded-xl bg-ink px-5 text-[13.5px] font-semibold text-paper transition hover:bg-white disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

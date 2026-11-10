import { useState, useEffect } from "react";
import {
  getAppSettings,
  saveAppSettings,
} from "./settings.service";
import { testProviderConnection } from "../agent/agent.service";
import type { ProviderType } from "./settings.schema";

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

export function SettingsView() {
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
        // In browser / non-Tauri preview, gracefully fallback to default settings
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#090a0c] text-xs text-[#8b8f98]">
        Loading settings...
      </div>
    );
  }

  const selectedProviderConfig = PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#090a0c] text-[#f3f4f6] overflow-y-auto select-none p-6">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-base font-semibold text-[#f3f4f6]">Settings</h1>
          <p className="text-xs text-[#8b8f98] mt-0.5">
            Configure AI model providers, credentials, and app preferences.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded-md text-xs">
            {errorMessage}
          </div>
        )}

        {saveStatus && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 rounded-md text-xs">
            {saveStatus}
          </div>
        )}

        {/* AI Provider Section */}
        <section className="bg-[#131417] border border-[#22242a] rounded-lg p-4 space-y-4">
          <div>
            <h2 className="text-xs font-semibold text-[#f3f4f6]">AI Provider</h2>
            <p className="text-[11px] text-[#8b8f98] mt-0.5">
              Select the active model provider for the assistant and quick command.
            </p>
          </div>

          {/* Provider Cards */}
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => {
              const isSelected = provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderSelect(p.id)}
                  className={`text-left p-3 rounded-md border transition-all ${
                    isSelected
                      ? "bg-[#1c1e24] border-[#3b82f6] text-[#f3f4f6]"
                      : "bg-[#090a0c] border-[#22242a] text-[#8b8f98] hover:text-[#f3f4f6] hover:bg-[#18191e]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-xs text-[#f3f4f6]">
                      {p.name}
                    </span>
                    {p.isLocal && (
                      <span className="text-[10px] font-mono px-1 py-0.5 bg-[#131417] text-[#8b8f98] rounded border border-[#22242a]">
                        Local
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#8b8f98] leading-tight">
                    {p.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Provider Specific Inputs */}
          <div className="space-y-3 pt-2 border-t border-[#22242a]">
            {selectedProviderConfig?.isLocal ? (
              <div>
                <label className="block text-xs font-medium text-[#8b8f98] mb-1">
                  Base URL
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full bg-[#090a0c] border border-[#22242a] rounded px-3 py-1.5 text-xs text-[#f3f4f6] font-mono outline-none focus:border-[#3b82f6]"
                />
                <p className="text-[11px] text-[#525660] mt-1 font-mono">
                  Ollama default: http://localhost:11434/v1 | LM Studio default: http://localhost:1234/v1
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[#8b8f98]">
                    API Key
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowApiKey((prev) => !prev)}
                    className="text-[11px] text-[#8b8f98] hover:text-[#f3f4f6]"
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter your ${selectedProviderConfig?.name} API key`}
                  className="w-full bg-[#090a0c] border border-[#22242a] rounded px-3 py-1.5 text-xs text-[#f3f4f6] font-mono outline-none focus:border-[#3b82f6]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#8b8f98] mb-1">
                Model ID
              </label>
              <input
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="e.g. gpt-4o-mini, llama3.2"
                className="w-full bg-[#090a0c] border border-[#22242a] rounded px-3 py-1.5 text-xs text-[#f3f4f6] font-mono outline-none focus:border-[#3b82f6]"
              />
            </div>

            {/* Test Connection feedback */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                disabled={isTesting}
                onClick={handleTestConnection}
                className="px-3 py-1.5 bg-[#1c1e24] hover:bg-[#252830] border border-[#22242a] text-[#f3f4f6] rounded text-xs font-medium transition-colors disabled:opacity-50"
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </button>

              {testStatus && (
                <span
                  className={`text-xs ${
                    testStatus.ok ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {testStatus.message}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Global Shortcut Section */}
        <section className="bg-[#131417] border border-[#22242a] rounded-lg p-4 space-y-3">
          <div>
            <h2 className="text-xs font-semibold text-[#f3f4f6]">
              Quick Command Shortcut
            </h2>
            <p className="text-[11px] text-[#8b8f98] mt-0.5">
              Global OS keyboard shortcut used to summon and dismiss the floating quick command bar.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8b8f98] mb-1">
              Hotkey Accelerator
            </label>
            <input
              type="text"
              value={globalShortcut}
              onChange={(e) => setGlobalShortcut(e.target.value)}
              placeholder="CommandOrControl+Shift+Space"
              className="w-full bg-[#090a0c] border border-[#22242a] rounded px-3 py-1.5 text-xs text-[#f3f4f6] font-mono outline-none focus:border-[#3b82f6]"
            />
            <p className="text-[11px] text-[#525660] mt-1 font-mono">
              Default: CommandOrControl+Shift+Space (Cmd+Shift+Space on macOS, Ctrl+Shift+Space on Linux/Windows)
            </p>
          </div>
        </section>

        {/* Save Bar */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

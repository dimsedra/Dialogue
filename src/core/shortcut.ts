import { z } from "zod";
import {
  register,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const VALID_MODIFIERS = new Set([
  "commandorcontrol",
  "cmdorctrl",
  "command",
  "cmd",
  "control",
  "ctrl",
  "alt",
  "option",
  "shift",
  "super",
  "meta",
]);

export class ShortcutRegistrationError extends Error {
  constructor(
    message: string,
    public readonly accelerator: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ShortcutRegistrationError";
  }
}

export const shortcutAcceleratorSchema = z
  .string()
  .transform((val) => val.trim())
  .refine((val) => val.length > 0, {
    message: "Shortcut accelerator cannot be empty",
  })
  .refine(
    (val) => {
      const parts = val.split("+").map((p) => p.trim());
      if (parts.length < 2) return false;

      const hasEmptyPart = parts.some((p) => p.length === 0);
      if (hasEmptyPart) return false;

      const modifiers = parts.slice(0, -1);
      const key = parts[parts.length - 1];

      const allValidModifiers = modifiers.every((m) =>
        VALID_MODIFIERS.has(m.toLowerCase())
      );
      if (!allValidModifiers || modifiers.length === 0) return false;

      if (!key || key.length === 0) return false;
      return true;
    },
    {
      message:
        "Shortcut accelerator must contain at least one modifier (e.g. CommandOrControl, Alt, Shift) followed by a valid key, joined by '+'",
    }
  );

export function parseShortcutAccelerator(raw: string): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length === 0) {
    throw new Error("Shortcut accelerator cannot be empty");
  }

  const parts = trimmed.split("+").map((p) => p.trim());
  if (parts.some((p) => p.length === 0)) {
    throw new Error("Invalid shortcut key: parts cannot be empty");
  }

  const modifiers = parts.slice(0, -1);
  const key = parts[parts.length - 1];

  if (modifiers.length === 0) {
    throw new Error(
      "Shortcut accelerator must contain at least one modifier (e.g. CommandOrControl, Alt, Shift)"
    );
  }

  const allValidModifiers = modifiers.every((m) =>
    VALID_MODIFIERS.has(m.toLowerCase())
  );
  if (!allValidModifiers) {
    throw new Error(
      `Shortcut contains invalid modifier: ${modifiers.join("+")}`
    );
  }

  if (!key || key.length === 0) {
    throw new Error("Invalid shortcut key: missing key component");
  }

  return shortcutAcceleratorSchema.parse(trimmed);
}

let activeShortcut: string | null = null;
let activeHandler: (() => void | Promise<void>) | null = null;

export async function registerQuickCommandShortcut(
  accelerator: string,
  onTrigger: () => void | Promise<void>
): Promise<void> {
  const parsed = parseShortcutAccelerator(accelerator);
  const previousShortcut = activeShortcut;
  const previousHandler = activeHandler;

  if (previousShortcut && previousShortcut === parsed) {
    return;
  }

  if (previousShortcut) {
    try {
      await unregister(previousShortcut);
    } catch {
      // Ignore unregister errors if already unbound
    }
  }

  try {
    await register(parsed, (event) => {
      if (event.state === "Pressed") {
        void onTrigger();
      }
    });

    activeShortcut = parsed;
    activeHandler = onTrigger;
  } catch (err) {
    // Attempt rollback to previous working shortcut
    if (previousShortcut && previousHandler) {
      try {
        await register(previousShortcut, (event) => {
          if (event.state === "Pressed") {
            void previousHandler();
          }
        });
        activeShortcut = previousShortcut;
        activeHandler = previousHandler;
      } catch {
        activeShortcut = null;
        activeHandler = null;
      }
    }

    throw new ShortcutRegistrationError(
      `Failed to register global shortcut '${parsed}': ${
        err instanceof Error ? err.message : String(err)
      }`,
      parsed,
      err
    );
  }
}

export async function focusMainWindow(): Promise<void> {
  const mainWindow = await WebviewWindow.getByLabel("main");
  if (!mainWindow) {
    throw new Error("Main window instance not found");
  }

  await mainWindow.unminimize();
  await mainWindow.show();
  await mainWindow.setFocus();
}

export async function toggleQuickCommandWindow(): Promise<void> {
  const quickWindow = await WebviewWindow.getByLabel("quick-command");
  if (!quickWindow) {
    throw new Error("Quick Command window instance not found");
  }

  const isVisible = await quickWindow.isVisible();
  const isFocused = await quickWindow.isFocused();

  if (isVisible && isFocused) {
    await quickWindow.hide();
  } else {
    await quickWindow.show();
    await quickWindow.setFocus();
  }
}

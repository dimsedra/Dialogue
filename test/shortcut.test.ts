import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseShortcutAccelerator,
  registerQuickCommandShortcut,
  toggleQuickCommandWindow,
  focusMainWindow,
  ShortcutRegistrationError,
} from "../src/core/shortcut";

// Mock Tauri APIs
const mockRegister = vi.fn();
const mockUnregister = vi.fn();
const mockIsRegistered = vi.fn();

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: (...args: unknown[]) => mockRegister(...args),
  unregister: (...args: unknown[]) => mockUnregister(...args),
  isRegistered: (...args: unknown[]) => mockIsRegistered(...args),
}));

const mockMainWindow = {
  label: "main",
  unminimize: vi.fn(),
  show: vi.fn(),
  setFocus: vi.fn(),
};

const mockQuickCommandWindow = {
  label: "quick-command",
  isVisible: vi.fn(),
  isFocused: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  setFocus: vi.fn(),
};

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getByLabel: vi.fn((label: string) => {
      if (label === "main") return mockMainWindow;
      if (label === "quick-command") return mockQuickCommandWindow;
      return null;
    }),
  },
  getCurrentWebviewWindow: vi.fn(() => mockMainWindow),
}));

describe("BP-CORE-001: Global Shortcut Validation & Toggle Boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseShortcutAccelerator (Design by Contract Boundary)", () => {
    it("parses and accepts valid shortcut accelerators", () => {
      expect(parseShortcutAccelerator("CommandOrControl+Shift+Space")).toBe(
        "CommandOrControl+Shift+Space"
      );
      expect(parseShortcutAccelerator("Alt+Space")).toBe("Alt+Space");
      expect(parseShortcutAccelerator("Ctrl+Shift+K")).toBe("Ctrl+Shift+K");
      expect(parseShortcutAccelerator("CmdOrCtrl+Alt+Space")).toBe(
        "CmdOrCtrl+Alt+Space"
      );
    });

    it("rejects empty or whitespace-only shortcut accelerators", () => {
      expect(() => parseShortcutAccelerator("")).toThrowError(
        /Shortcut accelerator cannot be empty/
      );
      expect(() => parseShortcutAccelerator("   ")).toThrowError(
        /Shortcut accelerator cannot be empty/
      );
    });

    it("rejects shortcut accelerators missing modifier or key", () => {
      expect(() => parseShortcutAccelerator("Space")).toThrowError(
        /Shortcut accelerator must contain at least one modifier/
      );
      expect(() => parseShortcutAccelerator("Ctrl+")).toThrowError(
        /Invalid shortcut key/
      );
      expect(() => parseShortcutAccelerator("+Space")).toThrowError(
        /Invalid shortcut key/
      );
    });
  });

  describe("registerQuickCommandShortcut", () => {
    it("unregisters prior shortcut and registers the new accelerator", async () => {
      mockRegister.mockResolvedValueOnce(undefined);

      await registerQuickCommandShortcut("CommandOrControl+Shift+Space", () => {});

      expect(mockRegister).toHaveBeenCalledWith(
        "CommandOrControl+Shift+Space",
        expect.any(Function)
      );

      // Now re-register with Alt+Space
      mockUnregister.mockResolvedValueOnce(undefined);
      mockRegister.mockResolvedValueOnce(undefined);

      await registerQuickCommandShortcut("Alt+Space", () => {});

      expect(mockUnregister).toHaveBeenCalledWith("CommandOrControl+Shift+Space");
      expect(mockRegister).toHaveBeenCalledWith("Alt+Space", expect.any(Function));
    });

    it("restores the previous shortcut if registering the new one fails", async () => {
      mockRegister.mockResolvedValueOnce(undefined);
      await registerQuickCommandShortcut("CommandOrControl+Shift+Space", () => {});

      // Simulate failure on second registration
      mockUnregister.mockResolvedValueOnce(undefined);
      mockRegister.mockRejectedValueOnce(new Error("Shortcut in use by system"));
      mockRegister.mockResolvedValueOnce(undefined); // for rollback

      await expect(
        registerQuickCommandShortcut("Alt+Space", () => {})
      ).rejects.toThrow(ShortcutRegistrationError);

      // Rollback attempted
      expect(mockRegister).toHaveBeenLastCalledWith(
        "CommandOrControl+Shift+Space",
        expect.any(Function)
      );
    });
  });

  describe("window management", () => {
    it("focusMainWindow unminimizes, shows, and focuses main window", async () => {
      await focusMainWindow();
      expect(mockMainWindow.unminimize).toHaveBeenCalled();
      expect(mockMainWindow.show).toHaveBeenCalled();
      expect(mockMainWindow.setFocus).toHaveBeenCalled();
    });

    it("toggleQuickCommandWindow shows and focuses when hidden", async () => {
      mockQuickCommandWindow.isVisible.mockResolvedValueOnce(false);
      mockQuickCommandWindow.isFocused.mockResolvedValueOnce(false);

      await toggleQuickCommandWindow();

      expect(mockQuickCommandWindow.show).toHaveBeenCalled();
      expect(mockQuickCommandWindow.setFocus).toHaveBeenCalled();
      expect(mockQuickCommandWindow.hide).not.toHaveBeenCalled();
    });

    it("toggleQuickCommandWindow hides when visible and focused", async () => {
      mockQuickCommandWindow.isVisible.mockResolvedValueOnce(true);
      mockQuickCommandWindow.isFocused.mockResolvedValueOnce(true);

      await toggleQuickCommandWindow();

      expect(mockQuickCommandWindow.hide).toHaveBeenCalled();
      expect(mockQuickCommandWindow.show).not.toHaveBeenCalled();
    });
  });
});

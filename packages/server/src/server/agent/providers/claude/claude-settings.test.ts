import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

vi.mock("node:os", () => ({
  default: {
    homedir: vi.fn(() => "/mock/home"),
  },
}));

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearClaudeSettingsModelCache, readClaudeSettingsModel } from "./claude-settings.js";

describe("readClaudeSettingsModel", () => {
  afterEach(() => {
    clearClaudeSettingsModelCache();
    vi.restoreAllMocks();
  });

  it("returns model from ANTHROPIC_MODEL in settings.json", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ env: { ANTHROPIC_MODEL: "glm-5.1" } }),
    );
    expect(readClaudeSettingsModel()).toBe("glm-5.1");
    expect(fs.readFileSync).toHaveBeenCalledWith(
      path.join("/mock/home", ".claude", "settings.json"),
      "utf-8",
    );
  });

  it("returns null when settings.json has no ANTHROPIC_MODEL", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ env: { SOME_OTHER_KEY: "value" } }),
    );
    expect(readClaudeSettingsModel()).toBeNull();
  });

  it("falls back to top-level ANTHROPIC_MODEL when env object is missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ ANTHROPIC_MODEL: "top-level-model" }),
    );
    expect(readClaudeSettingsModel()).toBe("top-level-model");
  });

  it("returns null when ANTHROPIC_MODEL is empty string", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ env: { ANTHROPIC_MODEL: "  " } }));
    expect(readClaudeSettingsModel()).toBeNull();
  });

  it("returns null when settings.json does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(readClaudeSettingsModel()).toBeNull();
  });

  it("returns null when settings.json is invalid JSON", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("not json {{{");
    expect(readClaudeSettingsModel()).toBeNull();
  });

  it("respects CLAUDE_CONFIG_DIR env variable", () => {
    process.env.CLAUDE_CONFIG_DIR = "/custom/config";
    try {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ env: { ANTHROPIC_MODEL: "custom-model" } }),
      );
      expect(readClaudeSettingsModel()).toBe("custom-model");
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join("/custom/config", "settings.json"),
        "utf-8",
      );
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  });

  it("caches the result", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ env: { ANTHROPIC_MODEL: "cached-model" } }),
    );
    expect(readClaudeSettingsModel()).toBe("cached-model");
    // Second call should use cache
    expect(readClaudeSettingsModel()).toBe("cached-model");
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it("clears cache on clearClaudeSettingsModelCache", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ env: { ANTHROPIC_MODEL: "first" } }))
      .mockReturnValueOnce(JSON.stringify({ env: { ANTHROPIC_MODEL: "second" } }));
    expect(readClaudeSettingsModel()).toBe("first");
    clearClaudeSettingsModelCache();
    expect(readClaudeSettingsModel()).toBe("second");
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it("does not call os.homedir when CLAUDE_CONFIG_DIR is set", () => {
    process.env.CLAUDE_CONFIG_DIR = "/custom/path";
    try {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      readClaudeSettingsModel();
      expect(os.homedir).not.toHaveBeenCalled();
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  });
});

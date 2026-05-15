import { afterEach, describe, expect, it, vi } from "vitest";

import { getClaudeModels, normalizeClaudeRuntimeModelId } from "./models.js";

// Mock claude-settings so we control the custom model in tests
vi.mock("./claude-settings.js", () => ({
  readClaudeSettingsModel: vi.fn(() => null),
  clearClaudeSettingsModelCache: vi.fn(),
}));

import { readClaudeSettingsModel } from "./claude-settings.js";

describe("getClaudeModels", () => {
  it("returns all claude models", () => {
    const models = getClaudeModels();
    expect(models.map((m) => m.id)).toEqual([
      "claude-opus-4-7[1m]",
      "claude-opus-4-7",
      "claude-opus-4-6[1m]",
      "claude-opus-4-6",
      "claude-sonnet-4-6[1m]",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ]);
  });

  it("marks exactly one model as default", () => {
    const models = getClaudeModels();
    const defaults = models.filter((m) => m.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe("claude-opus-4-6");
  });

  it("returns fresh copies each call", () => {
    const a = getClaudeModels();
    const b = getClaudeModels();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
  });
});

describe("normalizeClaudeRuntimeModelId", () => {
  it("returns exact match for known model IDs", () => {
    expect(normalizeClaudeRuntimeModelId("claude-opus-4-6")).toBe("claude-opus-4-6");
    expect(normalizeClaudeRuntimeModelId("claude-opus-4-6[1m]")).toBe("claude-opus-4-6[1m]");
    expect(normalizeClaudeRuntimeModelId("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(normalizeClaudeRuntimeModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  it("normalizes dated model IDs to base model", () => {
    expect(normalizeClaudeRuntimeModelId("claude-opus-4-6-20260101")).toBe("claude-opus-4-6");
    expect(normalizeClaudeRuntimeModelId("claude-sonnet-4-6-20260101")).toBe("claude-sonnet-4-6");
    expect(normalizeClaudeRuntimeModelId("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5");
  });

  it("preserves [1m] suffix from runtime model strings", () => {
    expect(normalizeClaudeRuntimeModelId("claude-opus-4-6[1m]")).toBe("claude-opus-4-6[1m]");
  });

  it("returns null for empty/null/undefined", () => {
    expect(normalizeClaudeRuntimeModelId(null)).toBeNull();
    expect(normalizeClaudeRuntimeModelId(undefined)).toBeNull();
    expect(normalizeClaudeRuntimeModelId("")).toBeNull();
    expect(normalizeClaudeRuntimeModelId("  ")).toBeNull();
  });

  it("returns null for unrecognized strings", () => {
    expect(normalizeClaudeRuntimeModelId("gpt-5")).toBeNull();
    expect(normalizeClaudeRuntimeModelId("random")).toBeNull();
  });
});

describe("getClaudeModels with custom settings model", () => {
  afterEach(() => {
    vi.mocked(readClaudeSettingsModel).mockReturnValue(null);
  });

  it("prepends custom model from settings.json without isDefault", () => {
    vi.mocked(readClaudeSettingsModel).mockReturnValue("glm-5.1");
    const models = getClaudeModels();
    expect(models[0].id).toBe("glm-5.1");
    expect(models[0].label).toBe("glm-5.1");
    expect(models[0].isDefault).toBeUndefined();
  });

  it("removes isDefault from hardcoded models when custom model is present", () => {
    vi.mocked(readClaudeSettingsModel).mockReturnValue("glm-5.1");
    const models = getClaudeModels();
    const withDefault = models.filter((m) => m.isDefault);
    expect(withDefault).toHaveLength(0);
  });

  it("does not duplicate if custom model already in the list", () => {
    vi.mocked(readClaudeSettingsModel).mockReturnValue("claude-opus-4-6");
    const models = getClaudeModels();
    const opusCount = models.filter((m) => m.id === "claude-opus-4-6").length;
    expect(opusCount).toBe(1);
  });

  it("returns only hardcoded models when settings model is null", () => {
    vi.mocked(readClaudeSettingsModel).mockReturnValue(null);
    const models = getClaudeModels();
    expect(models.map((m) => m.id)).toEqual([
      "claude-opus-4-7[1m]",
      "claude-opus-4-7",
      "claude-opus-4-6[1m]",
      "claude-opus-4-6",
      "claude-sonnet-4-6[1m]",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ]);
    const defaults = models.filter((m) => m.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe("claude-opus-4-6");
  });
});

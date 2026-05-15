import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let cachedModel: string | null | undefined = undefined;

export function readClaudeSettingsModel(): string | null {
  if (cachedModel !== undefined) {
    return cachedModel;
  }
  cachedModel = readModelFromSettingsFile();
  return cachedModel;
}

export function clearClaudeSettingsModelCache(): void {
  cachedModel = undefined;
}

function readModelFromSettingsFile(): string | null {
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
    const settingsPath = path.join(configDir, "settings.json");
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    // ANTHROPIC_MODEL lives inside the "env" object in Claude Code settings.json
    const env = settings.env;
    const model =
      typeof env === "object" && env !== null
        ? (env as Record<string, unknown>).ANTHROPIC_MODEL
        : settings.ANTHROPIC_MODEL;
    if (typeof model === "string" && model.trim().length > 0) {
      return model.trim();
    }
    return null;
  } catch {
    return null;
  }
}

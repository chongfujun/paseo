import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("parseClaudeSessionDescriptor lightweight mode", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-session-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeJsonlFile(entries: Record<string, unknown>[]): Promise<string> {
    const filePath = path.join(tmpDir, "session.jsonl");
    const content = entries.map((e) => JSON.stringify(e)).join("\n");
    await fs.writeFile(filePath, content, "utf8");
    return filePath;
  }

  it("returns full timeline in non-lightweight mode", async () => {
    const filePath = await writeJsonlFile([
      { type: "system", sessionId: "sess-1", cwd: "/project" },
      { type: "user", message: { role: "user", content: "Hello world" } },
      { type: "assistant", message: { role: "assistant", content: "Hi there" } },
    ]);

    const { parseClaudeSessionDescriptor } =
      await import("@server/server/agent/providers/claude/agent");

    const result = await parseClaudeSessionDescriptor(filePath, new Date(), { lightweight: false });

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("sess-1");
    expect(result!.cwd).toBe("/project");
    expect(result!.timeline.length).toBeGreaterThan(0);
  });

  it("returns empty timeline in lightweight mode", async () => {
    const filePath = await writeJsonlFile([
      { type: "system", sessionId: "sess-1", cwd: "/project" },
      { type: "user", message: { role: "user", content: "Hello world" } },
      { type: "assistant", message: { role: "assistant", content: "Hi there" } },
    ]);

    const { parseClaudeSessionDescriptor } =
      await import("@server/server/agent/providers/claude/agent");

    const result = await parseClaudeSessionDescriptor(filePath, new Date(), { lightweight: true });

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("sess-1");
    expect(result!.cwd).toBe("/project");
    expect(result!.timeline).toEqual([]);
  });

  it("still extracts title in lightweight mode", async () => {
    const filePath = await writeJsonlFile([
      { type: "system", sessionId: "sess-2", cwd: "/home/user/repo" },
      { type: "user", message: { role: "user", content: "Fix the login bug" } },
    ]);

    const { parseClaudeSessionDescriptor } =
      await import("@server/server/agent/providers/claude/agent");

    const result = await parseClaudeSessionDescriptor(filePath, new Date(), { lightweight: true });

    expect(result).not.toBeNull();
    expect(result!.title).toContain("Fix the login bug");
    expect(result!.timeline).toEqual([]);
  });

  it("defaults to non-lightweight when option is omitted", async () => {
    const filePath = await writeJsonlFile([
      { type: "system", sessionId: "sess-3", cwd: "/project" },
      { type: "user", message: { role: "user", content: "Test message" } },
    ]);

    const { parseClaudeSessionDescriptor } =
      await import("@server/server/agent/providers/claude/agent");

    const result = await parseClaudeSessionDescriptor(filePath, new Date());

    expect(result).not.toBeNull();
    expect(result!.timeline.length).toBeGreaterThan(0);
  });
});

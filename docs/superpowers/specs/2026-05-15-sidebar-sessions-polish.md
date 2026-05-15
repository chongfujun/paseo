# Sidebar Session Polish: Direct Open, Badge, Rename

## Problem

After implementing per-project lazy loading of discoverable sessions, three gaps remain:

1. Users can't distinguish imported vs unimported sessions in the sidebar
2. Clicking an unimported session triggers a heavy "import" flow that reads JSONL, builds timeline, writes persistence — it times out and fails
3. No way to rename sessions from the sidebar

## Design

### 1. Imported/unimported badge

In `SidebarAgentRow`, show a small text badge on unimported sessions:

- Imported sessions: no badge (default state, keep UI clean)
- Unimported sessions: small gray badge with "未导入" text

The `SidebarAgentEntry.imported` field already exists and distinguishes the two.

### 2. Direct open (replace import-on-click with resume)

The current `SidebarAgentRow.handlePress` for unimported sessions calls `client.importAgent()`, which runs the full import pipeline (read JSONL → build timeline → write persistence). This is slow and times out.

Paseo already has `ClaudeAgentSession` with resume support — when constructed with a `handle.sessionId`, it passes `resume: sessionId` to the Claude Code SDK (line 2304/2321 in agent.ts). This is equivalent to `claude --resume` and is fast.

New flow:

1. Click unimported session → call `agentManager.resumeAgentFromPersistence(handle)` with a lightweight handle `{ provider: "claude", sessionId, nativeHandle: sessionId, metadata: { provider: "claude", cwd } }`
2. This creates a `ClaudeAgentSession` in resume mode — Claude Code loads the session natively
3. The session becomes a managed agent (appears in imported list automatically)
4. Remove the entry from `discoverableSessionsByProject`
5. Navigate to the agent

No JSONL reading, no timeline hydration, no persistence writing by Paseo. Claude Code handles everything natively.

This requires a new store action or RPC path that creates a managed agent via `resumeAgentFromPersistence` instead of the full `importAgent` pipeline. The simplest approach: the sidebar calls `client.resumeAgent()` (new RPC) with the session metadata, the daemon creates the agent via `resumeSession`, and returns the agent ID.

### 3. Right-click rename

Add a context menu to `SidebarAgentRow` triggered by right-click (web) or long-press (native):

- "Rename" option → shows an inline text input or small dialog
- On confirm: call `client.updateAgent(agentId, { name: newTitle })` for imported agents, or update the store for unimported
- For unimported agents: rename is not supported (they don't have a Paseo agent ID yet). Hide the rename option for unimported sessions, or only show it after the session is opened (imported).

### Files to change

| File                                                     | Change                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/app/src/components/sidebar-workspace-list.tsx` | Badge for unimported; right-click context menu; direct open via resume RPC        |
| `packages/app/src/stores/session-store.ts`               | Action to move session from discoverable to imported                              |
| `packages/server/src/shared/messages.ts`                 | New `resume_discovered_agent_request` message type (optional, may reuse existing) |
| `packages/server/src/server/session.ts`                  | Handler for direct-resume RPC                                                     |

### Out of scope

- Session search/filter in sidebar
- Refreshing discoverable list on timer/filesystem watcher
- Reading JSONL directly for read-only preview (deferred — resume is fast enough)

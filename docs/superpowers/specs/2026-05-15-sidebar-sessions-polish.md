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

Paseo already has `client.resumeAgent()` which sends a `resume_agent_request` RPC. On the server, `handleResumeAgentRequest` (session.ts:3045) does the following in order:

1. `unarchiveAgentByHandle(handle)` — safe no-op for never-imported sessions (returns early when no matching storage record found)
2. `resumeAgentFromPersistence(handle, overrides)` — fast. Reads `handle.metadata` for `cwd`, creates a `ClaudeAgentSession` via `client.resumeSession(handle)`, registers as a new managed agent via `registerSession`. Does NOT require a pre-existing persisted record.
3. `unarchiveAgentState(...)` — safe no-op for never-imported sessions
4. `hydrateTimelineFromProvider(snapshot.id)` — **slow**. Reads JSONL and builds Paseo's internal timeline representation.

New flow:

1. **Server-side change**: Add an optional `skipTimelineHydration: z.boolean().optional()` field to `ResumeAgentRequestMessageSchema` (messages.ts:1088). When `true`, `handleResumeAgentRequest` skips step 4 above (`hydrateTimelineFromProvider`). The agent is still registered, persisted, and appears in subscriptions — Claude Code loads the session natively when the user interacts with it, and the timeline populates incrementally via streaming.
2. **Client-side change**: Add a third parameter to `client.resumeAgent()`: `resumeAgent(handle, overrides?, options?: { skipTimelineHydration?: boolean })`. Pass `skipTimelineHydration` through in the RPC message.
3. **Sidebar change**: Click unimported session → call `client.resumeAgent(handle, undefined, { skipTimelineHydration: true })` with handle `{ provider: "claude", sessionId: providerHandleId, nativeHandle: providerHandleId, metadata: { provider: "claude", cwd } }`. The `cwd` comes from `SidebarAgentEntry.cwd` (new field).
4. On success: call `removeDiscoverableSession(serverId, projectKey, providerHandleId)` to remove the entry from the discoverable list. The session appears in the imported list via the existing agent subscription.
5. Navigate to the agent.

No JSONL reading, no timeline hydration by Paseo. Claude Code handles everything natively.

#### `SidebarAgentEntry.cwd`

Add a `cwd: string` field to `SidebarAgentEntry`. For imported agents, derive from `agent.cwd`. For unimported sessions, read from `session.cwd` (already present in `FetchRecentProviderSessionEntry` — verified at messages.ts:676). This is needed to construct the `AgentPersistenceHandle.metadata` for the resume call, which `resumeAgentFromPersistence` reads to determine the working directory.

### 3. Right-click rename

Add a context menu to `SidebarAgentRow` triggered by right-click (web) or long-press (native):

- "Rename" option → shows an inline text input or small dialog
- On confirm: call `client.updateAgent(agentId, { name: newTitle })` for imported agents
- For unimported agents: rename is not supported (they don't have a Paseo agent ID yet). Hide the rename option for unimported sessions.

### Files to change

| File                                                     | Change                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/app/src/hooks/use-sidebar-agents.ts`           | Add `cwd` to `SidebarAgentEntry`                                           |
| `packages/app/src/components/sidebar-workspace-list.tsx` | Badge for unimported; right-click context menu; direct open via resume RPC |
| `packages/server/src/shared/messages.ts`                 | Add `skipTimelineHydration` field to `ResumeAgentRequestMessageSchema`     |
| `packages/server/src/server/session.ts`                  | Skip `hydrateTimelineFromProvider` when `skipTimelineHydration` is set     |
| `packages/server/src/client/daemon-client.ts`            | Add third `options` parameter to `resumeAgent()`                           |

### Out of scope

- Session search/filter in sidebar
- Refreshing discoverable list on timer/filesystem watcher
- Reading JSONL directly for read-only preview (deferred — resume is fast enough)

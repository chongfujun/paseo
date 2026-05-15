# Sidebar Session Polish: Badge, Direct Open, Rename

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the discoverable sessions sidebar with imported/unimported badge, fast direct-open via resume (skip timeline hydration), and right-click rename.

**Architecture:** Server gains a `skipTimelineHydration` option on the existing `resume_agent_request` RPC. Client passes it through. Sidebar uses `resumeAgent` instead of `importAgent` for unimported sessions, adds a badge and context menu.

**Tech Stack:** TypeScript, React Native (Expo), Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-05-15-sidebar-sessions-polish.md`

---

## File Structure

| File                                                     | Responsibility                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/server/src/shared/messages.ts`                 | Add `skipTimelineHydration` to `ResumeAgentRequestMessageSchema` |
| `packages/server/src/server/session.ts`                  | Skip `hydrateTimelineFromProvider` when flag is set              |
| `packages/server/src/client/daemon-client.ts`            | Add third `options` parameter to `resumeAgent()`                 |
| `packages/app/src/hooks/use-sidebar-agents.ts`           | Add `cwd` field to `SidebarAgentEntry`                           |
| `packages/app/src/hooks/use-sidebar-agents.test.ts`      | Tests for `cwd` field                                            |
| `packages/app/src/components/sidebar-workspace-list.tsx` | Badge, context menu, replace importAgent with resumeAgent        |

---

### Task 1: Add `cwd` to `SidebarAgentEntry`

**Files:**

- Modify: `packages/app/src/hooks/use-sidebar-agents.ts`
- Modify: `packages/app/src/hooks/use-sidebar-agents.test.ts`

- [ ] **Step 1: Write failing test for `cwd` on imported agents**

Add to `use-sidebar-agents.test.ts`:

```typescript
it("includes cwd from imported agent", () => {
  const agent = makeAgent({
    id: "a1",
    serverId: "s1",
    cwd: "/home/user/project-x",
    projectPlacement: { projectKey: "/home/user/project-x" },
  });
  const result = deriveSidebarAgents({
    serverId: "s1",
    projectKeys: ["/home/user/project-x"],
    agents: new Map([["a1", agent]]),
    discoverableSessionsByProject: {},
  });
  expect(result["/home/user/project-x"][0].cwd).toBe("/home/user/project-x");
});
```

Run: `npx vitest run packages/app/src/hooks/use-sidebar-agents.test.ts --reporter=verbose -t "includes cwd from imported agent"`
Expected: FAIL — `cwd` not in `SidebarAgentEntry`

- [ ] **Step 2: Write failing test for `cwd` on unimported sessions**

```typescript
it("includes cwd from unimported session", () => {
  const result = deriveSidebarAgents({
    serverId: "s1",
    projectKeys: [],
    agents: new Map(),
    discoverableSessionsByProject: {
      "/home/user/my-project": {
        entries: [
          makeDiscoverable({
            providerHandleId: "handle-x",
            cwd: "/home/user/my-project",
          }),
        ],
        fetched: true,
      },
    },
  });
  expect(result["/home/user/my-project"][0].cwd).toBe("/home/user/my-project");
});
```

Run: `npx vitest run packages/app/src/hooks/use-sidebar-agents.test.ts --reporter=verbose -t "includes cwd from unimported"`
Expected: FAIL

- [ ] **Step 3: Add `cwd` to interface and populate in both branches**

In `use-sidebar-agents.ts`, add to `SidebarAgentEntry`:

```typescript
export interface SidebarAgentEntry {
  projectKey: string;
  agentId: string;
  title: string | null;
  provider: string;
  status: string;
  imported: boolean;
  cwd: string;
}
```

In the imported agent branch (~line 43), add `cwd: agent.cwd`.
In the unimported session branch (~line 61), add `cwd: session.cwd`.

- [ ] **Step 4: Update existing test assertions to include `cwd`**

Two existing tests use `toEqual` with full object literals that lack `cwd`. Add `cwd` to the expected objects:

- Line ~140: "matches agent to project by projectPlacement.projectKey" — add `cwd: "/project"` to the expected object
- Line ~429: "includes discoverable sessions from store bucket" — add `cwd: "/home/user/my-project"` to the expected object

- [ ] **Step 5: Run all tests**

Run: `npx vitest run packages/app/src/hooks/use-sidebar-agents.test.ts --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: Failures in `sidebar-workspace-list.tsx` (references to `agent.cwd` or `SidebarAgentEntry` — these are in Task 4)

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/hooks/use-sidebar-agents.ts packages/app/src/hooks/use-sidebar-agents.test.ts
git commit -m "Add cwd field to SidebarAgentEntry for imported and unimported sessions"
```

---

### Task 2: Server-side `skipTimelineHydration` option

**Files:**

- Modify: `packages/server/src/shared/messages.ts`
- Modify: `packages/server/src/server/session.ts`

- [ ] **Step 1: Add field to schema**

In `messages.ts:1088`, add `skipTimelineHydration` to `ResumeAgentRequestMessageSchema`:

```typescript
export const ResumeAgentRequestMessageSchema = z.object({
  type: z.literal("resume_agent_request"),
  handle: AgentPersistenceHandleSchema,
  overrides: AgentSessionConfigSchema.partial().optional(),
  skipTimelineHydration: z.boolean().optional(),
  requestId: z.string(),
});
```

- [ ] **Step 2: Use flag in handler**

In `session.ts:3048`, destructure the new field:

```typescript
const { handle, overrides, requestId, skipTimelineHydration } = msg;
```

At line 3070, wrap the hydration call:

```typescript
if (!skipTimelineHydration) {
  await this.agentManager.hydrateTimelineFromProvider(snapshot.id);
}
```

The `timelineSize` computation at line 3072 stays the same — it reads the current timeline length (0 if skipped, populated if not).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Clean on server package. Client `daemon-client.ts` may show a type error if it passes the new field — that's fine, Task 3 fixes it.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/shared/messages.ts packages/server/src/server/session.ts
git commit -m "Add skipTimelineHydration option to resume_agent_request RPC"
```

---

### Task 3: Client-side `resumeAgent` options parameter

**Files:**

- Modify: `packages/server/src/client/daemon-client.ts`

- [ ] **Step 1: Add third parameter**

In `daemon-client.ts:1921`, update signature and pass the option:

```typescript
async resumeAgent(
  handle: AgentPersistenceHandle,
  overrides?: Partial<AgentSessionConfig>,
  options?: { skipTimelineHydration?: boolean },
): Promise<AgentSnapshotPayload> {
  const requestId = this.createRequestId();
  const message = SessionInboundMessageSchema.parse({
    type: "resume_agent_request",
    requestId,
    handle,
    ...(overrides ? { overrides } : {}),
    ...(options?.skipTimelineHydration ? { skipTimelineHydration: true } : {}),
  });
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/client/daemon-client.ts
git commit -m "Add options parameter to client resumeAgent for skipTimelineHydration"
```

---

### Task 4: Sidebar — replace importAgent with resumeAgent + badge + rename

**Files:**

- Modify: `packages/app/src/components/sidebar-workspace-list.tsx`

- [ ] **Step 1: Replace `importAgent` with `resumeAgent` in `SidebarAgentRow.handlePress`**

Replace the unimported branch (~line 1990-2013):

```typescript
// Direct open: resume via native Claude Code session loading
setImporting(true);
const client = getHostRuntimeStore().getClient(serverId);
if (!client) {
  setImporting(false);
  return;
}
void client
  .resumeAgent(
    {
      provider: agent.provider,
      sessionId: agent.agentId,
      nativeHandle: agent.agentId,
      metadata: { provider: agent.provider, cwd: agent.cwd },
    },
    undefined,
    { skipTimelineHydration: true },
  )
  .then((result) => {
    useSessionStore.getState().removeDiscoverableSession(serverId, agent.projectKey, agent.agentId);
    onWorkspacePress?.();
    navigateToAgent({ serverId, agentId: result.id, currentPathname });
    return result;
  })
  .catch(() => {
    // Silently fail — the session may still be visible for retry
  })
  .finally(() => setImporting(false));
```

- [ ] **Step 2: Add "未导入" badge for unimported sessions**

In the `SidebarAgentRow` JSX (~line 2035), after the title `<Text>`, add a badge for unimported:

```tsx
{
  !agent.imported && <Text style={sidebarAgentStyles.unimportedBadge}>未导入</Text>;
}
```

Add the style:

```typescript
unimportedBadge: {
  fontSize: theme.fontSize["2xs"],
  color: theme.colors.foregroundMuted,
  backgroundColor: theme.colors.surface2,
  paddingHorizontal: theme.spacing[1],
  paddingVertical: 0,
  borderRadius: theme.borderRadius.sm,
  overflow: "hidden",
  flexShrink: 0,
},
```

- [ ] **Step 3: Add right-click context menu for rename**

Wrap the `<Pressable>` in `SidebarAgentRow` with an `onContextMenu` handler (web) or long-press gesture (native). For the first pass, use an inline state approach:

Add state:

```typescript
const [renaming, setRenaming] = useState(false);
const [renameValue, setRenameValue] = useState(agent.title ?? "");
```

Add rename handler:

```typescript
const handleRename = useCallback(() => {
  if (!serverId || !agent.imported) return;
  const trimmed = renameValue.trim();
  if (!trimmed || trimmed === agent.title) {
    setRenaming(false);
    return;
  }
  const client = getHostRuntimeStore().getClient(serverId);
  if (!client) return;
  void client
    .updateAgent(agent.agentId, { name: trimmed })
    .then(() => setRenaming(false))
    .catch(() => {});
}, [serverId, agent, renameValue]);
```

Add context menu via `onContextMenu` on the Pressable (web only, graceful no-op on native):

```tsx
<Pressable
  style={rowStyle}
  onPress={handlePress}
  onLongPress={() => {
    if (!agent.imported) return;
    setRenaming(true);
    setRenameValue(agent.title ?? "");
  }}
  // @ts-ignore - onContextMenu is web-only and not in RN types.
  onContextMenu={(e) => {
    if (!agent.imported) return;
    e.preventDefault();
    setRenaming(true);
    setRenameValue(agent.title ?? "");
  }}
  disabled={importing}
>
```

When `renaming` is true, replace the title `<Text>` with a `<TextInput>`:

```tsx
{
  renaming ? (
    <TextInput
      value={renameValue}
      onChangeText={setRenameValue}
      onSubmitEditing={handleRename}
      onBlur={() => setRenaming(false)}
      autoFocus
      selectTextOnFocus
      style={sidebarAgentStyles.renameInput}
    />
  ) : (
    <Text style={sidebarAgentStyles.agentTitle} numberOfLines={1}>
      {agent.title ?? "Untitled session"}
    </Text>
  );
}
```

Add styles:

```typescript
renameInput: {
  color: theme.colors.foreground,
  fontSize: theme.fontSize.xs,
  fontWeight: "400",
  flex: 1,
  minWidth: 0,
  padding: 0,
  borderWidth: 0,
  backgroundColor: "transparent",
},
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: Clean

- [ ] **Step 5: Run format**

Run: `npm run format`

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/sidebar-workspace-list.tsx
git commit -m "Replace importAgent with resumeAgent, add unimported badge and right-click rename"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: Clean

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: Clean

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/app/src/hooks/use-sidebar-agents.test.ts --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "Final cleanup for sidebar session polish"
```

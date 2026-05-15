# Discoverable Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken bulk fetch of all discoverable sessions with per-project lazy loading in the sidebar.

**Architecture:** Each project row in the sidebar independently fetches its unimported sessions via `useQueries` (Tanstack Query), passing the project's `cwd` to the existing RPC. The store changes from a flat array to per-project storage. The `deriveSidebarAgents` pure function is updated to read from the new store shape.

**Tech Stack:** React, Zustand, Tanstack Query, Vitest

**Spec:** `docs/superpowers/specs/2026-05-15-discoverable-sessions-design.md`

---

## File Structure

| File                                                        | Responsibility                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/app/src/stores/session-store.ts`                  | Store shape: `discoverableSessions` → `discoverableSessionsByProject` |
| `packages/app/src/hooks/use-sidebar-agents.ts`              | Pure function `deriveSidebarAgents` reads per-project entries         |
| `packages/app/src/hooks/use-sidebar-agents.test.ts`         | Tests for `deriveSidebarAgents`                                       |
| `packages/app/src/hooks/use-discoverable-sessions-query.ts` | New: Tanstack Query hook per project                                  |
| `packages/app/src/components/sidebar-workspace-list.tsx`    | Wire up `useQueries` for discoverable sessions per project            |
| `packages/app/src/runtime/host-runtime.ts`                  | Remove `refreshDiscoverableSessions` from bootstrap                   |

---

### Task 1: Update store shape from flat array to per-project map

**Files:**

- Modify: `packages/app/src/stores/session-store.ts`

- [ ] **Step 1: Update `SessionState` interface**

In `SessionState` interface (~line 288), replace:

```typescript
discoverableSessions: FetchRecentProviderSessionEntry[];
```

with:

```typescript
discoverableSessionsByProject: Record<
  string,
  { entries: FetchRecentProviderSessionEntry[]; fetched: boolean }
>;
```

- [ ] **Step 2: Update default state**

In `createSessionState` (~line 473), replace:

```typescript
discoverableSessions: [],
```

with:

```typescript
discoverableSessionsByProject: {},
```

- [ ] **Step 3: Update store actions interface**

In `SessionStoreActions` (~line 402), replace:

```typescript
setDiscoverableSessions: (serverId: string, sessions: FetchRecentProviderSessionEntry[]) => void;
```

with:

```typescript
setDiscoverableSessionsForProject: (
  serverId: string,
  projectKey: string,
  sessions: FetchRecentProviderSessionEntry[],
) => void;
removeDiscoverableSession: (
  serverId: string,
  projectKey: string,
  providerHandleId: string,
) => void;
```

- [ ] **Step 4: Update store action implementations**

In the store creator (~line 1145), replace the `setDiscoverableSessions` implementation with:

```typescript
setDiscoverableSessionsForProject: (serverId, projectKey, sessions) => {
  set((prev) => {
    const session = prev.sessions[serverId];
    if (!session) return prev;
    return {
      ...prev,
      sessions: {
        ...prev.sessions,
        [serverId]: {
          ...session,
          discoverableSessionsByProject: {
            ...session.discoverableSessionsByProject,
            [projectKey]: { entries: sessions, fetched: true },
          },
        },
      },
    };
  });
},
removeDiscoverableSession: (serverId, projectKey, providerHandleId) => {
  set((prev) => {
    const session = prev.sessions[serverId];
    if (!session) return prev;
    const existing = session.discoverableSessionsByProject[projectKey];
    if (!existing) return prev;
    return {
      ...prev,
      sessions: {
        ...prev.sessions,
        [serverId]: {
          ...session,
          discoverableSessionsByProject: {
            ...session.discoverableSessionsByProject,
            [projectKey]: {
              ...existing,
              entries: existing.entries.filter(
                (e) => e.providerHandleId !== providerHandleId,
              ),
            },
          },
        },
      },
    };
  });
},
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: Failures in `host-runtime.ts` and `use-sidebar-agents.ts` (will fix in subsequent tasks)

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/stores/session-store.ts
git commit -m "Restructure discoverableSessions store from flat array to per-project map"
```

---

### Task 2: Remove bulk fetch from host-runtime bootstrap

**Files:**

- Modify: `packages/app/src/runtime/host-runtime.ts`

- [ ] **Step 1: Remove `refreshDiscoverableSessions` method and its call**

In `host-runtime.ts`:

- Delete the entire `refreshDiscoverableSessions` method (~lines 1775-1789)
- Remove `.then(() => this.refreshDiscoverableSessions(serverId))` from the bootstrap chain (~line 1757)

The bootstrap chain becomes:

```typescript
const bootstrap = Promise.resolve()
  .then(() =>
    this.refreshAgentDirectory({
      serverId,
      subscribe: { subscriptionId: `app:${serverId}` },
      page: { limit: DEFAULT_AGENT_DIRECTORY_PAGE_LIMIT },
    }),
  )
  .then(() => undefined)
  .catch((error) => { ... })
  .finally(() => { ... });
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: host-runtime.ts clean. Remaining failures only in use-sidebar-agents.ts and sidebar-workspace-list.tsx.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/runtime/host-runtime.ts
git commit -m "Remove bulk refreshDiscoverableSessions from host-runtime bootstrap"
```

---

### Task 3: Update `deriveSidebarAgents` pure function and tests

**Files:**

- Modify: `packages/app/src/hooks/use-sidebar-agents.ts`
- Modify: `packages/app/src/hooks/use-sidebar-agents.test.ts`

- [ ] **Step 1: Write failing test for new per-project store shape**

Add a test that passes `discoverableSessionsByProject` instead of `discoverableSessions`:

```typescript
it("reads discoverable sessions from per-project store", () => {
  const result = deriveSidebarAgents({
    serverId: "s1",
    projectKeys: ["/home/user/my-project"],
    agents: new Map(),
    discoverableSessionsByProject: {
      "/home/user/my-project": {
        entries: [
          {
            providerId: "claude",
            providerHandleId: "handle-x",
            cwd: "/home/user/my-project",
            title: "Session from store",
            providerLabel: "Claude",
            firstPromptPreview: null,
            lastPromptPreview: null,
            lastActivityAt: new Date().toISOString(),
            importedAgentId: undefined,
          },
        ],
        fetched: true,
      },
    },
  });

  expect(result["/home/user/my-project"]).toHaveLength(1);
  expect(result["/home/user/my-project"][0]).toEqual({
    agentId: "handle-x",
    title: "Session from store",
    provider: "claude",
    status: "idle",
    imported: false,
  });
});
```

Run: `npx vitest run packages/app/src/hooks/use-sidebar-agents.test.ts --reporter=verbose`
Expected: FAIL (new parameter doesn't exist yet)

- [ ] **Step 2: Update `deriveSidebarAgents` signature and implementation**

Replace the `discoverableSessions` parameter with `discoverableSessionsByProject`:

```typescript
export function deriveSidebarAgents(input: {
  serverId: string | null;
  projectKeys: ReadonlyArray<string>;
  agents: Map<string, Agent> | undefined;
  discoverableSessionsByProject: Record<
    string,
    { entries: FetchRecentProviderSessionEntry[]; fetched: boolean } | undefined
  >;
}): SidebarAgentsByProjectKey {
  const { serverId, projectKeys, agents, discoverableSessionsByProject } = input;
  if (!serverId || projectKeys.length === 0) {
    return {};
  }

  const result: SidebarAgentsByProjectKey = {};

  if (agents && agents.size > 0) {
    for (const agent of agents.values()) {
      if (agent.serverId !== serverId) continue;
      const projectKey = agent.projectPlacement?.projectKey;
      if (!projectKey || !projectKeys.includes(projectKey)) continue;

      if (!result[projectKey]) {
        result[projectKey] = [];
      }
      result[projectKey].push({
        agentId: agent.id,
        title: agent.title,
        provider: agent.provider,
        status: agent.status,
        imported: true,
      });
    }
  }

  for (const [projectKey, bucket] of Object.entries(discoverableSessionsByProject)) {
    if (!bucket || !bucket.entries.length) continue;
    for (const session of bucket.entries) {
      if (session.importedAgentId) continue;
      if (!result[projectKey]) {
        result[projectKey] = [];
      }
      result[projectKey].push({
        agentId: session.providerHandleId,
        title: session.title ?? session.firstPromptPreview,
        provider: session.providerId,
        status: "idle",
        imported: false,
      });
    }
  }

  return result;
}
```

Remove the `resolveDiscoverableProjectKey`, `normalizePath`, and `projectRootPaths` logic — they are no longer needed since sessions are already keyed by projectKey.

Also remove the import of `deriveProjectKey` from `@/utils/agent-grouping`.

- [ ] **Step 3: Update all existing tests**

Update all test calls to use `discoverableSessionsByProject` instead of `discoverableSessions` + `projectRootPaths`. Key changes:

- Tests that passed `discoverableSessions` flat array should now wrap entries in `discoverableSessionsByProject: { [projectKey]: { entries: [...], fetched: true } }`
- Remove `projectRootPaths` from all test inputs
- Remove tests that tested `projectRootPaths` matching logic (no longer relevant — the RPC fetches by `cwd` so results are already per-project)

- [ ] **Step 4: Update `useSidebarAgents` hook**

```typescript
export function useSidebarAgents(
  serverId: string | null,
  projectKeys: ReadonlyArray<string>,
): SidebarAgentsByProjectKey {
  const agents = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.agents : undefined,
  );
  const discoverableSessionsByProject = useSessionStore((state) =>
    serverId ? (state.sessions[serverId]?.discoverableSessionsByProject ?? {}) : {},
  );

  return useMemo(
    () =>
      deriveSidebarAgents({
        serverId,
        projectKeys,
        agents,
        discoverableSessionsByProject,
      }),
    [serverId, projectKeys, agents, discoverableSessionsByProject],
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run packages/app/src/hooks/use-sidebar-agents.test.ts --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/hooks/use-sidebar-agents.ts packages/app/src/hooks/use-sidebar-agents.test.ts
git commit -m "Update deriveSidebarAgents to read from per-project discoverableSessionsByProject"
```

---

### Task 4: Create `useDiscoverableSessionsQuery` hook

**Files:**

- Create: `packages/app/src/hooks/use-discoverable-sessions-query.ts`

- [ ] **Step 1: Write the hook**

Create the query key factory and hook following the same pattern as `use-project-icon-query.ts`:

```typescript
import { useQueries } from "@tanstack/react-query";
import { getHostRuntimeStore, isHostRuntimeConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import type { FetchRecentProviderSessionEntry } from "@server/client/daemon-client";

export function discoverableSessionsQueryKey(serverId: string, cwd: string) {
  return ["discoverableSessions", serverId, cwd] as const;
}

interface DiscoverableProjectQuery {
  serverId: string;
  projectKey: string;
  cwd: string;
}

export function useDiscoverableSessionsQueries(queries: DiscoverableProjectQuery[]) {
  return useQueries({
    queries: queries.map((query) => ({
      queryKey: discoverableSessionsQueryKey(query.serverId, query.cwd),
      queryFn: async () => {
        const client = getHostRuntimeStore().getClient(query.serverId);
        if (!client) return [];
        const result = await client.fetchRecentProviderSessions({
          cwd: query.cwd,
          lightweight: true,
          limit: 200,
        });
        return result.entries;
      },
      enabled: Boolean(
        getHostRuntimeStore().getClient(query.serverId) &&
        isHostRuntimeConnected(getHostRuntimeStore().getSnapshot(query.serverId)) &&
        query.cwd,
      ),
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });
}

export function useWriteDiscoverableSessionsToStore(
  queries: DiscoverableProjectQuery[],
  queryResults: ReturnType<typeof useDiscoverableSessionsQueries>,
) {
  const setDiscoverableSessionsForProject = useSessionStore(
    (state) => state.setDiscoverableSessionsForProject,
  );
  for (let i = 0; i < queryResults.length; i++) {
    const result = queryResults[i];
    const query = queries[i];
    if (!query || result.status !== "success") continue;
    const store = useSessionStore.getState();
    const existing =
      store.sessions[query.serverId]?.discoverableSessionsByProject[query.projectKey];
    if (existing?.fetched) continue;
    setDiscoverableSessionsForProject(
      query.serverId,
      query.projectKey,
      result.data as FetchRecentProviderSessionEntry[],
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/hooks/use-discoverable-sessions-query.ts
git commit -m "Add useDiscoverableSessionsQueries hook for per-project session fetching"
```

---

### Task 5: Wire up discoverable sessions in sidebar

**Files:**

- Modify: `packages/app/src/components/sidebar-workspace-list.tsx`

- [ ] **Step 1: Add import**

Add to imports:

```typescript
import {
  useDiscoverableSessionsQueries,
  useWriteDiscoverableSessionsToStore,
} from "@/hooks/use-discoverable-sessions-query";
```

- [ ] **Step 2: Add queries in `SidebarWorkspaceList` component**

After the `projectIconQueries` block (~line 2446), add the discoverable sessions queries. Build the request list from the same project data:

```typescript
const discoverableSessionRequests = useMemo(() => {
  if (!serverId) return [];
  return projects
    .filter((p) => p.iconWorkingDir.trim())
    .map((p) => ({
      serverId,
      projectKey: p.projectKey,
      cwd: p.iconWorkingDir.trim(),
    }));
}, [serverId, projects]);

const discoverableSessionQueries = useDiscoverableSessionsQueries(discoverableSessionRequests);
useWriteDiscoverableSessionsToStore(discoverableSessionRequests, discoverableSessionQueries);
```

- [ ] **Step 3: Remove `projectRootPaths`**

Remove the `projectRootPaths` useMemo and update the `useSidebarAgents` call to remove the third argument:

```typescript
const agentsByProjectKey = useSidebarAgents(serverId, projectKeys);
```

- [ ] **Step 4: Update `SidebarAgentRow` to remove imported session from discoverable list on auto-import**

In the `handlePress` callback (~line 1993), after `importAgent` succeeds, add:

```typescript
void client
  .importAgent({
    providerId: agent.provider,
    providerHandleId: agent.agentId,
  })
  .then((result) => {
    useSessionStore
      .getState()
      .removeDiscoverableSession(
        serverId,
        /* projectKey — will need to be passed down or derived */,
        agent.agentId,
      );
    onWorkspacePress?.();
    navigateToAgent({ serverId, agentId: result.id, currentPathname });
    return result;
  })
```

The `projectKey` needs to be available in `SidebarAgentRow`. Add it to `SidebarAgentEntry` and pass it through from the parent.

- [ ] **Step 5: Add `projectKey` to `SidebarAgentEntry`**

In `use-sidebar-agents.ts`, add `projectKey: string` to `SidebarAgentEntry` and populate it in both the imported agent and discoverable session branches of `deriveSidebarAgents`.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/components/sidebar-workspace-list.tsx packages/app/src/hooks/use-sidebar-agents.ts
git commit -m "Wire up per-project discoverable sessions in sidebar with useQueries"
```

---

### Task 6: Update tests and verify

**Files:**

- Modify: `packages/app/src/hooks/use-sidebar-agents.test.ts`

- [ ] **Step 1: Update all tests for new function signature**

All existing tests need to be updated:

- Replace `discoverableSessions` flat array with `discoverableSessionsByProject` map
- Remove `projectRootPaths` parameter
- Remove tests that tested `projectRootPaths` matching (remote-based keys, Windows case-insensitive) — these are no longer relevant since the RPC fetches by `cwd`

Key test updates:

```typescript
// Old pattern
discoverableSessions: [
  makeDiscoverable({ cwd: "/project", ... }),
]

// New pattern
discoverableSessionsByProject: {
  "/project": {
    entries: [makeDiscoverable({ cwd: "/project", ... })],
    fetched: true,
  },
},
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run packages/app/src/hooks/use-sidebar-agents.test.ts --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 3: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/hooks/use-sidebar-agents.test.ts
git commit -m "Update use-sidebar-agents tests for per-project store shape"
```

---

### Task 7: Final cleanup and verification

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: Clean

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: Clean

- [ ] **Step 3: Run format**

Run: `npm run format`

- [ ] **Step 4: Commit any formatting changes**

```bash
git add -A
git commit -m "Format and lint cleanup for discoverable sessions refactor"
```

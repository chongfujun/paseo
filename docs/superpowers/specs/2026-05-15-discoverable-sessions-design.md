# Discoverable Sessions: Per-Project Lazy Loading

## Problem

The sidebar should show unimported Claude Code sessions under each project so users can see, search, and open historical sessions directly. The current implementation fetches ALL sessions from ALL projects at startup in a single RPC call, which scans 5000+ JSONL files, returns a huge payload, and crashes with `RangeError: Invalid string length`.

## Design

### Data flow

```
Before (broken):
  Startup → fetch ALL sessions from ALL projects → store globally → sidebar filters by project

After:
  Sidebar renders project → async request (cwd + limit:200 + lightweight:true) → data arrives → render
  Each project loads independently and in parallel
  User sees content appear naturally, no waiting
```

- Remove the bulk `refreshDiscoverableSessions` from startup bootstrap
- Each project loads independently; opening one session does not block loading others
- Loading is transparent — data appears when ready, no loading spinners
- `lightweight: true` means the server only reads the first few lines of each JSONL file (returns title + timestamp, skips full timeline parse)

### Store changes

Replace the flat global array with per-project storage inside the existing `SessionState` (keyed by `serverId`):

```typescript
// Before — inside state.sessions[serverId]
discoverableSessions: FetchRecentProviderSessionEntry[]

// After — inside state.sessions[serverId]
discoverableSessionsByProject: {
  [projectKey: string]: {
    entries: FetchRecentProviderSessionEntry[],
    fetched: boolean,  // prevent duplicate requests
  }
}
```

- `useSidebarAgents` reads from `state.sessions[serverId]?.discoverableSessionsByProject[projectKey]`
- Sidebar checks `fetched` before requesting; skips if already loaded
- Empty projects show nothing until data arrives; no placeholder rows
- `fetched` is a one-time flag per project per app session; no invalidation or re-fetch (out of scope)

### Fetch trigger mechanism

The per-project fetch is triggered by a new `useDiscoverableSessions(serverId, projectKey, cwd)` hook. This hook uses Tanstack Query (already used in the app) to:

1. On mount, check `fetched` flag in store
2. If not fetched, call `client.fetchRecentProviderSessions({ cwd, lightweight: true, limit: 200 })`
3. On success, write results to `discoverableSessionsByProject[projectKey]` and set `fetched = true`
4. Return the entries for the caller to use

The hook is called once per project row in the sidebar component. Tanstack Query handles deduplication and caching. The fetch uses `limit: 200` (the schema max) because per-project directories typically have far fewer than 200 sessions, and fetching all at once avoids the need for server-side pagination.

### Server-side

No server changes needed. The existing `fetch_recent_provider_sessions_request` already supports `cwd`, and `collectRecentClaudeSessions` already filters by `cwd` (only scans the matching project directory). The fix is simply passing `cwd` from the client.

### Pagination ("load more")

Pagination is purely client-side:

- Fetch all sessions for a project in one request (`limit: 200`)
- Sidebar initially displays only the 10 most recent
- "Load more" reveals the next 10 from the already-fetched list
- No additional server requests needed

Since per-project directories contain far fewer files than the previous bulk scan, fetching up to 200 at once is fast and keeps the UI simple.

### Sidebar display

- Show the 10 most recent unimported sessions per project by default
- If more than 10 are fetched, show a "load more" button that reveals the next 10 from the local list
- Unimported sessions have a subtle visual distinction from imported agents (e.g., different icon)
- Imported and unimported sessions are merged in the same list under each project
- `deriveSidebarAgents` merges both lists, using `importedAgentId` field to skip entries that have already been imported (deduplication)

### Auto-import on click

When the user clicks an unimported session:

1. Call `importAgent` to import the session in the background
2. On success, call a store action `removeDiscoverableSession(serverId, projectKey, providerHandleId)` to remove the entry
3. The imported agent appears in the agent list via existing agent subscription
4. `deriveSidebarAgents` uses `importedAgentId` to deduplicate — even if there's a brief overlap where both exist, it won't show duplicates
5. Navigate to the session
6. User sees: click → brief loading → conversation opens

### Files to change

| File                                                     | Change                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/app/src/runtime/host-runtime.ts`               | Remove `refreshDiscoverableSessions` from bootstrap                |
| `packages/app/src/stores/session-store.ts`               | Change `discoverableSessions` to per-project structure             |
| `packages/app/src/hooks/use-sidebar-agents.ts`           | Read from per-project store; add `useDiscoverableSessions` hook    |
| `packages/app/src/components/sidebar-workspace-list.tsx` | Call `useDiscoverableSessions` per project row; "load more" button |

### Out of scope

- Session search/filter within the sidebar (future feature)
- Refreshing the discoverable list on a timer or filesystem watcher
- Import sheet changes (remains as fallback)

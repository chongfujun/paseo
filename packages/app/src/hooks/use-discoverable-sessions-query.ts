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

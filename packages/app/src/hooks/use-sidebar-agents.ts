import { useMemo } from "react";
import { useSessionStore, type Agent } from "@/stores/session-store";
import type { FetchRecentProviderSessionEntry } from "@server/client/daemon-client";

export interface SidebarAgentEntry {
  projectKey: string;
  agentId: string;
  title: string | null;
  provider: string;
  status: string;
  imported: boolean;
}

export interface SidebarAgentsByProjectKey {
  [projectKey: string]: SidebarAgentEntry[];
}

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
        projectKey,
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
        projectKey,
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

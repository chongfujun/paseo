import { useMemo } from "react";
import { useSessionStore, type Agent } from "@/stores/session-store";
import type { FetchRecentProviderSessionEntry } from "@server/client/daemon-client";
import { deriveProjectKey } from "@/utils/agent-grouping";

export interface SidebarAgentEntry {
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
  discoverableSessions: FetchRecentProviderSessionEntry[] | undefined;
}): SidebarAgentsByProjectKey {
  const { serverId, projectKeys, agents, discoverableSessions } = input;
  if (!serverId || projectKeys.length === 0) {
    return {};
  }

  const projectKeySet = new Set(projectKeys);
  const result: SidebarAgentsByProjectKey = {};

  // Imported agents
  if (agents && agents.size > 0) {
    for (const agent of agents.values()) {
      if (agent.serverId !== serverId) continue;
      const projectKey = agent.projectPlacement?.projectKey;
      if (!projectKey || !projectKeySet.has(projectKey)) continue;

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

  // Discoverable (unimported) sessions
  if (discoverableSessions && discoverableSessions.length > 0) {
    for (const session of discoverableSessions) {
      if (session.importedAgentId) continue;
      const projectKey = deriveProjectKey(session.cwd);
      if (!projectKeySet.has(projectKey)) continue;

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

export function useSidebarAgents(
  serverId: string | null,
  projectKeys: ReadonlyArray<string>,
): SidebarAgentsByProjectKey {
  const agents = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.agents : undefined,
  );
  const discoverableSessions = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.discoverableSessions : undefined,
  );

  return useMemo(
    () => deriveSidebarAgents({ serverId, projectKeys, agents, discoverableSessions }),
    [serverId, projectKeys, agents, discoverableSessions],
  );
}

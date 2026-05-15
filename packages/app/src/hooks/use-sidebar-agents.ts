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
  cwd: string;
}

export interface SidebarAgentsByProjectKey {
  [projectKey: string]: SidebarAgentEntry[];
}

function normalizePathForMatch(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

function matchProjectKeyForCwd(
  cwd: string,
  projectWorkspaceDirs: ReadonlyMap<string, string>,
): string | null {
  const norm = normalizePathForMatch(cwd);
  for (const [pk, dir] of projectWorkspaceDirs) {
    if (normalizePathForMatch(dir) === norm) return pk;
  }
  return null;
}

function resolveAgentProjectKey(
  agent: Agent,
  projectKeys: ReadonlyArray<string>,
  projectWorkspaceDirs: ReadonlyMap<string, string> | undefined,
): string | null {
  const projectKey = agent.projectPlacement?.projectKey;
  if (projectKey && projectKeys.includes(projectKey)) return projectKey;
  if (projectWorkspaceDirs && agent.cwd) {
    return matchProjectKeyForCwd(agent.cwd, projectWorkspaceDirs);
  }
  return null;
}

export function deriveSidebarAgents(input: {
  serverId: string | null;
  projectKeys: ReadonlyArray<string>;
  agents: Map<string, Agent> | undefined;
  discoverableSessionsByProject: Record<
    string,
    { entries: FetchRecentProviderSessionEntry[]; fetched: boolean } | undefined
  >;
  projectWorkspaceDirs?: ReadonlyMap<string, string>;
}): SidebarAgentsByProjectKey {
  const { serverId, projectKeys, agents, discoverableSessionsByProject, projectWorkspaceDirs } =
    input;
  if (!serverId || projectKeys.length === 0) {
    return {};
  }

  const result: SidebarAgentsByProjectKey = {};

  if (agents && agents.size > 0) {
    for (const agent of agents.values()) {
      if (agent.serverId !== serverId) continue;
      const matchedProjectKey = resolveAgentProjectKey(agent, projectKeys, projectWorkspaceDirs);
      if (!matchedProjectKey) continue;

      if (!result[matchedProjectKey]) {
        result[matchedProjectKey] = [];
      }
      result[matchedProjectKey].push({
        projectKey: matchedProjectKey,
        agentId: agent.id,
        title: agent.title,
        provider: agent.provider,
        status: agent.status,
        imported: true,
        cwd: agent.cwd,
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
        cwd: session.cwd,
      });
    }
  }

  return result;
}

export function useSidebarAgents(
  serverId: string | null,
  projectKeys: ReadonlyArray<string>,
  projectWorkspaceDirs?: ReadonlyMap<string, string>,
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
        projectWorkspaceDirs,
      }),
    [serverId, projectKeys, agents, discoverableSessionsByProject, projectWorkspaceDirs],
  );
}

import { describe, it, expect } from "vitest";
import { deriveSidebarAgents } from "./use-sidebar-agents";
import type { Agent } from "@/stores/session-store";

function makeAgent(overrides: Partial<Agent> & { id: string; serverId: string }): Agent {
  return {
    provider: "claude",
    status: "idle",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUserMessageAt: null,
    lastActivityAt: new Date(),
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: false,
      supportsReasoningStream: false,
      supportsToolInvocations: false,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    title: null,
    cwd: "/project",
    model: null,
    parentAgentId: null,
    labels: {},
    ...overrides,
  };
}

function makeDiscoverable(
  overrides: Partial<{
    providerId: string;
    providerHandleId: string;
    cwd: string;
    title: string | null;
    firstPromptPreview: string | null;
    lastPromptPreview: string | null;
    lastActivityAt: string;
    importedAgentId: string | undefined;
    providerLabel: string;
  }>,
) {
  return {
    providerId: "claude",
    providerHandleId: "handle-1",
    cwd: "/project",
    title: null as string | null,
    firstPromptPreview: null as string | null,
    lastPromptPreview: null as string | null,
    lastActivityAt: new Date().toISOString(),
    importedAgentId: undefined as string | undefined,
    providerLabel: "Claude",
    ...overrides,
  };
}

const defaultInput = {
  discoverableSessionsByProject: {} as Parameters<
    typeof deriveSidebarAgents
  >[0]["discoverableSessionsByProject"],
};

describe("deriveSidebarAgents", () => {
  it("returns empty when serverId is null", () => {
    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: null,
      projectKeys: ["proj1"],
      agents: new Map([["a1", makeAgent({ id: "a1", serverId: "s1" })]]),
    });
    expect(result).toEqual({});
  });

  it("returns empty when agents is undefined", () => {
    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: "s1",
      projectKeys: ["proj1"],
      agents: undefined,
    });
    expect(result).toEqual({});
  });

  it("returns empty when agents map is empty", () => {
    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: "s1",
      projectKeys: ["proj1"],
      agents: new Map(),
    });
    expect(result).toEqual({});
  });

  it("returns empty when projectKeys is empty", () => {
    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: "s1",
      projectKeys: [],
      agents: new Map([["a1", makeAgent({ id: "a1", serverId: "s1" })]]),
    });
    expect(result).toEqual({});
  });

  it("matches agent to project by projectPlacement.projectKey", () => {
    const agents = new Map([
      [
        "a1",
        makeAgent({
          id: "a1",
          serverId: "s1",
          projectPlacement: {
            projectKey: "proj1",
            projectName: "MyProject",
            checkout: {
              cwd: "/project",
              isGit: false,
              currentBranch: null,
              remoteUrl: null,
              worktreeRoot: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
            },
          },
          title: "Fix bug",
        }),
      ],
    ]);

    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: "s1",
      projectKeys: ["proj1", "proj2"],
      agents,
    });

    expect(result).toEqual({
      proj1: [
        {
          projectKey: "proj1",
          agentId: "a1",
          title: "Fix bug",
          provider: "claude",
          status: "idle",
          imported: true,
        },
      ],
    });
  });

  it("excludes agents from other servers", () => {
    const agents = new Map([
      [
        "a1",
        makeAgent({
          id: "a1",
          serverId: "s1",
          projectPlacement: {
            projectKey: "proj1",
            projectName: "MyProject",
            checkout: {
              cwd: "/project",
              isGit: false,
              currentBranch: null,
              remoteUrl: null,
              worktreeRoot: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
            },
          },
        }),
      ],
    ]);

    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: "s2",
      projectKeys: ["proj1"],
      agents,
    });

    expect(result).toEqual({});
  });

  it("matches agent with cwd-derived projectPlacement", () => {
    const agents = new Map([
      [
        "a1",
        makeAgent({
          id: "a1",
          serverId: "s1",
          cwd: "/home/user/my-project",
          title: "Imported session",
          projectPlacement: {
            projectKey: "/home/user/my-project",
            projectName: "my-project",
            checkout: {
              cwd: "/home/user/my-project",
              isGit: false,
              currentBranch: null,
              remoteUrl: null,
              worktreeRoot: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
            },
          },
        }),
      ],
    ]);

    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: "s1",
      projectKeys: ["/home/user/my-project"],
      agents,
    });

    expect(result["/home/user/my-project"]).toHaveLength(1);
    expect(result["/home/user/my-project"][0].agentId).toBe("a1");
  });

  it("excludes agents with projectKey not in the list", () => {
    const agents = new Map([
      [
        "a1",
        makeAgent({
          id: "a1",
          serverId: "s1",
          projectPlacement: {
            projectKey: "proj-other",
            projectName: "Other",
            checkout: {
              cwd: "/other",
              isGit: false,
              currentBranch: null,
              remoteUrl: null,
              worktreeRoot: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
            },
          },
        }),
      ],
    ]);

    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: "s1",
      projectKeys: ["proj1"],
      agents,
    });

    expect(result).toEqual({});
  });

  it("groups multiple agents under same project", () => {
    const agents = new Map([
      [
        "a1",
        makeAgent({
          id: "a1",
          serverId: "s1",
          title: "Task 1",
          projectPlacement: {
            projectKey: "proj1",
            projectName: "P1",
            checkout: {
              cwd: "/p1",
              isGit: false,
              currentBranch: null,
              remoteUrl: null,
              worktreeRoot: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
            },
          },
        }),
      ],
      [
        "a2",
        makeAgent({
          id: "a2",
          serverId: "s1",
          title: "Task 2",
          projectPlacement: {
            projectKey: "proj1",
            projectName: "P1",
            checkout: {
              cwd: "/p1",
              isGit: false,
              currentBranch: null,
              remoteUrl: null,
              worktreeRoot: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
            },
          },
        }),
      ],
    ]);

    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: "s1",
      projectKeys: ["proj1"],
      agents,
    });

    expect(Object.keys(result)).toEqual(["proj1"]);
    expect(result.proj1).toHaveLength(2);
    expect(result.proj1.map((a) => a.agentId)).toEqual(["a1", "a2"]);
    expect(result.proj1.every((a) => a.imported)).toBe(true);
  });

  it("distributes agents across projects", () => {
    const agents = new Map([
      [
        "a1",
        makeAgent({
          id: "a1",
          serverId: "s1",
          projectPlacement: {
            projectKey: "proj1",
            projectName: "P1",
            checkout: {
              cwd: "/p1",
              isGit: false,
              currentBranch: null,
              remoteUrl: null,
              worktreeRoot: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
            },
          },
        }),
      ],
      [
        "a2",
        makeAgent({
          id: "a2",
          serverId: "s1",
          projectPlacement: {
            projectKey: "proj2",
            projectName: "P2",
            checkout: {
              cwd: "/p2",
              isGit: false,
              currentBranch: null,
              remoteUrl: null,
              worktreeRoot: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
            },
          },
        }),
      ],
    ]);

    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: "s1",
      projectKeys: ["proj1", "proj2"],
      agents,
    });

    expect(Object.keys(result).sort()).toEqual(["proj1", "proj2"]);
    expect(result.proj1).toHaveLength(1);
    expect(result.proj2).toHaveLength(1);
  });

  it("handles null title", () => {
    const agents = new Map([
      [
        "a1",
        makeAgent({
          id: "a1",
          serverId: "s1",
          title: null,
          projectPlacement: {
            projectKey: "proj1",
            projectName: "P1",
            checkout: {
              cwd: "/p1",
              isGit: false,
              currentBranch: null,
              remoteUrl: null,
              worktreeRoot: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
            },
          },
        }),
      ],
    ]);

    const result = deriveSidebarAgents({
      ...defaultInput,
      serverId: "s1",
      projectKeys: ["proj1"],
      agents,
    });

    expect(result.proj1[0].title).toBeNull();
  });

  it("includes discoverable sessions from store bucket", () => {
    const result = deriveSidebarAgents({
      serverId: "s1",
      projectKeys: ["/home/user/my-project"],
      agents: new Map(),
      discoverableSessionsByProject: {
        "/home/user/my-project": {
          entries: [
            makeDiscoverable({
              providerHandleId: "handle-x",
              cwd: "/home/user/my-project",
              title: "Discoverable session",
            }),
          ],
          fetched: true,
        },
      },
    });

    expect(result["/home/user/my-project"]).toHaveLength(1);
    expect(result["/home/user/my-project"][0]).toEqual({
      projectKey: "/home/user/my-project",
      agentId: "handle-x",
      title: "Discoverable session",
      provider: "claude",
      status: "idle",
      imported: false,
    });
  });

  it("excludes discoverable sessions already imported", () => {
    const result = deriveSidebarAgents({
      serverId: "s1",
      projectKeys: ["/project"],
      agents: new Map(),
      discoverableSessionsByProject: {
        "/project": {
          entries: [
            makeDiscoverable({
              cwd: "/project",
              importedAgentId: "existing-agent-id",
            }),
          ],
          fetched: true,
        },
      },
    });

    expect(result).toEqual({});
  });

  it("merges imported agents and discoverable sessions for same project", () => {
    const agents = new Map([
      [
        "a1",
        makeAgent({
          id: "a1",
          serverId: "s1",
          title: "Imported agent",
          projectPlacement: {
            projectKey: "/project",
            projectName: "project",
            checkout: {
              cwd: "/project",
              isGit: false,
              currentBranch: null,
              remoteUrl: null,
              worktreeRoot: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
            },
          },
        }),
      ],
    ]);

    const result = deriveSidebarAgents({
      serverId: "s1",
      projectKeys: ["/project"],
      agents,
      discoverableSessionsByProject: {
        "/project": {
          entries: [
            makeDiscoverable({
              providerHandleId: "handle-y",
              cwd: "/project",
              title: "Not yet imported",
            }),
          ],
          fetched: true,
        },
      },
    });

    expect(result["/project"]).toHaveLength(2);
    const imported = result["/project"].find((a) => a.imported);
    const discoverable = result["/project"].find((a) => !a.imported);
    expect(imported!.agentId).toBe("a1");
    expect(discoverable!.agentId).toBe("handle-y");
  });
});

export type CloseAgentTabPolicy = { kind: "archive-on-close" } | { kind: "layout-only" };

export function resolveCloseAgentTabPolicy(
  _agent: { parentAgentId: string | null } | null | undefined,
): CloseAgentTabPolicy {
  return { kind: "layout-only" };
}

import type { Agent } from "@/stores/session-store";

export function shouldAutoOpenAgentTab(_agent: Pick<Agent, "parentAgentId">): boolean {
  return false;
}

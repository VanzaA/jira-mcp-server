import type { JiraClient } from "../jira/client.js";
import { UNASSIGNED } from "../jira/format.js";
import { parseAssignee } from "../jira/resolvers.js";
import type { Session } from "../jira/session.js";

export interface ResolvedAssignee {
  /** null = unassigned. */
  username: string | null;
  display: { username: string; name: string } | typeof UNASSIGNED;
}

/** "yo" → current user; "sin asignar" → null; any other value is a username that is checked against Jira. */
export async function resolveAssignee(input: string, jira: JiraClient, session: Session): Promise<ResolvedAssignee> {
  const parsed = parseAssignee(input);
  if (parsed.kind === "nobody") return { username: null, display: UNASSIGNED };
  const user = parsed.kind === "self" ? await session.myself() : await jira.getUser(parsed.username);
  return { username: user.name, display: { username: user.name, name: user.displayName } };
}

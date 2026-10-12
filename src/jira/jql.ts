import { parseAssignee } from "./resolvers.js";

/** Double-quoted JQL literal, escaping "\" and quotes. */
export function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export interface SearchFilters {
  project?: string;
  status?: string;
  issueType?: string;
  assignee?: string;
  text?: string;
  sprint?: string;
  activeSprint?: boolean;
}

export const DEFAULT_ORDER = "ORDER BY updated DESC";

export function filterClauses(filters: SearchFilters): string[] {
  const clauses: string[] = [];
  if (filters.project) clauses.push(`project = ${quote(filters.project)}`);
  if (filters.status) clauses.push(`status = ${quote(filters.status)}`);
  if (filters.issueType) clauses.push(`issuetype = ${quote(filters.issueType)}`);
  if (filters.assignee) {
    const assignee = parseAssignee(filters.assignee);
    if (assignee.kind === "self") clauses.push("assignee = currentUser()");
    else if (assignee.kind === "nobody") clauses.push("assignee is EMPTY");
    else clauses.push(`assignee = ${quote(assignee.username)}`);
  }
  if (filters.text) clauses.push(`text ~ ${quote(filters.text)}`);
  if (filters.activeSprint) clauses.push("sprint in openSprints()");
  if (filters.sprint) clauses.push(`sprint = ${quote(filters.sprint)}`);
  return clauses;
}

function splitOrderBy(jql: string): { where: string; orderBy?: string } {
  const match = /\border\s+by\b/i.exec(jql);
  if (!match) return { where: jql.trim() };
  return { where: jql.slice(0, match.index).trim(), orderBy: jql.slice(match.index).trim() };
}

/**
 * Combines a free-form JQL with the filters (AND). The JQL's own ORDER BY is kept if present; otherwise results
 * are sorted by last update.
 */
export function buildJql(jql: string | undefined, filters: SearchFilters): string {
  const { where, orderBy } = splitOrderBy(jql ?? "");
  const clauses = filterClauses(filters);
  const conditions = where ? [clauses.length > 0 ? `(${where})` : where, ...clauses] : clauses;
  return [conditions.join(" AND "), orderBy ?? DEFAULT_ORDER].filter(Boolean).join(" ");
}

import { parseSprint } from "./fields.js";
import type { Issue, JiraUser, Transition } from "./types.js";

export interface FieldIds {
  storyPoints?: string;
  sprint?: string;
}

export const UNASSIGNED = "sin asignar";

/** Standard fields the summary needs; custom ones (Story Points, Sprint) are added per instance. */
export const SUMMARY_FIELDS = ["summary", "issuetype", "status", "priority", "assignee", "duedate", "updated"];
export const DETAIL_FIELDS = [
  ...SUMMARY_FIELDS,
  "description",
  "reporter",
  "labels",
  "parent",
  "subtasks",
  "created",
  "timetracking",
];

export function withCustomFields(fields: string[], ids: FieldIds): string[] {
  return [...fields, ...[ids.storyPoints, ids.sprint].filter((id): id is string => Boolean(id))];
}

export function issueUrl(baseUrl: string, key: string): string {
  return `${baseUrl}/browse/${key}`;
}

export function userRef(user: JiraUser | null | undefined): { username: string; name: string } | typeof UNASSIGNED {
  return user ? { username: user.name, name: user.displayName } : UNASSIGNED;
}

function storyPoints(issue: Issue, ids: FieldIds): number | null {
  const value = ids.storyPoints ? issue.fields[ids.storyPoints] : undefined;
  return typeof value === "number" ? value : null;
}

export function summarizeIssue(issue: Issue, baseUrl: string, ids: FieldIds) {
  const { fields } = issue;
  const sprint = ids.sprint ? parseSprint(fields[ids.sprint]) : undefined;
  return {
    key: issue.key,
    summary: fields.summary ?? "",
    type: fields.issuetype?.name ?? null,
    status: fields.status?.name ?? null,
    priority: fields.priority?.name ?? null,
    assignee: userRef(fields.assignee),
    story_points: storyPoints(issue, ids),
    due_date: fields.duedate ?? null,
    sprint: sprint?.name ?? null,
    url: issueUrl(baseUrl, issue.key),
  };
}

export function describeTransition(t: Transition) {
  return { name: t.name, to: t.to.name };
}

export function detailIssue(issue: Issue, transitions: Transition[], baseUrl: string, ids: FieldIds) {
  const { fields } = issue;
  return {
    ...summarizeIssue(issue, baseUrl, ids),
    description: fields.description ?? null,
    reporter: fields.reporter ? userRef(fields.reporter) : null,
    labels: fields.labels ?? [],
    parent: fields.parent ? { key: fields.parent.key, summary: fields.parent.fields?.summary ?? null } : null,
    subtasks: (fields.subtasks ?? []).map((s) => ({
      key: s.key,
      summary: s.fields?.summary ?? null,
      status: s.fields?.status?.name ?? null,
    })),
    created: fields.created ?? null,
    updated: fields.updated ?? null,
    time_spent: fields.timetracking?.timeSpent ?? null,
    transitions: transitions.map(describeTransition),
  };
}

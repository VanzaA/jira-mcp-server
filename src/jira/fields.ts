import { ENV_FILE_HINT } from "../config.js";
import { normalize } from "./resolvers.js";
import type { Field } from "./types.js";

export const SPRINT_SCHEMA = "com.pyxis.greenhopper.jira:gh-sprint";
const STORY_POINTS_NAMES = ["story points", "story point estimate"];

export type FieldSource = "override" | "discovered";

export interface ResolvedField {
  id: string;
  name?: string;
  source: FieldSource;
}

export type FieldKind = "storyPoints" | "sprint";

export const FIELD_LABELS: Record<FieldKind, { label: string; env: string }> = {
  storyPoints: { label: "Story Points", env: "JIRA_STORY_POINTS_FIELD" },
  sprint: { label: "Sprint", env: "JIRA_SPRINT_FIELD" },
};

export function missingFieldHint(kind: FieldKind): string {
  const { label, env } = FIELD_LABELS[kind];
  return (
    `No se encontró el campo ${label} en Jira. Definí ${env}=customfield_XXXXX en ${ENV_FILE_HINT} ` +
    "(el id lo ves en Jira → Administración → Custom fields, o en GET /rest/api/2/field) y reiniciá el MCP."
  );
}

export function discoverField(kind: FieldKind, fields: Field[]): ResolvedField | undefined {
  const match =
    kind === "sprint"
      ? fields.find((f) => f.schema?.custom === SPRINT_SCHEMA)
      : fields.find((f) => f.custom && STORY_POINTS_NAMES.includes(normalize(f.name)));
  return match ? { id: match.id, name: match.name, source: "discovered" } : undefined;
}

export interface SprintValue {
  name: string;
  state?: string;
}

// Jira Server returns each sprint as an object ({ id, name, state }) or, depending on version/configuration, as a
// serialized string: "com.atlassian.greenhopper.service.sprint.Sprint@7c8d[id=42,state=ACTIVE,name=Sprint 42,…]".
function parseOne(value: unknown): SprintValue | undefined {
  if (value && typeof value === "object" && "name" in value) {
    const { name, state } = value as { name: unknown; state?: unknown };
    return typeof name === "string" ? { name, state: typeof state === "string" ? state : undefined } : undefined;
  }
  if (typeof value === "string") {
    const name = /[[,]name=(.*?),(?:startDate|endDate|completeDate|activatedDate|sequence|goal)=/.exec(value)?.[1];
    if (!name) return undefined;
    const state = /[[,]state=([A-Z_]+)/.exec(value)?.[1];
    return { name, state };
  }
  return undefined;
}

/** The issue's current sprint: the last one in the list (Jira orders them oldest to newest). */
export function parseSprint(value: unknown): SprintValue | undefined {
  if (!Array.isArray(value)) return parseOne(value);
  const sprints = value.map(parseOne).filter((s): s is SprintValue => s !== undefined);
  return sprints.at(-1);
}

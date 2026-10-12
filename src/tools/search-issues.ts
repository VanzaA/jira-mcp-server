import { z } from "zod";
import type { JiraClient } from "../jira/client.js";
import { ToolInputError } from "../jira/errors.js";
import { SUMMARY_FIELDS, summarizeIssue, withCustomFields } from "../jira/format.js";
import { buildJql } from "../jira/jql.js";
import type { Session } from "../jira/session.js";
import { defineTool, ok } from "./tool.js";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export const limit = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .optional()
  .describe(`Máximo de issues a devolver (por defecto ${DEFAULT_LIMIT}, máximo ${MAX_LIMIT})`);

/** Runs the JQL and builds the compact response, flagging when there are more results than returned. */
export async function runSearch(jira: JiraClient, session: Session, baseUrl: string, jql: string, max = DEFAULT_LIMIT) {
  const ids = await session.optionalFieldIds();
  const result = await jira.search(jql, max, withCustomFields(SUMMARY_FIELDS, ids));
  const issues = result.issues.map((issue) => summarizeIssue(issue, baseUrl, ids));
  return {
    jql,
    total: result.total,
    returned: issues.length,
    issues,
    ...(issues.length === 0
      ? { message: "Ninguna issue coincidió con la búsqueda." }
      : result.total > issues.length
        ? {
            message: `Hay ${result.total} issues; se muestran ${issues.length}. Refiná la búsqueda o subí limit (máximo ${MAX_LIMIT}).`,
          }
        : {}),
  };
}

export const searchIssues = defineTool({
  name: "search_issues",
  title: "Buscar issues",
  description:
    "Busca issues en Jira por JQL libre y/o filtros combinados con AND: proyecto, estado, tipo, asignado " +
    '(username, "yo" o "sin asignar"), texto, sprint activo o sprint por nombre. Ordena por última actualización ' +
    "salvo que la JQL traiga ORDER BY. Para tus issues pendientes usá my_issues.",
  inputSchema: {
    jql: z.string().trim().min(1).optional().describe('JQL libre (ej. labels = backend AND duedate <= endOfWeek())'),
    project: z.string().trim().min(1).optional().describe("Key del proyecto (ej. PROJ)"),
    status: z.string().trim().min(1).optional().describe('Nombre del estado (ej. "In Progress")'),
    issue_type: z.string().trim().min(1).optional().describe("Tipo de issue (ej. Bug, Story)"),
    assignee: z.string().trim().min(1).optional().describe('Username, "yo" (usuario actual) o "sin asignar"'),
    text: z.string().trim().min(1).optional().describe("Texto a buscar en summary, descripción y comentarios"),
    sprint: z.string().trim().min(1).optional().describe('Nombre exacto del sprint (ej. "Sprint 42")'),
    active_sprint: z.boolean().optional().describe("true para limitar a los sprints activos"),
    limit,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(args, { jira, session, baseUrl }) {
    const { jql, limit: max, ...rest } = args;
    const filters = {
      project: rest.project,
      status: rest.status,
      issueType: rest.issue_type,
      assignee: rest.assignee,
      text: rest.text,
      sprint: rest.sprint,
      activeSprint: rest.active_sprint,
    };
    const hasFilter = Object.values(filters).some((value) => value !== undefined && value !== false);
    if (!jql && !hasFilter) {
      throw new ToolInputError(
        "Indicá al menos un criterio de búsqueda: jql, project, status, issue_type, assignee, text, sprint o active_sprint.",
      );
    }
    return ok(await runSearch(jira, session, baseUrl, buildJql(jql, filters), max));
  },
});

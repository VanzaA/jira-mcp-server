import { z } from "zod";
import { ToolInputError } from "../jira/errors.js";
import { issueUrl } from "../jira/format.js";
import { resolveByName } from "../jira/resolvers.js";
import type { CreateMetaField } from "../jira/types.js";
import { resolveAssignee } from "./assignee.js";
import { defineTool, isoDate, issueKey, label, ok, projectKey, storyPoints } from "./tool.js";

function describeAllowed(field: CreateMetaField): string {
  const values = (field.allowedValues ?? []).map((v) => v.name ?? v.value).filter(Boolean);
  return values.length > 0 ? ` (valores posibles: ${values.join(", ")})` : "";
}

export const createIssue = defineTool({
  name: "create_issue",
  title: "Crear issue",
  description:
    "Crea una issue en un proyecto de Jira. Tipos habituales: Task, Bug, Story, Sub-task, Spike (se validan contra " +
    'los del proyecto). Una Sub-task requiere parent. Prioridad por nombre (ej. "High"), asignado por username o "yo". ' +
    "La descripción se guarda exactamente como se envía. Devuelve la key y la URL.",
  inputSchema: {
    project: projectKey,
    issue_type: z.string().trim().min(1).describe("Tipo de issue: Task, Bug, Story, Sub-task, Spike…"),
    summary: z.string().trim().min(1, "El summary es obligatorio").describe("Título de la issue"),
    description: z.string().optional().describe("Descripción; se envía tal cual"),
    priority: z.string().trim().min(1).optional().describe('Prioridad por nombre (ej. "High")'),
    labels: z.array(label).optional().describe("Labels (sin espacios)"),
    due_date: isoDate.optional().describe("Due date YYYY-MM-DD"),
    story_points: storyPoints.optional().describe("Story points"),
    assignee: z.string().trim().min(1).optional().describe('Username de Jira o "yo"'),
    parent: issueKey.optional().describe("Key de la issue padre (obligatorio para Sub-task)"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(args, { jira, session, baseUrl }) {
    const { project } = args;

    const issueTypes = await jira.createMetaIssueTypes(project);
    const type = resolveByName(`tipo de issue en ${project}`, issueTypes, args.issue_type);
    if (type.subtask && !args.parent) {
      throw new ToolInputError(`Una ${type.name} requiere issue padre: indicá parent (ej. ${project}-100).`);
    }

    const fields: Record<string, unknown> = {
      project: { key: project },
      issuetype: { id: type.id },
      summary: args.summary,
    };
    if (args.description !== undefined) fields.description = args.description;
    if (args.labels !== undefined) fields.labels = args.labels;
    if (args.due_date !== undefined) fields.duedate = args.due_date;
    if (args.parent !== undefined) fields.parent = { key: args.parent };
    if (args.priority !== undefined) {
      fields.priority = { id: resolveByName("prioridad", await session.priorities(), args.priority).id };
    }
    const argNames: Record<string, string> = {
      description: "description",
      labels: "labels",
      duedate: "due_date",
      parent: "parent",
      priority: "priority",
      assignee: "assignee",
    };
    if (args.story_points !== undefined) {
      const spField = (await session.requireField("storyPoints")).id;
      fields[spField] = args.story_points;
      argNames[spField] = "story_points";
    }
    if (args.assignee !== undefined) {
      const assignee = await resolveAssignee(args.assignee, jira, session);
      if (assignee.username) fields.assignee = { name: assignee.username };
    }

    const meta = await jira.createMetaFields(project, type.id);
    const onScreen = new Set(meta.map((f) => f.fieldId));
    const notOnScreen = Object.keys(fields).filter((id) => id in argNames && !onScreen.has(id));
    if (notOnScreen.length > 0) {
      const names = notOnScreen.map((id) => argNames[id]);
      throw new ToolInputError(
        `Jira no permite cargar ${names.join(", ")} al crear una ${type.name} en ${project} (no están en la pantalla de creación). ` +
          "Creala sin esos campos y después usá update_issue.",
      );
    }
    const missing = meta.filter((f) => f.required && !f.hasDefaultValue && !(f.fieldId in fields));
    if (missing.length > 0) {
      throw new ToolInputError(
        `Faltan campos obligatorios para crear una ${type.name} en ${project}: ` +
          `${missing.map((f) => `${f.name}${describeAllowed(f)}`).join("; ")}. Este server no los soporta todavía: creala desde Jira.`,
      );
    }

    const created = await jira.createIssue(fields);
    return ok({
      key: created.key,
      url: issueUrl(baseUrl, created.key),
      issue_type: type.name,
      summary: args.summary,
    });
  },
});

import { z } from "zod";
import { ToolInputError } from "../jira/errors.js";
import { issueUrl } from "../jira/format.js";
import { resolveByName } from "../jira/resolvers.js";
import type { IssueUpdatePayload } from "../jira/types.js";
import { defineTool, isoDate, issueKey, label, ok, storyPoints } from "./tool.js";

export const updateIssue = defineTool({
  name: "update_issue",
  title: "Editar issue",
  description:
    "Edita una issue existente por key, en un solo request. Cambia solo los campos indicados: summary, descripción " +
    "(reemplaza la actual, se guarda tal cual), due date y story points (null los limpia), prioridad por nombre y labels " +
    "(labels reemplaza todas; add_labels/remove_labels agregan o quitan). Para asignar usá assign_issue; para cambiar " +
    "de estado, transition_issue.",
  inputSchema: {
    issue_key: issueKey,
    summary: z.string().trim().min(1).optional().describe("Nuevo summary"),
    description: z.string().optional().describe("Nueva descripción (reemplaza la actual)"),
    due_date: isoDate.nullable().optional().describe("Due date YYYY-MM-DD, o null para limpiarlo"),
    story_points: storyPoints.nullable().optional().describe("Story points, o null para limpiarlos"),
    priority: z.string().trim().min(1).optional().describe('Prioridad por nombre (ej. "High")'),
    labels: z.array(label).optional().describe("Reemplaza todas las labels"),
    add_labels: z.array(label).optional().describe("Labels a agregar"),
    remove_labels: z.array(label).optional().describe("Labels a quitar"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async handler(args, { jira, session, baseUrl }) {
    const { issue_key } = args;
    const fields: Record<string, unknown> = {};
    const applied: Record<string, unknown> = {};

    if (args.labels !== undefined && (args.add_labels !== undefined || args.remove_labels !== undefined)) {
      throw new ToolInputError("Usá labels (reemplazar todas) o add_labels/remove_labels, no ambos a la vez.");
    }

    if (args.summary !== undefined) fields.summary = applied.summary = args.summary;
    if (args.description !== undefined) {
      fields.description = args.description;
      applied.description = "actualizada";
    }
    if (args.due_date !== undefined) fields.duedate = applied.due_date = args.due_date;
    if (args.labels !== undefined) fields.labels = applied.labels = args.labels;
    if (args.priority !== undefined) {
      const priority = resolveByName("prioridad", await session.priorities(), args.priority);
      fields.priority = { id: priority.id };
      applied.priority = priority.name;
    }
    if (args.story_points !== undefined) {
      fields[(await session.requireField("storyPoints")).id] = args.story_points;
      applied.story_points = args.story_points;
    }

    const labelOps = [
      ...(args.add_labels ?? []).map((l) => ({ add: l })),
      ...(args.remove_labels ?? []).map((l) => ({ remove: l })),
    ];
    if (args.add_labels) applied.added_labels = args.add_labels;
    if (args.remove_labels) applied.removed_labels = args.remove_labels;

    if (Object.keys(applied).length === 0) {
      throw new ToolInputError(
        "No hay nada para editar: indicá al menos un campo (summary, description, due_date, story_points, priority, labels, add_labels o remove_labels).",
      );
    }

    const payload: IssueUpdatePayload = {};
    if (Object.keys(fields).length > 0) payload.fields = fields;
    if (labelOps.length > 0) payload.update = { labels: labelOps };

    await jira.updateIssue(issue_key, payload);
    return ok({ key: issue_key, applied, url: issueUrl(baseUrl, issue_key) });
  },
});

import { z } from "zod";
import { issueUrl } from "../jira/format.js";
import { resolveAssignee } from "./assignee.js";
import { defineTool, issueKey, ok } from "./tool.js";

export const assignIssue = defineTool({
  name: "assign_issue",
  title: "Asignar issue",
  description:
    'Asigna una issue al usuario actual ("yo"), a otro usuario por su username de Jira, o la deja "sin asignar". ' +
    "El username se verifica antes de asignar.",
  inputSchema: {
    issue_key: issueKey,
    assignee: z.string().trim().min(1).describe('Username de Jira, "yo" o "sin asignar"'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async handler({ issue_key, assignee }, { jira, session, baseUrl }) {
    const resolved = await resolveAssignee(assignee, jira, session);
    await jira.assignIssue(issue_key, resolved.username);
    return ok({ key: issue_key, assignee: resolved.display, url: issueUrl(baseUrl, issue_key) });
  },
});

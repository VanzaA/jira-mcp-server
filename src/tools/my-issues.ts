import { z } from "zod";
import { DEFAULT_ORDER } from "../jira/jql.js";
import { limit, runSearch } from "./search-issues.js";
import { defineTool, ok } from "./tool.js";

export const myIssues = defineTool({
  name: "my_issues",
  title: "Mis issues",
  description:
    "Lista las issues asignadas al usuario actual, por defecto solo las pendientes (categoría de estado distinta de Done), " +
    "ordenadas por última actualización. Pasá include_done para incluir también las terminadas.",
  inputSchema: {
    include_done: z.boolean().optional().describe("true para incluir las issues terminadas"),
    limit,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler({ include_done, limit: max }, { jira, session, baseUrl }) {
    const where = include_done ? "assignee = currentUser()" : "assignee = currentUser() AND statusCategory != Done";
    return ok(await runSearch(jira, session, baseUrl, `${where} ${DEFAULT_ORDER}`, max));
  },
});

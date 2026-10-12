import { DETAIL_FIELDS, detailIssue, withCustomFields } from "../jira/format.js";
import { defineTool, issueKey, ok } from "./tool.js";

export const getIssue = defineTool({
  name: "get_issue",
  title: "Ver issue",
  description:
    "Devuelve el detalle de una issue por key: resumen, descripción tal como está en Jira, reporter, labels, padre, " +
    "subtareas, fechas, tiempo registrado y las transiciones disponibles desde su estado actual.",
  inputSchema: { issue_key: issueKey },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler({ issue_key }, { jira, session, baseUrl }) {
    const ids = await session.optionalFieldIds();
    const [issue, transitions] = await Promise.all([
      jira.getIssue(issue_key, withCustomFields(DETAIL_FIELDS, ids)),
      jira.getTransitions(issue_key),
    ]);
    return ok(detailIssue(issue, transitions, baseUrl, ids));
  },
});

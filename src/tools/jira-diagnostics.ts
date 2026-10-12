import { FIELD_LABELS, missingFieldHint, type FieldKind } from "../jira/fields.js";
import { defineTool, ok } from "./tool.js";

export const jiraDiagnostics = defineTool({
  name: "jira_diagnostics",
  title: "Diagnóstico de Jira",
  description:
    "Verifica la conexión con Jira e informa la versión, el usuario autenticado (username, nombre y zona horaria) " +
    "y los ids de los campos Story Points y Sprint que usa el server. Usala cuando algo falle o para confirmar la configuración.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(_args, { jira, session, baseUrl }) {
    const [info, user] = await Promise.all([jira.serverInfo(), session.myself()]);

    const fields: Record<string, unknown> = {};
    for (const kind of Object.keys(FIELD_LABELS) as FieldKind[]) {
      const field = await session.field(kind);
      fields[kind === "storyPoints" ? "story_points" : "sprint"] = field
        ? { found: true, id: field.id, name: field.name ?? null, source: field.source }
        : { found: false, hint: missingFieldHint(kind) };
    }

    const warnings: string[] = [];
    if (!user.timeZone) {
      warnings.push("Tu usuario de Jira no tiene zona horaria: log_work va a registrar las horas en UTC.");
    }

    return ok({
      jira_url: baseUrl,
      version: info.version,
      deployment_type: info.deploymentType ?? null,
      server_title: info.serverTitle ?? null,
      user: { username: user.name, display_name: user.displayName, time_zone: user.timeZone ?? null },
      fields,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  },
});

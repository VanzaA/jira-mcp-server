import { z } from "zod";
import { ToolInputError } from "../jira/errors.js";
import { issueUrl } from "../jira/format.js";
import { resolveByName, resolveTransition } from "../jira/resolvers.js";
import type { TransitionField, TransitionPayload } from "../jira/types.js";
import { defineTool, issueKey, ok } from "./tool.js";

function allowedNames(field: TransitionField): string[] {
  return (field.allowedValues ?? []).map((v) => v.name ?? v.value ?? v.id);
}

export const transitionIssue = defineTool({
  name: "transition_issue",
  title: "Transicionar issue",
  description:
    'Mueve una issue de estado ejecutando una transición de su workflow. Aceptá el estado destino (ej. "In Progress") ' +
    'o el nombre de la transición (ej. "Start Progress"); se valida contra las transiciones disponibles ahora. Si la ' +
    "transición pide resolución, pasala por nombre en resolution (ej. \"Done\"). Las transiciones posibles se ven con get_issue.",
  inputSchema: {
    issue_key: issueKey,
    transition: z.string().trim().min(1).describe("Estado destino o nombre de la transición"),
    resolution: z.string().trim().min(1).optional().describe('Resolución por nombre (ej. "Done"), si la transición la pide'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler({ issue_key, transition, resolution }, { jira, baseUrl }) {
    const transitions = await jira.getTransitions(issue_key);
    const chosen = resolveTransition(transitions, transition);
    const screen = chosen.fields ?? {};
    const payload: TransitionPayload = { transition: { id: chosen.id } };

    const resolutionField = screen.resolution;
    if (resolution !== undefined) {
      if (!resolutionField) {
        throw new ToolInputError(`La transición "${chosen.name}" no admite resolución: volvé a intentar sin resolution.`);
      }
      const options = (resolutionField.allowedValues ?? []).map((v) => ({ id: v.id, name: v.name ?? v.value ?? v.id }));
      payload.fields = { resolution: { id: resolveByName("resolución", options, resolution).id } };
    }

    const missing = Object.entries(screen).filter(([id, f]) => f.required && !(payload.fields && id in payload.fields));
    if (missing.length > 0) {
      const detail = missing
        .map(([id, f]) => {
          const values = allowedNames(f);
          const hint = id === "resolution" ? " (pasala en resolution)" : " (este server no lo soporta: hacé la transición desde Jira)";
          return `${f.name}${values.length > 0 ? ` — valores posibles: ${values.join(", ")}` : ""}${hint}`;
        })
        .join("; ");
      throw new ToolInputError(`La transición "${chosen.name}" requiere campos obligatorios: ${detail}.`);
    }

    await jira.transitionIssue(issue_key, payload);
    return ok({
      key: issue_key,
      transition: chosen.name,
      status: chosen.to.name,
      ...(payload.fields ? { resolution } : {}),
      url: issueUrl(baseUrl, issue_key),
    });
  },
});

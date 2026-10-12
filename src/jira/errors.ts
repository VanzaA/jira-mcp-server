import { ENV_FILE_HINT } from "../config.js";

export type JiraErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "network"
  | "unexpected";

export class JiraError extends Error {
  override name = "JiraError";
  constructor(
    readonly kind: JiraErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class ToolInputError extends Error {
  override name = "ToolInputError";
}

export interface ErrorContext {
  notFoundMessage?: string;
}

/** Jira returns errors as { errorMessages: string[], errors: { field: message } }. */
export function extractErrors(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const { errorMessages, errors } = body as { errorMessages?: unknown; errors?: unknown };
  const messages = Array.isArray(errorMessages) ? errorMessages.map(String) : [];
  if (errors && typeof errors === "object") {
    for (const [field, message] of Object.entries(errors)) messages.push(`${field}: ${String(message)}`);
  }
  return messages;
}

function withDetail(message: string, body: unknown): string {
  const errors = extractErrors(body);
  return errors.length > 0 ? `${message}: ${errors.join("; ")}` : `${message}.`;
}

export function errorFromResponse(status: number, body: unknown, context: ErrorContext = {}): JiraError {
  switch (status) {
    case 401:
      return new JiraError(
        "unauthorized",
        `Jira rechazó el PAT (401): es inválido o expiró. Revisá JIRA_PAT en ${ENV_FILE_HINT} ` +
          "(se genera desde tu perfil de Jira → Personal Access Tokens).",
        status,
      );
    case 403:
      return new JiraError(
        "forbidden",
        withDetail("Tu usuario no tiene permiso para esta operación o recurso en Jira (403)", body),
        status,
      );
    case 404:
      return new JiraError(
        "not_found",
        context.notFoundMessage ?? withDetail("El recurso no existe o no es visible para tu usuario (404)", body),
        status,
      );
    case 400:
      return new JiraError("validation", withDetail("Jira rechazó la operación (400)", body), status);
    default:
      return new JiraError("unexpected", withDetail(`Jira respondió con un error inesperado (HTTP ${status})`, body), status);
  }
}

export function networkError(baseUrl: string, detail: string): JiraError {
  return new JiraError(
    "network",
    `No se pudo contactar a Jira en ${baseUrl}: ${detail}. Verificá que estés conectado a la VPN y que JIRA_URL sea correcta.`,
  );
}

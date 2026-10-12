export const REQUEST_TIMEOUT_MS = 30_000;
export const ENV_FILE_HINT = "~/.config/jira-mcp/.env";

export interface Config {
  /** Jira base URL without a trailing "/" (may include a context path, e.g. https://host/jira). */
  baseUrl: string;
  pat: string;
  storyPointsField?: string;
  sprintField?: string;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

function required(env: NodeJS.ProcessEnv, name: string, hint: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`Falta ${name}. ${hint} Definila en ${ENV_FILE_HINT} como ${name}=<valor>.`);
  }
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawUrl = required(env, "JIRA_URL", "Es la URL de tu Jira (ej. https://jira.empresa.com).");
  const pat = required(
    env,
    "JIRA_PAT",
    "Es un Personal Access Token: crealo en Jira desde tu perfil → Personal Access Tokens.",
  );

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConfigError(`JIRA_URL inválida ("${rawUrl}"): debe empezar con http:// o https://.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError(`JIRA_URL inválida ("${rawUrl}"): debe empezar con http:// o https://.`);
  }

  return {
    baseUrl: `${url.origin}${url.pathname}`.replace(/\/+$/, ""),
    pat,
    storyPointsField: optional(env, "JIRA_STORY_POINTS_FIELD"),
    sprintField: optional(env, "JIRA_SPRINT_FIELD"),
  };
}

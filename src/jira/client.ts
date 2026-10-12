import { REQUEST_TIMEOUT_MS } from "../config.js";
import { errorFromResponse, networkError, type ErrorContext } from "./errors.js";
import type {
  CreatedIssue,
  CreateMetaField,
  Field,
  Issue,
  IssueType,
  IssueUpdatePayload,
  JiraUser,
  MetaPage,
  NamedValue,
  SearchResult,
  ServerInfo,
  Transition,
  TransitionPayload,
  Worklog,
  WorklogPayload,
} from "./types.js";

type Query = Record<string, string | number | boolean | undefined>;

interface SendOptions extends ErrorContext {
  query?: Query;
  body?: unknown;
}

const API = "/rest/api/2";

function issueNotFound(key: string): string {
  return `La issue ${key} no existe o no es visible para tu usuario (404).`;
}

export class JiraClient {
  constructor(
    readonly baseUrl: string,
    private readonly pat: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async send<T>(method: "GET" | "POST" | "PUT", path: string, options: SendOptions = {}): Promise<T> {
    // Concatenation (not new URL(path, base)) to preserve a context path in JIRA_URL.
    const url = new URL(`${this.baseUrl}${API}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers: { Authorization: `Bearer ${this.pat}`, "Content-Type": "application/json", Accept: "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw networkError(this.baseUrl, `superó el timeout de ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      throw networkError(this.baseUrl, error instanceof Error ? error.message : String(error));
    }

    if (!response.ok) {
      throw errorFromResponse(response.status, await response.json().catch(() => undefined), options);
    }
    // Issue PUT, assignment and transitions respond 204 with no body.
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private issuePath(key: string, suffix = ""): string {
    return `/issue/${encodeURIComponent(key)}${suffix}`;
  }

  serverInfo(): Promise<ServerInfo> {
    return this.send<ServerInfo>("GET", "/serverInfo");
  }

  myself(): Promise<JiraUser> {
    return this.send<JiraUser>("GET", "/myself");
  }

  fields(): Promise<Field[]> {
    return this.send<Field[]>("GET", "/field");
  }

  priorities(): Promise<NamedValue[]> {
    return this.send<NamedValue[]>("GET", "/priority");
  }

  getUser(username: string): Promise<JiraUser> {
    return this.send<JiraUser>("GET", "/user", {
      query: { username },
      notFoundMessage: `El usuario "${username}" no existe en Jira. Usá su username (no el nombre visible).`,
    });
  }

  search(jql: string, maxResults: number, fields: string[]): Promise<SearchResult> {
    return this.send<SearchResult>("POST", "/search", { body: { jql, startAt: 0, maxResults, fields } });
  }

  getIssue(key: string, fields: string[]): Promise<Issue> {
    return this.send<Issue>("GET", this.issuePath(key), {
      query: { fields: fields.join(",") },
      notFoundMessage: issueNotFound(key),
    });
  }

  async getTransitions(key: string): Promise<Transition[]> {
    const body = await this.send<{ transitions: Transition[] }>("GET", this.issuePath(key, "/transitions"), {
      query: { expand: "transitions.fields" },
      notFoundMessage: issueNotFound(key),
    });
    return body.transitions ?? [];
  }

  async createMetaIssueTypes(projectKey: string): Promise<IssueType[]> {
    const page = await this.send<MetaPage<IssueType>>(
      "GET",
      `/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`,
      {
        query: { maxResults: 100 },
        notFoundMessage: `El proyecto "${projectKey}" no existe o no tenés permiso para crear issues en él (404).`,
      },
    );
    return page.values ?? [];
  }

  async createMetaFields(projectKey: string, issueTypeId: string): Promise<CreateMetaField[]> {
    const page = await this.send<MetaPage<CreateMetaField>>(
      "GET",
      `/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(issueTypeId)}`,
      { query: { maxResults: 200 } },
    );
    return page.values ?? [];
  }

  createIssue(fields: Record<string, unknown>): Promise<CreatedIssue> {
    return this.send<CreatedIssue>("POST", "/issue", { body: { fields } });
  }

  async updateIssue(key: string, payload: IssueUpdatePayload): Promise<void> {
    await this.send<unknown>("PUT", this.issuePath(key), { body: payload, notFoundMessage: issueNotFound(key) });
  }

  async assignIssue(key: string, username: string | null): Promise<void> {
    await this.send<unknown>("PUT", this.issuePath(key, "/assignee"), {
      body: { name: username },
      notFoundMessage: issueNotFound(key),
    });
  }

  async transitionIssue(key: string, payload: TransitionPayload): Promise<void> {
    await this.send<unknown>("POST", this.issuePath(key, "/transitions"), {
      body: payload,
      notFoundMessage: issueNotFound(key),
    });
  }

  addWorklog(key: string, payload: WorklogPayload): Promise<Worklog> {
    return this.send<Worklog>("POST", this.issuePath(key, "/worklog"), {
      body: payload,
      notFoundMessage: issueNotFound(key),
    });
  }
}

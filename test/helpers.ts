import { readFileSync } from "node:fs";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { vi } from "vitest";
import { JiraClient } from "../src/jira/client.js";
import { Session, type FieldOverrides } from "../src/jira/session.js";
import { executeTool, type ToolDefinition, type ToolDeps } from "../src/tools/tool.js";

export const BASE_URL = "https://jira.example.com";
export const PAT = "pat-secreto-123";

/** Jira Server REST API v2 response (test/fixtures/<name>.json), parsed fresh on every call. */
export function fixture<T = any>(name: string): NoInfer<T> {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as NoInfer<T>;
}

export interface RecordedRequest {
  method: string;
  /** Path relative to /rest/api/2 (e.g. /issue/PROJ-123). */
  path: string;
  query: URLSearchParams;
  body: any;
  headers: Record<string, string>;
}

/** JSON value (200), undefined (204), a Response, or a function that receives the request and returns any of those. */
export type Reply = ((request: RecordedRequest) => unknown) | Response | object | string | number | boolean | null | undefined;

export function jiraError(status: number, body?: unknown): Response {
  return body === undefined ? new Response(null, { status }) : Response.json(body, { status });
}

/** Read routes that almost every tool uses. */
export function baseRoutes(): Record<string, Reply> {
  return {
    "GET /myself": () => fixture("myself"),
    "GET /field": () => fixture("fields"),
    "GET /priority": () => fixture("priorities"),
  };
}

/**
 * Fake Jira: `routes` maps "METHOD /path" to the response. Uses the real JiraClient and Session with an
 * injected fetch, so tests also cover request building and response parsing.
 */
export function fakeJira(routes: Record<string, Reply>, overrides: FieldOverrides = {}) {
  const calls: RecordedRequest[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    const request: RecordedRequest = {
      method: init?.method ?? "GET",
      path: url.pathname.replace(/^\/rest\/api\/2/, ""),
      query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(request);

    const key = `${request.method} ${request.path}`;
    if (!(key in routes)) return jiraError(500, { errorMessages: [`ruta no mockeada en el test: ${key}`] });
    const route = routes[key];
    const reply = typeof route === "function" ? await route(request) : route;
    if (reply instanceof Response) return reply;
    if (reply === undefined) return new Response(null, { status: 204 });
    return Response.json(reply);
  });

  const jira = new JiraClient(BASE_URL, PAT, fetch);
  const deps: ToolDeps = { jira, session: new Session(jira, overrides), baseUrl: BASE_URL };
  const isWrite = (c: RecordedRequest) => c.method === "PUT" || (c.method === "POST" && c.path !== "/search");

  return {
    calls,
    fetch,
    deps,
    run: (tool: ToolDefinition<any>, args: unknown) => executeTool(tool, deps, args),
    writes: () => calls.filter(isWrite),
    call: (method: string, path: string) => calls.find((c) => c.method === method && c.path === path),
  };
}

export function text(result: CallToolResult): string {
  const first = result.content[0];
  return first && first.type === "text" ? first.text : "";
}

export function data<T = any>(result: CallToolResult): T {
  if (result.isError) throw new Error(`La tool devolvió error: ${text(result)}`);
  return JSON.parse(text(result)) as T;
}

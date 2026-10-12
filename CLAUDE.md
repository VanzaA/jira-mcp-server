# CLAUDE.md

Local MCP server (stdio) for **Jira Server / Data Center** (REST API v2), packaged in Docker and started
by `bin/jira-mcp` from any MCP client (Claude Code, Cursor) on Linux and Windows. User-facing
documentation lives in [README.md](README.md).

## Commands

```bash
npm test            # Vitest, no network
npm run typecheck   # tsc --noEmit (src + test)
npm run build       # dist/
docker build -t jira-mcp:local .
```

Run `npm run typecheck` and `npm test` before considering a change done.

## Architecture

```
src/index.ts          entry point: loadConfig() → JiraClient + Session → createServer() → stdio
src/config.ts         JIRA_URL, JIRA_PAT (+ optional JIRA_STORY_POINTS_FIELD / JIRA_SPRINT_FIELD)
src/server.ts         tool registry and the `instructions` sent to the model
src/tools/tool.ts     defineTool / executeTool / ok / fail + shared zod schemas (issueKey, isoDate, …)
src/tools/*.ts        one file per tool: zod input schema + handler
src/jira/client.ts    HTTP client: Bearer PAT, timeout, error mapping; one method per endpoint
src/jira/errors.ts    JiraError (HTTP/network) and ToolInputError (validation), both shown to the model
src/jira/session.ts   lazy per-process cache: myself, /field, priorities; custom field resolution
src/jira/fields.ts    Story Points / Sprint discovery and Sprint value parsing (object or serialized string)
src/jira/resolvers.ts name → ID resolution, transitions, "yo"/"sin asignar" aliases
src/jira/jql.ts       JQL builder with escaping
src/jira/format.ts    compact issue summary and detail
src/jira/time.ts      duration parsing and worklog `started` in the user's time zone
```

The container lives as long as the client session, so `Session` caches instance data without
invalidation; failed loads are not cached.

## Rules

- **Writes only by issue key** (`PROJ-123`). Fuzzy lookup is the model's job, using the search tools.
- **Never pick among ambiguous candidates.** `resolveByName` / `resolveTransition` throw a
  `ToolInputError` listing the options.
- **Validate before writing.** Everything that can be checked (formats, issue type, required fields,
  transition, user) is rejected before the first write request. Tests assert this with `writes()`.
- **Errors are tool results**, not exceptions: `executeTool` turns `ToolInputError` and `JiraError` into
  `isError: true`. They must be actionable and **never include the PAT**.
- **Language:** user-facing strings (tool titles/descriptions, results, errors, launcher messages) are in
  Spanish; code, comments and documentation are in English.
- **stdout belongs to the MCP protocol.** Log to stderr only (also in `bin/jira-mcp`).
- Descriptions are sent to Jira as-is (no Markdown → wiki markup conversion).
- Jira Server identifies users by `name` (username), not `accountId`. Do not add Cloud-only APIs.

## Adding a tool

1. Create `src/tools/<name>.ts` with `defineTool({ name, title, description, inputSchema, annotations, handler })`.
   Reuse the schemas from `tool.ts`; set `readOnlyHint` for reads.
2. If it needs a new endpoint, add a method to `JiraClient` (with `notFoundMessage` when it targets an
   issue) and the response type to `src/jira/types.ts`.
3. Register it in the `tools` array in `src/server.ts` and update the count in `test/server.test.ts`.
4. Add `test/tools/<name>.test.ts`.
5. Document it in the README tool table.

## Tests

- No network: `fakeJira(routes)` in `test/helpers.ts` injects a `fetch` into the **real** `JiraClient` and
  routes `"METHOD /path"` (relative to `/rest/api/2`) to a reply. That covers request building and response
  parsing too.
- Replies come from `test/fixtures/*.json`, modeled on Jira Server REST API v2 responses. Prefer
  extending a fixture over inventing a response shape inline.
- `baseRoutes()` provides `/myself`, `/field` and `/priority`.
- Assert both the outgoing request (`call(method, path).body`) and that validation failures make no
  write (`writes()` empty) or no request at all (`calls` empty).
- `log_work` tests freeze `Date` with fake timers; time zone math is covered in `test/jira/time.test.ts`.

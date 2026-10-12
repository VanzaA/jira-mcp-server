# jira-mcp-server

Local [MCP](https://modelcontextprotocol.io) server to operate **Jira Server / Data Center** in natural
language from any MCP client (Claude Code, Cursor): search issues (by filters, JQL or sprint), view details,
create issues, edit due date and story points, assign, transition and log work.

```
"what issues do I have pending?"
"assign PROJ-123 to me and give it 3 story points with a due date this Friday"
"move PROJ-123 to In Progress"
"log 2h 30m on PROJ-123: PR review"
"what's unassigned in PROJ's active sprint?"
"create a bug in PROJ: login fails with a timeout"
```

Prompts work in any language the model understands.

It runs on your machine inside a Docker container and speaks MCP over stdio. Your client starts it when it
needs it and stops it when it closes. Works on Linux and Windows.

## Requirements

- Docker
- An MCP client with stdio support: Claude Code or Cursor
- Jira **Server or Data Center 8.14+** (Personal Access Tokens were introduced in that version). Tested
  against 11.3.12. **Jira Cloud is not supported.**
- Network access to Jira from Docker (if Jira is behind a VPN, connect first)
- **On Windows:** [Git for Windows](https://git-scm.com/download/win), which includes Git Bash. The
  launcher is a bash script and on Windows it runs through Git Bash.

## Installation

Steps 1 and 2 are done once, no matter how many clients you use. On Windows, run the commands from
**Git Bash**.

### 1. Store the URL and your Personal Access Token

Create the token in Jira from your avatar → **Profile → Personal Access Tokens → Create token**. Store it
outside the repo together with your Jira URL:

```bash
mkdir -p ~/.config/jira-mcp
printf 'JIRA_URL=https://jira.your-company.com\nJIRA_PAT=<your-token>\n' > ~/.config/jira-mcp/.env
chmod 600 ~/.config/jira-mcp/.env
```

| OS | File location |
|---|---|
| Linux | `~/.config/jira-mcp/.env` |
| Windows | `%USERPROFILE%\.config\jira-mcp\.env` (e.g. `C:\Users\<user>\.config\jira-mcp\.env`) |

| Variable | Required | Purpose |
|---|---|---|
| `JIRA_URL` | yes | Jira base URL, with or without a trailing `/`. May include a context path (`https://host/jira`). |
| `JIRA_PAT` | yes | Personal Access Token, sent as `Authorization: Bearer`. |
| `JIRA_STORY_POINTS_FIELD` | no | Story Points field id (e.g. `customfield_10106`) if the server can't discover it. |
| `JIRA_SPRINT_FIELD` | no | Sprint field id if the server can't discover it. |

This is the **only configuration** and every client shares it: the launcher reads the file, not the
client. If you edit it with Notepad, save it as UTF-8 **without BOM**.

### 2. Clone and build the image

```bash
git clone <repo-url> ~/jira-mcp-server
cd ~/jira-mcp-server
docker build -t jira-mcp:local .
```

On Windows, clone the repo on Windows (e.g. `C:\Users\<user>\jira-mcp-server`), not inside WSL.

Building is optional: `bin/jira-mcp` builds the image if it doesn't exist. Building it by hand the first
time keeps the first start from exceeding your client's MCP timeout while the image builds.

### 3. Register it in your client

Every client runs the same launcher. The only thing that changes between operating systems is how it is
invoked:

| OS | Command | Arguments |
|---|---|---|
| Linux | `/home/<user>/jira-mcp-server/bin/jira-mcp` | none |
| Windows | `C:/Program Files/Git/bin/bash.exe` | `C:/Users/<user>/jira-mcp-server/bin/jira-mcp` |

On Windows the `bash.exe` path must be absolute: the Git installer doesn't add it to the PATH. If you
installed Git elsewhere, adjust the path.

#### Claude Code

At user scope (available in all your repos). Linux:

```bash
claude mcp add -s user jira -- ~/jira-mcp-server/bin/jira-mcp
```

Windows:

```bash
claude mcp add -s user jira -- "C:/Program Files/Git/bin/bash.exe" C:/Users/<user>/jira-mcp-server/bin/jira-mcp
```

Check with `claude mcp get jira`, or with `/mcp` inside a session. If the first start exceeds the timeout,
raise it with the `MCP_TIMEOUT` environment variable (e.g. `MCP_TIMEOUT=120000 claude`).

#### Cursor

Add the server to `~/.cursor/mcp.json` (on Windows, `%USERPROFILE%\.cursor\mcp.json`).

Windows:

```json
{
  "mcpServers": {
    "jira": {
      "command": "C:/Program Files/Git/bin/bash.exe",
      "args": ["C:/Users/<user>/jira-mcp-server/bin/jira-mcp"]
    }
  }
}
```

Linux:

```json
{
  "mcpServers": {
    "jira": { "command": "/home/<user>/jira-mcp-server/bin/jira-mcp", "args": [] }
  }
}
```

No `env` is needed: the launcher reads the configuration from the file in step 1. Check under
**Settings → MCP**: `jira` must show as active, with its 9 tools.

### 4. Verify

Ask your assistant: **"run the Jira diagnostics"**. It should show the Jira version, your user and the
Story Points and Sprint fields it found. For a full validation, follow
[docs/smoke-test.md](docs/smoke-test.md).

## Tools

| Tool | What it does | Example prompt |
|---|---|---|
| `jira_diagnostics` | Jira version, authenticated user, time zone and the discovered Story Points/Sprint fields | "run the Jira diagnostics" |
| `my_issues` | Issues assigned to you; pending by default, optionally including done ones | "what do I have pending?" |
| `search_issues` | Search by JQL and/or filters: project, status, type, assignee, text, active sprint, sprint by name | "unassigned bugs in PROJ's active sprint", "issues in Sprint 42" |
| `get_issue` | Issue details and the available transitions | "show me PROJ-123" |
| `create_issue` | Creates a Task, Bug, Story, Sub-task, Spike (or any other type in the project) | "create a story in PROJ: date filter, 5 SP, assigned to me" |
| `update_issue` | Edits summary, description, due date, story points, priority and labels | "set the due date to Friday and 3 SP on PROJ-123" |
| `assign_issue` | Assigns to you, to another user (by username) or unassigns | "assign PROJ-123 to me", "assign it to jdoe" |
| `transition_issue` | Changes status by status or transition name, with a resolution when needed | "move PROJ-123 to In Review", "close it as Done" |
| `log_work` | Logs work with a duration (`2h 30m` or `1.5`), date and comment | "log 4h yesterday on PROJ-123: PR review" |

Priorities, issue types, transitions and resolutions are given **by name**. The server maps them to IDs
and, if a name doesn't exist or is ambiguous, returns the valid options so the assistant can ask you.

Tools that write take the issue **by key** (`PROJ-123`). For something like "the date filter ticket", the
assistant searches for it first and, if there are several candidates, asks you which one.

The server's messages to the model (tool descriptions, results and errors) are in Spanish.

## Limitations

- Jira Server / Data Center only (REST API v2). Jira Cloud is not supported.
- Descriptions are sent **as-is**: Jira Server uses wiki markup (`h2.`, `*bold*`, `# list`), not Markdown.
- Users are identified by Jira **username**, not display name.
- Searches return up to 100 results per query (50 by default); the result reports the total.
- Sprints: active or by name. It doesn't list sprints or boards, nor move issues between sprints.
- It doesn't query logged work, nor manage comments, links, attachments or sprints.
- Non-standard required fields on creation or on a transition (other than the resolution) are not
  supported: the server tells you which ones they are and you have to do it from Jira.
- Catalogs (user, fields, priorities) are cached while your client keeps the server alive. Restart the
  server from the client to refresh them.
- **The image doesn't update itself.** After a `git pull`, rebuild it: `docker build -t jira-mcp:local .`

## Troubleshooting

| Symptom | What to do |
|---|---|
| `jira-mcp: Docker no está corriendo` | Start Docker and restart the server from your client (`/mcp` in Claude Code, Settings → MCP in Cursor). |
| `jira-mcp: Docker no está instalado o no está en el PATH` | Install Docker, or check that `docker` works from a new terminal. |
| `jira-mcp: no existe …/.env` | Follow step 1. |
| "No se pudo contactar a Jira … VPN" | Connect to the VPN. Try `docker run --rm curlimages/curl -s -o /dev/null -w '%{http_code}' https://<your-jira>/rest/api/2/serverInfo`: if it isn't 200/401, Docker can't reach Jira. |
| "Jira rechazó el PAT (401)" | The token is invalid or expired: create a new one and update `JIRA_PAT`. |
| "No se encontró el campo Story Points" | Find the field id (`customfield_…`) and set `JIRA_STORY_POINTS_FIELD` in the `.env`. |
| `$'\r': command not found` (Windows) | The script got Windows line endings. From Git Bash, in the repo: `git rm --cached -r bin && git reset --hard`, or clone again. |
| The server doesn't connect on Windows | Check that the `bash.exe` path exists and that the script path uses `/`. |
| The first start times out | Build the image by hand (step 2) and restart the server. |

## Development

Requires Node ≥ 22.12.

```bash
npm install
npm test            # Vitest, no network: fake fetch + API v2 fixtures in test/fixtures/
npm run typecheck
npm run build       # compiles to dist/
JIRA_URL=https://jira.your-company.com JIRA_PAT=<token> npm start   # stdio server without Docker
```

See [CLAUDE.md](CLAUDE.md) for the architecture and how to add a tool.

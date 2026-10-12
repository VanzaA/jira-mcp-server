# Smoke test — Windows + VPN

Checklist to validate the server against the real Jira. Run it on the machine with access to Jira
(Windows + VPN), **once with Claude Code and once with Cursor**. Use a project and a test issue you can
modify safely: the tools write to production.

Before starting, pick and write down:

| Item | Value |
|---|---|
| Test project (`<PROJ>`) | |
| Existing test issue (`<KEY>`) | |
| A teammate's username (`<USER>`) | |
| Name of an existing sprint (`<SPRINT>`) | |

If something fails, copy the full error message and the output of `jira_diagnostics` (it doesn't
contain the token).

## 0. Setup

- [ ] Connected to the VPN.
- [ ] From Git Bash, Docker reaches Jira (should print `200`):
      ```bash
      source ~/.config/jira-mcp/.env
      docker run --rm curlimages/curl -s -o /dev/null -w '%{http_code}\n' \
        -H "Authorization: Bearer $JIRA_PAT" "$JIRA_URL/rest/api/2/myself"
      ```
- [ ] `git pull` and `docker build -t jira-mcp:local .` in the repo.
- [ ] The server is registered in the client (README, step 3) and shows as active with **9 tools**.

## 1. Diagnostics

| # | Prompt | Expected result | OK |
|---|---|---|---|
| 1.1 | "run the Jira diagnostics" | Version `11.3.12`, your username, time zone, and Story Points + Sprint with `found: true` | [ ] |

If Story Points or Sprint show `found: false`, set the override in `~/.config/jira-mcp/.env`, restart the
server and repeat 1.1.

## 2. Search (read-only)

| # | Prompt | Expected result | OK |
|---|---|---|---|
| 2.1 | "what issues do I have pending?" | Your unfinished issues, with status, SP, due date and sprint | [ ] |
| 2.2 | "search issues in `<PROJ>` with status In Progress" | Issues in that project and status | [ ] |
| 2.3 | "what's in `<PROJ>`'s active sprint?" | Issues in the active sprint; the sprint column shows its name | [ ] |
| 2.4 | "issues in sprint `<SPRINT>`" | Issues in that sprint | [ ] |
| 2.5 | "unassigned bugs in `<PROJ>`" | Only Bugs with an empty assignee | [ ] |
| 2.6 | "search with JQL: project = `<PROJ>` AND updated >= -7d" | Issues updated in the last week | [ ] |
| 2.7 | "show me `<KEY>`" | Details with description, subtasks and available transitions (name → target status) | [ ] |

## 3. Editing

| # | Prompt | Expected result | OK |
|---|---|---|---|
| 3.1 | "assign `<KEY>` to me" | In Jira, `<KEY>` is assigned to you | [ ] |
| 3.2 | "assign it to `<USER>`" (on `<KEY>`) | Assigned to `<USER>` | [ ] |
| 3.3 | "assign it to `<USER>`zz" | Error: the user doesn't exist; the assignee doesn't change | [ ] |
| 3.4 | "unassign `<KEY>`" then "assign it to me again" | Unassigned, then assigned to you | [ ] |
| 3.5 | "set the due date to Friday and 3 story points on `<KEY>`" | In Jira: next Friday's due date and 3 SP | [ ] |
| 3.6 | "remove the due date from `<KEY>`" | Empty due date | [ ] |
| 3.7 | "add the label smoke-test to `<KEY>`" then "remove the label smoke-test" | The label appears and disappears; other labels stay | [ ] |
| 3.8 | "change `<KEY>`'s priority to High" | Priority High | [ ] |

## 4. Transitions

| # | Prompt | Expected result | OK |
|---|---|---|---|
| 4.1 | "which statuses can I move `<KEY>` to?" | List of available transitions | [ ] |
| 4.2 | "move `<KEY>` to <an available status>" | In Jira, the status changed | [ ] |
| 4.3 | "move `<KEY>` to <a status NOT available from the current one>" | Error listing the available transitions; the status doesn't change | [ ] |
| 4.4 | (if a transition requires a resolution) "close `<KEY>`" without giving the resolution | Error asking for the resolution with its possible values | [ ] |
| 4.5 | "close it with resolution Done" then move it back to the previous status | Closed with resolution Done | [ ] |

## 5. Logging work

| # | Prompt | Expected result | OK |
|---|---|---|---|
| 5.1 | "log 30m on `<KEY>`" | 30m worklog at the current time (your time zone, not UTC) | [ ] |
| 5.2 | "log 1.5 hours yesterday on `<KEY>`: smoke test" | 1h 30m worklog, yesterday at 09:00, with the comment | [ ] |
| 5.3 | "log two hours on `<KEY>`" (spelled out) | The assistant converts it to `2h`; if it passes the literal text, an error with valid formats | [ ] |

Delete the test worklogs from Jira when done.

## 6. Creation

| # | Prompt | Expected result | OK |
|---|---|---|---|
| 6.1 | "create a task in `<PROJ>`: MCP smoke test" | Returns key and URL; the issue exists | [ ] |
| 6.2 | "create a story in `<PROJ>`: smoke story, 2 SP, due Friday, assigned to me, with description: `h2. Context` + a list" | Story with SP, due date, assignee and the exact description | [ ] |
| 6.3 | "create a sub-task of `<the task from 6.1>`: smoke subtask" | Sub-task under that issue | [ ] |
| 6.4 | "create a sub-task in `<PROJ>`: no parent" (no parent given) | The assistant asks for the parent issue or the tool returns the error, without creating anything | [ ] |
| 6.5 | "create a spike in `<PROJ>`: investigate X" | Spike created (or an error with the available types if the project has no Spike) | [ ] |
| 6.6 | "create a bug in `<PROJ>`: smoke bug" | Bug created, or an error naming the missing required fields | [ ] |

Delete or close the test issues when done.

## 7. Errors

| # | Test | Expected result | OK |
|---|---|---|---|
| 7.1 | Disconnect the VPN and ask for "my issues" | Error: couldn't reach Jira, check the VPN | [ ] |
| 7.2 | Set an invalid `JIRA_PAT`, restart the server and ask for "my issues" | 401 error mentioning `JIRA_PAT`, without showing the token | [ ] |

Restore the correct PAT after 7.2.

## Capturing real responses (optional, improves the tests)

The tests use fixtures in `test/fixtures/` built from the API documentation. To replace them with real
responses from your Jira (without the token, which only goes in the header):

```bash
source ~/.config/jira-mcp/.env
get() { docker run --rm curlimages/curl -s -H "Authorization: Bearer $JIRA_PAT" "$JIRA_URL/rest/api/2/$1"; }
get field > field.json
get "issue/<KEY>?fields=summary,issuetype,status,priority,assignee,duedate,updated,customfield_XXXXX" > issue.json
get "issue/<KEY>/transitions?expand=transitions.fields" > transitions.json
get "issue/createmeta/<PROJ>/issuetypes" > createmeta-issuetypes.json
```

Check them for sensitive data before sharing. The most useful one is the Sprint field format in
`issue.json` (object or serialized string).

import { describe, expect, it } from "vitest";
import { getIssue } from "../../src/tools/get-issue.js";
import { baseRoutes, BASE_URL, data, fakeJira, fixture, jiraError, text } from "../helpers.js";

function setup() {
  return fakeJira({
    ...baseRoutes(),
    "GET /issue/PROJ-123": () => fixture("issue"),
    "GET /issue/PROJ-123/transitions": () => fixture("transitions"),
    "GET /issue/PROJ-999": () => jiraError(404, { errorMessages: ["Issue Does Not Exist"], errors: {} }),
    "GET /issue/PROJ-999/transitions": () => jiraError(404),
  });
}

describe("get_issue", () => {
  it("detalle con descripción tal cual y transiciones disponibles", async () => {
    const jira = setup();

    const issue = data(await jira.run(getIssue, { issue_key: "proj-123" }));

    expect(jira.call("GET", "/issue/PROJ-123")!.query.get("fields")).toContain("customfield_10106");
    expect(issue).toMatchObject({
      key: "PROJ-123",
      status: "To Do",
      story_points: 5,
      sprint: "Sprint 42",
      description: "h2. Context\nUsers need to filter reports by date.\n\n* From / to\n* Presets",
      reporter: { username: "jperez", name: "Juan Perez" },
      labels: ["backend", "reports"],
      parent: null,
      subtasks: [{ key: "PROJ-124", summary: "Tests", status: "To Do" }],
      time_spent: "3h",
      url: `${BASE_URL}/browse/PROJ-123`,
    });
    expect(issue.transitions).toEqual([
      { name: "Start Progress", to: "In Progress" },
      { name: "Send to Review", to: "In Review" },
      { name: "Close Issue", to: "Closed" },
    ]);
  });

  it("issue inexistente → error con la key", async () => {
    const jira = setup();
    expect(text(await jira.run(getIssue, { issue_key: "PROJ-999" }))).toContain("La issue PROJ-999 no existe o no es visible");
  });

  it("key con formato inválido → error sin request", async () => {
    const jira = setup();

    const result = await jira.run(getIssue, { issue_key: "proyecto 123" });
    expect(text(result)).toMatch(/issue_key: Key de issue inválida: usá el formato PROJ-123/);
    expect(jira.calls).toHaveLength(0);
  });
});

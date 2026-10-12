import { describe, expect, it } from "vitest";
import { assignIssue } from "../../src/tools/assign-issue.js";
import { baseRoutes, BASE_URL, data, fakeJira, fixture, jiraError, text } from "../helpers.js";

function setup() {
  return fakeJira({
    ...baseRoutes(),
    "GET /user": ({ query }) =>
      query.get("username") === "jperez" ? fixture("user-jperez") : jiraError(404, { errorMessages: ["User does not exist"] }),
    "PUT /issue/PROJ-123/assignee": undefined,
  });
}

describe("assign_issue", () => {
  it("asignarme", async () => {
    const jira = setup();

    const result = data(await jira.run(assignIssue, { issue_key: "PROJ-123", assignee: "yo" }));
    expect(jira.call("PUT", "/issue/PROJ-123/assignee")!.body).toEqual({ name: "avanzato" });
    expect(result).toEqual({
      key: "PROJ-123",
      assignee: { username: "avanzato", name: "Agustin Vanzato" },
      url: `${BASE_URL}/browse/PROJ-123`,
    });
  });

  it("asignar a otro, verificando que existe", async () => {
    const jira = setup();

    const result = data(await jira.run(assignIssue, { issue_key: "PROJ-123", assignee: "jperez" }));
    expect(jira.call("PUT", "/issue/PROJ-123/assignee")!.body).toEqual({ name: "jperez" });
    expect(result.assignee).toEqual({ username: "jperez", name: "Juan Perez" });
  });

  it("usuario inexistente → error sin cambiar el asignado", async () => {
    const jira = setup();

    const result = await jira.run(assignIssue, { issue_key: "PROJ-123", assignee: "jperezz" });
    expect(text(result)).toMatch(/El usuario "jperezz" no existe en Jira/);
    expect(jira.writes()).toHaveLength(0);
  });

  it("desasignar", async () => {
    const jira = setup();

    const result = data(await jira.run(assignIssue, { issue_key: "PROJ-123", assignee: "sin asignar" }));
    expect(jira.call("PUT", "/issue/PROJ-123/assignee")!.body).toEqual({ name: null });
    expect(result.assignee).toBe("sin asignar");
  });
});

import { describe, expect, it } from "vitest";
import { searchIssues } from "../../src/tools/search-issues.js";
import { baseRoutes, BASE_URL, data, fakeJira, fixture, jiraError, text, type Reply } from "../helpers.js";

function setup(search: Reply = () => fixture("search")) {
  return fakeJira({ ...baseRoutes(), "POST /search": search });
}

describe("search_issues", () => {
  it("filtros combinados: arma la JQL y devuelve el resumen compacto", async () => {
    const jira = setup();

    const result = data(await jira.run(searchIssues, { project: "PROJ", status: "In Progress", assignee: "jperez" }));

    const body = jira.call("POST", "/search")!.body;
    expect(body.jql).toBe('project = "PROJ" AND status = "In Progress" AND assignee = "jperez" ORDER BY updated DESC');
    expect(body.maxResults).toBe(50);
    expect(body.fields).toEqual(expect.arrayContaining(["summary", "status", "customfield_10106", "customfield_10104"]));
    expect(result.total).toBe(2);
    expect(result.issues[0]).toEqual({
      key: "PROJ-123",
      summary: "Add date filter to reports",
      type: "Story",
      status: "In Progress",
      priority: "Medium",
      assignee: { username: "avanzato", name: "Agustin Vanzato" },
      story_points: 3,
      due_date: "2026-10-16",
      sprint: "Sprint 42",
      url: `${BASE_URL}/browse/PROJ-123`,
    });
  });

  it("issue sin asignar y sin story points", async () => {
    const jira = setup();

    const [, unassigned] = data(await jira.run(searchIssues, { project: "PROJ" })).issues;
    expect(unassigned).toMatchObject({
      key: "PROJ-130",
      assignee: "sin asignar",
      story_points: null,
      sprint: null,
      url: `${BASE_URL}/browse/PROJ-130`,
    });
  });

  it("sprint activo", async () => {
    const jira = setup();
    await jira.run(searchIssues, { project: "PROJ", active_sprint: true });
    expect(jira.call("POST", "/search")!.body.jql).toBe('project = "PROJ" AND sprint in openSprints() ORDER BY updated DESC');
  });

  it("sprint por nombre", async () => {
    const jira = setup();
    await jira.run(searchIssues, { sprint: "Sprint 42" });
    expect(jira.call("POST", "/search")!.body.jql).toBe('sprint = "Sprint 42" ORDER BY updated DESC');
  });

  it("JQL libre", async () => {
    const jira = setup();
    await jira.run(searchIssues, { jql: "labels = backend AND duedate <= endOfWeek()" });
    expect(jira.call("POST", "/search")!.body.jql).toBe("labels = backend AND duedate <= endOfWeek() ORDER BY updated DESC");
  });

  it("texto con comillas: se escapa", async () => {
    const jira = setup();
    await jira.run(searchIssues, { text: 'error "timeout" en login' });
    expect(jira.call("POST", "/search")!.body.jql).toBe('text ~ "error \\"timeout\\" en login" ORDER BY updated DESC');
  });

  it("más resultados que el límite → informa el total", async () => {
    const jira = setup(() => ({ ...fixture("search"), total: 230 }));

    const result = data(await jira.run(searchIssues, { project: "PROJ", limit: 2 }));
    expect(jira.call("POST", "/search")!.body.maxResults).toBe(2);
    expect(result).toMatchObject({ total: 230, returned: 2, message: expect.stringContaining("Hay 230 issues; se muestran 2") });
  });

  it("límite fuera de rango → error sin request", async () => {
    const jira = setup();
    expect((await jira.run(searchIssues, { project: "PROJ", limit: 500 })).isError).toBe(true);
    expect(jira.calls).toHaveLength(0);
  });

  it("sin criterios → error sin request", async () => {
    const jira = setup();

    const result = await jira.run(searchIssues, { active_sprint: false });
    expect(text(result)).toMatch(/Indicá al menos un criterio de búsqueda/);
    expect(jira.calls).toHaveLength(0);
  });

  it("sin resultados → lista vacía con aviso", async () => {
    const jira = setup(() => ({ startAt: 0, maxResults: 50, total: 0, issues: [] }));

    expect(data(await jira.run(searchIssues, { text: "xyz123" }))).toMatchObject({
      total: 0,
      issues: [],
      message: "Ninguna issue coincidió con la búsqueda.",
    });
  });

  it("JQL inválida → el error de Jira llega al modelo", async () => {
    const jira = setup(() => jiraError(400, { errorMessages: ["Error in the JQL Query: Expecting operator"], errors: {} }));

    const result = await jira.run(searchIssues, { jql: "project PROJ" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Error in the JQL Query: Expecting operator");
  });

  it("sin campo de Story Points en la instancia: la búsqueda funciona igual", async () => {
    const jira = fakeJira({
      ...baseRoutes(),
      "GET /field": () => fixture<any[]>("fields").filter((f) => f.name !== "Story Points"),
      "POST /search": () => fixture("search"),
    });

    const result = data(await jira.run(searchIssues, { project: "PROJ" }));
    expect(result.issues[0].story_points).toBeNull();
    expect(jira.call("POST", "/search")!.body.fields).not.toContain("customfield_10106");
  });
});

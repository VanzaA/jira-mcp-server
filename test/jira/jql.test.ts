import { describe, expect, it } from "vitest";
import { buildJql, quote } from "../../src/jira/jql.js";

describe("quote", () => {
  it("escapa comillas y barras invertidas", () => {
    expect(quote('error "timeout" en login')).toBe('"error \\"timeout\\" en login"');
    expect(quote("C:\\temp")).toBe('"C:\\\\temp"');
  });
});

describe("buildJql", () => {
  it("combina filtros con AND y ordena por actualización", () => {
    expect(buildJql(undefined, { project: "PROJ", status: "En progreso", assignee: "jperez" })).toBe(
      'project = "PROJ" AND status = "En progreso" AND assignee = "jperez" ORDER BY updated DESC',
    );
  });

  it("sprint activo y sprint por nombre", () => {
    expect(buildJql(undefined, { project: "PROJ", activeSprint: true })).toBe(
      'project = "PROJ" AND sprint in openSprints() ORDER BY updated DESC',
    );
    expect(buildJql(undefined, { sprint: "Sprint 42" })).toBe('sprint = "Sprint 42" ORDER BY updated DESC');
  });

  it("asignado: yo y sin asignar", () => {
    expect(buildJql(undefined, { assignee: "yo" })).toBe("assignee = currentUser() ORDER BY updated DESC");
    expect(buildJql(undefined, { assignee: "sin asignar" })).toBe("assignee is EMPTY ORDER BY updated DESC");
  });

  it("tipo y texto", () => {
    expect(buildJql(undefined, { issueType: "Bug", text: 'error "timeout"' })).toBe(
      'issuetype = "Bug" AND text ~ "error \\"timeout\\"" ORDER BY updated DESC',
    );
  });

  it("JQL libre sola: se agrega el orden por defecto", () => {
    expect(buildJql("labels = backend AND duedate <= endOfWeek()", {})).toBe(
      "labels = backend AND duedate <= endOfWeek() ORDER BY updated DESC",
    );
  });

  it("JQL libre con ORDER BY propio + filtros: se envuelve y se respeta el orden", () => {
    expect(buildJql("labels = a OR labels = b order by priority DESC", { project: "PROJ" })).toBe(
      '(labels = a OR labels = b) AND project = "PROJ" order by priority DESC',
    );
  });
});

import { describe, expect, it } from "vitest";
import type { Field } from "../../src/jira/types.js";
import { updateIssue } from "../../src/tools/update-issue.js";
import { baseRoutes, BASE_URL, data, fakeJira, fixture, jiraError, text, type Reply } from "../helpers.js";

function setup(extra: Record<string, Reply> = {}) {
  return fakeJira({ ...baseRoutes(), "PUT /issue/PROJ-123": undefined, ...extra });
}

describe("update_issue", () => {
  it("due date y story points en un solo request, confirmando los valores", async () => {
    const jira = setup();

    const result = data(await jira.run(updateIssue, { issue_key: "PROJ-123", due_date: "2026-10-16", story_points: 3 }));

    expect(jira.writes()).toHaveLength(1);
    expect(jira.call("PUT", "/issue/PROJ-123")!.body).toEqual({ fields: { duedate: "2026-10-16", customfield_10106: 3 } });
    expect(result).toEqual({
      key: "PROJ-123",
      applied: { due_date: "2026-10-16", story_points: 3 },
      url: `${BASE_URL}/browse/PROJ-123`,
    });
  });

  it("null limpia due date y story points", async () => {
    const jira = setup();

    await jira.run(updateIssue, { issue_key: "PROJ-123", due_date: null, story_points: null });
    expect(jira.call("PUT", "/issue/PROJ-123")!.body).toEqual({ fields: { duedate: null, customfield_10106: null } });
  });

  it("summary, descripción tal cual, prioridad por nombre y labels reemplazadas", async () => {
    const jira = setup();
    const description = "Texto *wiki* con\nsaltos y {code}x{code}";

    await jira.run(updateIssue, {
      issue_key: "PROJ-123",
      summary: "Nuevo",
      description,
      priority: "highest",
      labels: ["a", "b"],
    });

    expect(jira.call("PUT", "/issue/PROJ-123")!.body).toEqual({
      fields: { summary: "Nuevo", description, priority: { id: "1" }, labels: ["a", "b"] },
    });
  });

  it("agregar y quitar labels usa update con add/remove", async () => {
    const jira = setup();

    const result = data(await jira.run(updateIssue, { issue_key: "PROJ-123", add_labels: ["urgente"], remove_labels: ["viejo"] }));
    expect(jira.call("PUT", "/issue/PROJ-123")!.body).toEqual({ update: { labels: [{ add: "urgente" }, { remove: "viejo" }] } });
    expect(result.applied).toEqual({ added_labels: ["urgente"], removed_labels: ["viejo"] });
  });

  it("labels y add_labels a la vez → error sin request", async () => {
    const jira = setup();
    expect(text(await jira.run(updateIssue, { issue_key: "PROJ-123", labels: ["a"], add_labels: ["b"] }))).toMatch(/no ambos/);
    expect(jira.writes()).toHaveLength(0);
  });

  it("label con espacios → error sin request", async () => {
    const jira = setup();
    expect(text(await jira.run(updateIssue, { issue_key: "PROJ-123", add_labels: ["muy urgente"] }))).toMatch(/no pueden tener espacios/);
    expect(jira.calls).toHaveLength(0);
  });

  it("fecha inválida → pide YYYY-MM-DD sin request", async () => {
    const jira = setup();
    expect(text(await jira.run(updateIssue, { issue_key: "PROJ-123", due_date: "16/10/2026" }))).toMatch(/YYYY-MM-DD/);
    expect(text(await jira.run(updateIssue, { issue_key: "PROJ-123", due_date: "2026-02-30" }))).toMatch(/Fecha inválida/);
    expect(jira.calls).toHaveLength(0);
  });

  it("story points negativos → error sin request", async () => {
    const jira = setup();
    expect(text(await jira.run(updateIssue, { issue_key: "PROJ-123", story_points: -2 }))).toMatch(
      /story points deben ser un número no negativo/,
    );
    expect(jira.calls).toHaveLength(0);
  });

  it("sin cambios → error sin request", async () => {
    const jira = setup();
    expect(text(await jira.run(updateIssue, { issue_key: "PROJ-123" }))).toMatch(/No hay nada para editar/);
    expect(jira.calls).toHaveLength(0);
  });

  it("campo de Story Points no encontrado → error con cómo configurarlo, sin escribir", async () => {
    const jira = setup({ "GET /field": () => fixture<Field[]>("fields").filter((f) => f.name !== "Story Points") });

    const result = await jira.run(updateIssue, { issue_key: "PROJ-123", story_points: 3 });
    expect(text(result)).toMatch(/No se encontró el campo Story Points.*JIRA_STORY_POINTS_FIELD/);
    expect(jira.writes()).toHaveLength(0);
  });

  it("campo fuera de la pantalla de edición → el error de Jira llega al modelo", async () => {
    const jira = setup({
      "PUT /issue/PROJ-123": () =>
        jiraError(400, {
          errorMessages: [],
          errors: { customfield_10106: "Field 'customfield_10106' cannot be set. It is not on the appropriate screen, or unknown." },
        }),
    });

    expect(text(await jira.run(updateIssue, { issue_key: "PROJ-123", story_points: 3 }))).toContain("cannot be set");
  });
});

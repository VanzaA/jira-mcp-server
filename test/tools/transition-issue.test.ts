import { describe, expect, it } from "vitest";
import { transitionIssue } from "../../src/tools/transition-issue.js";
import { baseRoutes, BASE_URL, data, fakeJira, fixture, text, type Reply } from "../helpers.js";

function setup(transitions: Reply = () => fixture("transitions")) {
  return fakeJira({
    ...baseRoutes(),
    "GET /issue/PROJ-123/transitions": transitions,
    "POST /issue/PROJ-123/transitions": undefined,
  });
}

describe("transition_issue", () => {
  it("por estado destino", async () => {
    const jira = setup();

    const result = data(await jira.run(transitionIssue, { issue_key: "PROJ-123", transition: "in progress" }));
    expect(jira.call("POST", "/issue/PROJ-123/transitions")!.body).toEqual({ transition: { id: "11" } });
    expect(result).toEqual({
      key: "PROJ-123",
      transition: "Start Progress",
      status: "In Progress",
      url: `${BASE_URL}/browse/PROJ-123`,
    });
  });

  it("por nombre de transición", async () => {
    const jira = setup();
    await jira.run(transitionIssue, { issue_key: "PROJ-123", transition: "Send to Review" });
    expect(jira.call("POST", "/issue/PROJ-123/transitions")!.body).toEqual({ transition: { id: "21" } });
  });

  it("transición no disponible → lista las disponibles, sin transicionar", async () => {
    const jira = setup();

    const result = await jira.run(transitionIssue, { issue_key: "PROJ-123", transition: "Done" });
    expect(text(result)).toMatch(/No hay una transición "Done".*"Start Progress" \(→ In Progress\)/);
    expect(jira.writes()).toHaveLength(0);
  });

  it("requiere resolución y no se indicó → la pide con sus valores", async () => {
    const jira = setup();

    const result = await jira.run(transitionIssue, { issue_key: "PROJ-123", transition: "Closed" });
    expect(text(result)).toMatch(/requiere campos obligatorios: Resolution — valores posibles: Done, Won't Do, Duplicate \(pasala en resolution\)/);
    expect(jira.writes()).toHaveLength(0);
  });

  it("con resolución por nombre", async () => {
    const jira = setup();

    const result = data(await jira.run(transitionIssue, { issue_key: "PROJ-123", transition: "Close Issue", resolution: "won't do" }));
    expect(jira.call("POST", "/issue/PROJ-123/transitions")!.body).toEqual({
      transition: { id: "31" },
      fields: { resolution: { id: "10001" } },
    });
    expect(result).toMatchObject({ status: "Closed", resolution: "won't do" });
  });

  it("resolución inexistente → opciones válidas, sin transicionar", async () => {
    const jira = setup();

    expect(text(await jira.run(transitionIssue, { issue_key: "PROJ-123", transition: "Closed", resolution: "Fixed" }))).toMatch(
      /No existe resolución "Fixed". Opciones válidas: "Done", "Won't Do", "Duplicate"/,
    );
    expect(jira.writes()).toHaveLength(0);
  });

  it("resolución en una transición que no la admite → error", async () => {
    const jira = setup();
    expect(text(await jira.run(transitionIssue, { issue_key: "PROJ-123", transition: "In Progress", resolution: "Done" }))).toMatch(
      /no admite resolución/,
    );
    expect(jira.writes()).toHaveLength(0);
  });

  it("otro campo obligatorio en la pantalla → lo nombra, sin transicionar", async () => {
    const jira = setup(() => {
      const body = fixture("transitions");
      body.transitions[1].fields = { customfield_10300: { required: true, name: "Reviewer", allowedValues: [] } };
      return body;
    });

    const result = await jira.run(transitionIssue, { issue_key: "PROJ-123", transition: "Send to Review" });
    expect(text(result)).toMatch(/requiere campos obligatorios: Reviewer \(este server no lo soporta/);
    expect(jira.writes()).toHaveLength(0);
  });
});

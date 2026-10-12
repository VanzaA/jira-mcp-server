import { describe, expect, it } from "vitest";
import { discoverField, parseSprint } from "../../src/jira/fields.js";
import type { Field } from "../../src/jira/types.js";
import { fakeJira, fixture, jiraError } from "../helpers.js";

describe("discoverField", () => {
  const fields = fixture<Field[]>("fields");

  it("Story Points por nombre", () => {
    expect(discoverField("storyPoints", fields)).toEqual({ id: "customfield_10106", name: "Story Points", source: "discovered" });
  });

  it('acepta "Story Point Estimate"', () => {
    const other: Field[] = [{ id: "customfield_10016", name: "Story point estimate", custom: true }];
    expect(discoverField("storyPoints", other)?.id).toBe("customfield_10016");
  });

  it("Sprint por el tipo de Jira Software, no por el nombre", () => {
    const renamed = fields.map((f) => (f.id === "customfield_10104" ? { ...f, name: "Iteración" } : f));
    expect(discoverField("sprint", renamed)?.id).toBe("customfield_10104");
  });

  it("campo inexistente → undefined", () => {
    expect(discoverField("storyPoints", fields.filter((f) => f.name !== "Story Points"))).toBeUndefined();
  });
});

describe("parseSprint", () => {
  it("formato string serializado: devuelve el último sprint (el vigente)", () => {
    const issue = fixture("search").issues[0];
    expect(parseSprint(issue.fields.customfield_10104)).toEqual({ name: "Sprint 42", state: "ACTIVE" });
  });

  it("formato objeto", () => {
    expect(parseSprint(fixture("issue").fields.customfield_10104)).toEqual({ name: "Sprint 42", state: "ACTIVE" });
  });

  it("nombre con comas en el formato string", () => {
    const raw = "com.atlassian.greenhopper.service.sprint.Sprint@1[id=1,rapidViewId=2,state=FUTURE,name=Q4, semana 2,startDate=<null>,endDate=<null>]";
    expect(parseSprint([raw])).toEqual({ name: "Q4, semana 2", state: "FUTURE" });
  });

  it("sin sprint o formato desconocido → undefined", () => {
    expect(parseSprint(null)).toBeUndefined();
    expect(parseSprint([])).toBeUndefined();
    expect(parseSprint(["algo raro"])).toBeUndefined();
  });
});

describe("Session — campos", () => {
  it("el override por env gana y no consulta /field", async () => {
    const jira = fakeJira({}, { storyPointsField: "customfield_12345" });

    expect(await jira.deps.session.requireField("storyPoints")).toEqual({ id: "customfield_12345", source: "override" });
    expect(jira.calls).toHaveLength(0);
  });

  it("descubre una sola vez por sesión", async () => {
    const jira = fakeJira({ "GET /field": () => fixture("fields") });

    await jira.deps.session.field("storyPoints");
    await jira.deps.session.field("sprint");
    expect(jira.calls.filter((c) => c.path === "/field")).toHaveLength(1);
  });

  it("un fallo de red no queda cacheado", async () => {
    let first = true;
    const jira = fakeJira({
      "GET /field": () => {
        if (first) {
          first = false;
          return jiraError(503);
        }
        return fixture("fields");
      },
    });

    await expect(jira.deps.session.fields()).rejects.toThrow();
    expect(await jira.deps.session.field("storyPoints")).toMatchObject({ id: "customfield_10106" });
  });

  it("campo no encontrado → error con cómo configurarlo", async () => {
    const jira = fakeJira({ "GET /field": () => fixture<Field[]>("fields").filter((f) => f.name !== "Story Points") });

    await expect(jira.deps.session.requireField("storyPoints")).rejects.toThrow(
      /No se encontró el campo Story Points.*JIRA_STORY_POINTS_FIELD.*~\/\.config\/jira-mcp\/\.env/,
    );
  });
});

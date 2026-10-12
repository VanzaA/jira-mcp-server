import { describe, expect, it } from "vitest";
import type { Field } from "../../src/jira/types.js";
import { jiraDiagnostics } from "../../src/tools/jira-diagnostics.js";
import { baseRoutes, BASE_URL, data, fakeJira, fixture, PAT, text } from "../helpers.js";

const routes = () => ({ ...baseRoutes(), "GET /serverInfo": () => fixture("server-info") });

describe("jira_diagnostics", () => {
  it("instancia sana: versión, usuario y campos descubiertos", async () => {
    const jira = fakeJira(routes());

    const result = await jira.run(jiraDiagnostics, {});

    expect(data(result)).toEqual({
      jira_url: BASE_URL,
      version: "11.3.12",
      deployment_type: "Server",
      server_title: "Jira",
      user: { username: "avanzato", display_name: "Agustin Vanzato", time_zone: "America/Argentina/Buenos_Aires" },
      fields: {
        story_points: { found: true, id: "customfield_10106", name: "Story Points", source: "discovered" },
        sprint: { found: true, id: "customfield_10104", name: "Sprint", source: "discovered" },
      },
    });
    expect(text(result)).not.toContain(PAT);
  });

  it("override por env se reporta como tal", async () => {
    const jira = fakeJira(routes(), { storyPointsField: "customfield_12345" });

    const { fields } = data(await jira.run(jiraDiagnostics, {}));
    expect(fields.story_points).toEqual({ found: true, id: "customfield_12345", name: null, source: "override" });
  });

  it("campo faltante: lo indica con cómo configurarlo y devuelve el resto", async () => {
    const jira = fakeJira({
      ...routes(),
      "GET /field": () => fixture<Field[]>("fields").filter((f) => f.name !== "Sprint"),
    });

    const result = data(await jira.run(jiraDiagnostics, {}));
    expect(result.fields.sprint).toEqual({ found: false, hint: expect.stringContaining("JIRA_SPRINT_FIELD") });
    expect(result.version).toBe("11.3.12");
  });

  it("usuario sin zona horaria → aviso", async () => {
    const jira = fakeJira({ ...routes(), "GET /myself": () => ({ ...fixture("myself"), timeZone: undefined }) });

    expect(data(await jira.run(jiraDiagnostics, {})).warnings).toEqual([expect.stringContaining("UTC")]);
  });
});

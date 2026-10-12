import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("lee URL y PAT, y saca la / final de la URL", () => {
    expect(loadConfig({ JIRA_URL: "https://jira.ejemplo.com/", JIRA_PAT: " tok " })).toEqual({
      baseUrl: "https://jira.ejemplo.com",
      pat: "tok",
      storyPointsField: undefined,
      sprintField: undefined,
    });
  });

  it("respeta un context path en la URL", () => {
    expect(loadConfig({ JIRA_URL: "https://host.com/jira//", JIRA_PAT: "t" }).baseUrl).toBe("https://host.com/jira");
  });

  it("lee los overrides de custom fields", () => {
    const config = loadConfig({
      JIRA_URL: "https://jira.ejemplo.com",
      JIRA_PAT: "t",
      JIRA_STORY_POINTS_FIELD: "customfield_12345",
      JIRA_SPRINT_FIELD: " customfield_10104 ",
    });
    expect(config.storyPointsField).toBe("customfield_12345");
    expect(config.sprintField).toBe("customfield_10104");
  });

  it("falta JIRA_PAT → error que dice dónde definirla", () => {
    expect(() => loadConfig({ JIRA_URL: "https://jira.ejemplo.com", JIRA_PAT: "  " })).toThrow(
      /Falta JIRA_PAT.*~\/\.config\/jira-mcp\/\.env/,
    );
  });

  it("falta JIRA_URL → error", () => {
    expect(() => loadConfig({ JIRA_PAT: "t" })).toThrow(/Falta JIRA_URL/);
  });

  it.each(["jira.ejemplo.com", "jira.ejemplo.com:8080", "ftp://jira.ejemplo.com"])("URL sin http(s) (%s) → error", (url) => {
    expect(() => loadConfig({ JIRA_URL: url, JIRA_PAT: "t" })).toThrow(/debe empezar con http:\/\/ o https:\/\//);
  });
});

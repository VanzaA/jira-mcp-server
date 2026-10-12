import { describe, expect, it, vi } from "vitest";
import { JiraClient } from "../../src/jira/client.js";
import { fixture, jiraError, PAT } from "../helpers.js";

function setup(baseUrl = "https://jira.example.com") {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const client = new JiraClient(baseUrl, PAT, fetch);
  const request = (n = 0) => {
    const [url, init] = fetch.mock.calls[n]!;
    return { url: new URL(String(url)), init: init! };
  };
  return { fetch, client, request };
}

describe("JiraClient — request", () => {
  it("manda el PAT como Bearer y arma la URL de la API v2", async () => {
    const { fetch, client, request } = setup();
    fetch.mockResolvedValueOnce(Response.json(fixture("myself")));

    const user = await client.myself();

    expect(user.name).toBe("avanzato");
    expect(request().url.href).toBe("https://jira.example.com/rest/api/2/myself");
    expect(request().init.headers).toMatchObject({ Authorization: `Bearer ${PAT}` });
  });

  it("respeta el context path de JIRA_URL", async () => {
    const { fetch, client, request } = setup("https://host.com/jira");
    fetch.mockResolvedValueOnce(Response.json(fixture("server-info")));

    await client.serverInfo();
    expect(request().url.href).toBe("https://host.com/jira/rest/api/2/serverInfo");
  });

  it("search usa POST con la JQL y los campos en el body", async () => {
    const { fetch, client, request } = setup();
    fetch.mockResolvedValueOnce(Response.json(fixture("search")));

    const result = await client.search("project = PROJ", 50, ["summary"]);

    expect(result.total).toBe(2);
    expect(request().init.method).toBe("POST");
    expect(JSON.parse(String(request().init.body))).toEqual({ jql: "project = PROJ", startAt: 0, maxResults: 50, fields: ["summary"] });
  });

  it("acepta 204 sin body en PUT y POST de transición", async () => {
    const { fetch, client, request } = setup();
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(client.assignIssue("PROJ-1", null)).resolves.toBeUndefined();
    await expect(client.transitionIssue("PROJ-1", { transition: { id: "11" } })).resolves.toBeUndefined();
    expect(JSON.parse(String(request(0).init.body))).toEqual({ name: null });
    expect(request(1).url.pathname).toBe("/rest/api/2/issue/PROJ-1/transitions");
  });

  it("getTransitions expande los campos de la pantalla de transición", async () => {
    const { fetch, client, request } = setup();
    fetch.mockResolvedValueOnce(Response.json(fixture("transitions")));

    const transitions = await client.getTransitions("PROJ-123");
    expect(transitions.map((t) => t.name)).toEqual(["Start Progress", "Send to Review", "Close Issue"]);
    expect(request().url.searchParams.get("expand")).toBe("transitions.fields");
  });
});

describe("JiraClient — errores", () => {
  it("401 → PAT inválido, sin incluir el PAT", async () => {
    const { fetch, client } = setup();
    fetch.mockResolvedValueOnce(jiraError(401));

    const error: Error = await client.myself().catch((e) => e);
    expect(error).toMatchObject({ name: "JiraError", kind: "unauthorized" });
    expect(error.message).toMatch(/PAT.*inválido o expiró.*JIRA_PAT/);
    expect(error.message).not.toContain(PAT);
  });

  it("403 → sin permiso", async () => {
    const { fetch, client } = setup();
    fetch.mockResolvedValueOnce(jiraError(403));
    await expect(client.priorities()).rejects.toMatchObject({ kind: "forbidden", message: expect.stringContaining("no tiene permiso") });
  });

  it("404 en una issue → mensaje con la key", async () => {
    const { fetch, client } = setup();
    fetch.mockResolvedValueOnce(jiraError(404, { errorMessages: ["Issue Does Not Exist"], errors: {} }));
    await expect(client.getIssue("PROJ-999", ["summary"])).rejects.toThrow("La issue PROJ-999 no existe o no es visible");
  });

  it("400 → junta errorMessages y errors por campo", async () => {
    const { fetch, client } = setup();
    fetch.mockResolvedValueOnce(jiraError(400, fixture("error-400")));
    await expect(client.search("x", 1, [])).rejects.toThrow(
      "Jira rechazó la operación (400): The JQL query is invalid; duedate: Invalid date format",
    );
  });

  it("falla de red → error de tipo network que sugiere revisar la VPN", async () => {
    const { fetch, client } = setup();
    fetch.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(client.myself()).rejects.toMatchObject({
      kind: "network",
      message: expect.stringMatching(/No se pudo contactar a Jira en https:\/\/jira\.example\.com.*VPN/),
    });
  });

  it("timeout → mensaje de timeout sin el PAT", async () => {
    const { fetch, client } = setup();
    fetch.mockRejectedValueOnce(new DOMException("aborted", "TimeoutError"));
    const error: Error = await client.myself().catch((e) => e);
    expect(error.message).toContain("timeout de 30s");
    expect(error.message).not.toContain(PAT);
  });
});

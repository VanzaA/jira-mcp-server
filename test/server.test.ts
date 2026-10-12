import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { baseRoutes, fakeJira, fixture } from "./helpers.js";

async function connect() {
  const jira = fakeJira({ ...baseRoutes(), "POST /search": () => fixture("search") });
  const server = createServer(jira.deps);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { jira, client };
}

describe("createServer", () => {
  it("expone las 9 tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "assign_issue",
        "create_issue",
        "get_issue",
        "jira_diagnostics",
        "log_work",
        "my_issues",
        "search_issues",
        "transition_issue",
        "update_issue",
      ].sort(),
    );
  });

  it("las tools de lectura se marcan como read-only", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name).sort();
    expect(readOnly).toEqual(["get_issue", "jira_diagnostics", "my_issues", "search_issues"]);
  });

  it("publica instrucciones para el modelo", async () => {
    const { client } = await connect();
    expect(client.getInstructions()).toMatch(/key de la issue/);
  });

  it("ejecuta una tool de punta a punta por el protocolo", async () => {
    const { jira, client } = await connect();
    const result = await client.callTool({ name: "my_issues", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(jira.call("POST", "/search")).toBeDefined();
  });
});

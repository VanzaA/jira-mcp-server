import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.js";
import { JiraClient } from "./jira/client.js";
import { Session } from "./jira/session.js";
import { createServer } from "./server.js";

// stdout belongs to the MCP protocol: all logging goes to stderr.
async function main(): Promise<void> {
  const config = loadConfig();
  const jira = new JiraClient(config.baseUrl, config.pat);
  const server = createServer({
    jira,
    session: new Session(jira, config),
    baseUrl: config.baseUrl,
  });
  await server.connect(new StdioServerTransport());
  console.error(`jira-mcp: conectado por stdio (${config.baseUrl})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? `jira-mcp: ${error.message}` : `jira-mcp: ${String(error)}`);
  process.exit(1);
});

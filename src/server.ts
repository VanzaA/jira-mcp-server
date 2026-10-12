import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assignIssue } from "./tools/assign-issue.js";
import { createIssue } from "./tools/create-issue.js";
import { getIssue } from "./tools/get-issue.js";
import { jiraDiagnostics } from "./tools/jira-diagnostics.js";
import { logWork } from "./tools/log-work.js";
import { myIssues } from "./tools/my-issues.js";
import { searchIssues } from "./tools/search-issues.js";
import { executeTool, type ToolDefinition, type ToolDeps } from "./tools/tool.js";
import { transitionIssue } from "./tools/transition-issue.js";
import { updateIssue } from "./tools/update-issue.js";

export const tools: ToolDefinition<any>[] = [
  jiraDiagnostics,
  myIssues,
  searchIssues,
  getIssue,
  createIssue,
  updateIssue,
  assignIssue,
  transitionIssue,
  logWork,
];

export const INSTRUCTIONS = [
  "Server para operar una instancia de Jira Server en lenguaje natural.",
  "Las tools que escriben (create_issue, update_issue, assign_issue, transition_issue, log_work) reciben la key de la issue (ej. PROJ-123): si el usuario describe la issue sin key, buscala antes con my_issues o search_issues y, si hay más de un candidato, preguntale cuál es.",
  'Convertí fechas relativas ("el viernes", "ayer") a YYYY-MM-DD usando la fecha actual antes de llamar a una tool.',
  'Para referirte al usuario actual usá "yo" (ej. assign_issue con assignee "yo"); para otros usuarios, su username de Jira.',
  "Si una tool devuelve candidatos ambiguos o una lista de opciones válidas, mostrásela al usuario y no elijas por tu cuenta.",
  "Si algo falla por configuración (PAT, campos de Story Points o Sprint, conexión), corré jira_diagnostics.",
].join("\n");

export function createServer(deps: ToolDeps, version = "0.1.0"): McpServer {
  const server = new McpServer({ name: "jira", version }, { instructions: INSTRUCTIONS });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      (args: unknown) => executeTool(tool, deps, args),
    );
  }
  return server;
}

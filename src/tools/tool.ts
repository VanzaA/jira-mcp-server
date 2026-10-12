import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { JiraClient } from "../jira/client.js";
import { JiraError, ToolInputError } from "../jira/errors.js";
import type { Session } from "../jira/session.js";

export interface ToolDeps {
  jira: JiraClient;
  session: Session;
  baseUrl: string;
}

export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  annotations?: ToolAnnotations;
  handler(args: z.infer<z.ZodObject<Shape>>, deps: ToolDeps): Promise<CallToolResult>;
}

export function defineTool<Shape extends z.ZodRawShape>(def: ToolDefinition<Shape>): ToolDefinition<Shape> {
  return def;
}

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

export const issueKey = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "Key de issue inválida: usá el formato PROJ-123")
  .describe("Key de la issue (ej. PROJ-123)");

export const projectKey = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]+$/, "Key de proyecto inválida: usá la key, ej. PROJ")
  .describe("Key del proyecto (ej. PROJ)");

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, "Fecha inválida");

export const storyPoints = z.number().min(0, "Los story points deben ser un número no negativo");

export const label = z.string().trim().regex(/^\S+$/, "Las labels de Jira no pueden tener espacios");

export async function executeTool<Shape extends z.ZodRawShape>(
  tool: ToolDefinition<Shape>,
  deps: ToolDeps,
  rawArgs: unknown,
): Promise<CallToolResult> {
  const parsed = z.object(tool.inputSchema).safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; ");
    return fail(`Parámetros inválidos para ${tool.name}: ${detail}`);
  }
  try {
    return await tool.handler(parsed.data, deps);
  } catch (error) {
    if (error instanceof ToolInputError || error instanceof JiraError) return fail(error.message);
    const detail = error instanceof Error ? error.message : String(error);
    return fail(`Error inesperado en ${tool.name}: ${detail}`);
  }
}

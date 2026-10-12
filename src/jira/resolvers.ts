import { ToolInputError } from "./errors.js";
import type { Transition } from "./types.js";

export interface CatalogEntry {
  id: string;
  name: string;
}

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function describe(entries: CatalogEntry[]): string {
  return entries.map((e) => `"${e.name}"`).join(", ");
}

/** Like normalize, but also ignores spaces, hyphens and underscores: "subtask" ≈ "Sub-task". */
function compact(text: string): string {
  return normalize(text).replace(/[\s\-_]+/g, "");
}

/**
 * Exact match (case- and accent-insensitive) → exact ignoring separators → partial → single result, or an
 * error listing the options/candidates.
 */
export function resolveByName<T extends CatalogEntry>(kind: string, entries: T[], input: string): T {
  const raw = input.trim();
  const byId = entries.find((e) => e.id === raw);
  if (byId) return byId;

  const needle = normalize(raw);
  let matches = entries.filter((e) => normalize(e.name) === needle);
  if (matches.length === 0) matches = entries.filter((e) => compact(e.name) === compact(raw));
  if (matches.length === 0) matches = entries.filter((e) => normalize(e.name).includes(needle));

  const [only] = matches;
  if (matches.length === 1 && only) return only;
  if (matches.length === 0) {
    throw new ToolInputError(`No existe ${kind} "${raw}". Opciones válidas: ${describe(entries)}.`);
  }
  throw new ToolInputError(
    `"${raw}" coincide con varios valores de ${kind}: ${describe(matches)}. Preguntale al usuario cuál es.`,
  );
}

export function describeTransitions(transitions: Transition[]): string {
  if (transitions.length === 0) return "ninguna (el workflow no permite moverla desde el estado actual)";
  return transitions.map((t) => `"${t.name}" (→ ${t.to.name})`).join(", ");
}

/**
 * Resolves against the transitions currently available for the issue: first by transition name, then by
 * target status name, and only then by partial match on either.
 */
export function resolveTransition(transitions: Transition[], input: string): Transition {
  const raw = input.trim();
  const needle = normalize(raw);
  const steps: Array<(t: Transition) => boolean> = [
    (t) => t.id === raw,
    (t) => normalize(t.name) === needle,
    (t) => normalize(t.to.name) === needle,
    (t) => normalize(t.name).includes(needle) || normalize(t.to.name).includes(needle),
  ];

  for (const matchesStep of steps) {
    const matches = transitions.filter(matchesStep);
    const [only] = matches;
    if (matches.length === 1 && only) return only;
    if (matches.length > 1) {
      throw new ToolInputError(
        `"${raw}" coincide con varias transiciones: ${describeTransitions(matches)}. Preguntale al usuario cuál es.`,
      );
    }
  }
  throw new ToolInputError(
    `No hay una transición "${raw}" disponible desde el estado actual. Transiciones disponibles: ${describeTransitions(transitions)}.`,
  );
}

const SELF_ALIASES = ["yo", "me", "mi", "mí", "myself", "currentuser"];
const NOBODY_ALIASES = ["sin asignar", "nadie", "ninguno", "unassigned", "none", "nobody"];

export type AssigneeInput = { kind: "self" } | { kind: "nobody" } | { kind: "user"; username: string };

export function parseAssignee(input: string): AssigneeInput {
  const value = normalize(input);
  if (SELF_ALIASES.map(normalize).includes(value)) return { kind: "self" };
  if (NOBODY_ALIASES.includes(value)) return { kind: "nobody" };
  return { kind: "user", username: input.trim() };
}

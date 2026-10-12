import { describe, expect, it } from "vitest";
import { parseAssignee, resolveByName, resolveTransition } from "../../src/jira/resolvers.js";
import type { Transition } from "../../src/jira/types.js";
import { fixture } from "../helpers.js";

describe("resolveByName", () => {
  const priorities = [
    { id: "1", name: "Crítica" },
    { id: "2", name: "High" },
    { id: "3", name: "Highest" },
  ];

  it("coincidencia exacta sin distinguir mayúsculas ni acentos", () => {
    expect(resolveByName("prioridad", priorities, "critica").id).toBe("1");
    expect(resolveByName("prioridad", priorities, "HIGH").id).toBe("2");
  });

  it("acepta el id tal cual", () => {
    expect(resolveByName("prioridad", priorities, "3").name).toBe("Highest");
  });

  it("ignora espacios, guiones y guiones bajos: subtask ≈ Sub-task", () => {
    const types = [
      { id: "10002", name: "Task" },
      { id: "10003", name: "Sub-task" },
    ];
    expect(resolveByName("tipo", types, "subtask").id).toBe("10003");
    expect(resolveByName("tipo", types, "sub task").id).toBe("10003");
  });

  it("coincidencia parcial única", () => {
    expect(resolveByName("prioridad", priorities, "crit").id).toBe("1");
  });

  it("sin coincidencia → opciones válidas", () => {
    expect(() => resolveByName("prioridad", priorities, "Urgentísima")).toThrow(
      'No existe prioridad "Urgentísima". Opciones válidas: "Crítica", "High", "Highest".',
    );
  });

  it("varias coincidencias parciales → candidatos", () => {
    const types = [
      { id: "1", name: "Bug interno" },
      { id: "2", name: "Bug cliente" },
    ];
    expect(() => resolveByName("tipo", types, "bug")).toThrow(/coincide con varios valores de tipo: "Bug interno", "Bug cliente"/);
  });
});

describe("resolveTransition", () => {
  const transitions = fixture<{ transitions: Transition[] }>("transitions").transitions;

  it("por estado destino", () => {
    expect(resolveTransition(transitions, "in progress").id).toBe("11");
  });

  it("por nombre de transición", () => {
    expect(resolveTransition(transitions, "Send to Review").id).toBe("21");
  });

  it("el nombre de transición gana sobre el estado destino", () => {
    const tricky: Transition[] = [
      { id: "1", name: "Done", to: { id: "9", name: "Closed" } },
      { id: "2", name: "Finish", to: { id: "10", name: "Done" } },
    ];
    expect(resolveTransition(tricky, "done").id).toBe("1");
  });

  it("no disponible → lista las transiciones con su destino", () => {
    expect(() => resolveTransition(transitions, "Done")).toThrow(
      'No hay una transición "Done" disponible desde el estado actual. Transiciones disponibles: "Start Progress" (→ In Progress), "Send to Review" (→ In Review), "Close Issue" (→ Closed).',
    );
  });

  it("varias coincidencias parciales → candidatas, sin elegir", () => {
    const two: Transition[] = [
      { id: "1", name: "Enviar a revisión", to: { id: "1", name: "En revisión" } },
      { id: "2", name: "Revisión aprobada", to: { id: "2", name: "Aprobada" } },
    ];
    expect(() => resolveTransition(two, "revisión")).toThrow(/coincide con varias transiciones: "Enviar a revisión".*"Revisión aprobada"/);
  });

  it("dos transiciones al mismo estado → ambigüedad", () => {
    const two: Transition[] = [
      { id: "1", name: "Resolve", to: { id: "5", name: "Resolved" } },
      { id: "2", name: "Quick resolve", to: { id: "5", name: "Resolved" } },
    ];
    expect(() => resolveTransition(two, "resolved")).toThrow(/varias transiciones/);
  });
});

describe("parseAssignee", () => {
  it.each(["yo", "Yo", "me", "mí", "myself"])("%s → usuario actual", (input) => {
    expect(parseAssignee(input)).toEqual({ kind: "self" });
  });

  it.each(["sin asignar", "Unassigned", "nadie"])("%s → sin asignar", (input) => {
    expect(parseAssignee(input)).toEqual({ kind: "nobody" });
  });

  it("cualquier otro valor es un username", () => {
    expect(parseAssignee(" jperez ")).toEqual({ kind: "user", username: "jperez" });
  });
});

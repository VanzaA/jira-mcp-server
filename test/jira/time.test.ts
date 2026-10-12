import { describe, expect, it } from "vitest";
import { parseDuration, worklogStarted } from "../../src/jira/time.js";

describe("parseDuration", () => {
  it.each([
    ["2h 30m", "2h 30m"],
    ["2h30m", "2h 30m"],
    ["45m", "45m"],
    ["1d", "1d"],
    ["1w 2d", "1w 2d"],
    ["1.5", "1h 30m"],
    ["1,5", "1h 30m"],
    ["0.25", "15m"],
    ["8", "8h"],
    ["1.5h", "1h 30m"],
    [" 3H ", "3h"],
  ])("%s → %s", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(["dos horas", "2 horas", "2hx", "", "h"])("inválida: %s", (input) => {
    expect(() => parseDuration(input)).toThrow(/Duración inválida.*"2h 30m".*"1\.5"/);
  });

  it.each(["0h", "0", "0m 0h"])("cero: %s", (input) => {
    expect(() => parseDuration(input)).toThrow("La duración debe ser mayor a cero.");
  });
});

describe("worklogStarted", () => {
  const BA = "America/Argentina/Buenos_Aires";

  it("con fecha: 09:00 de ese día en la zona del usuario", () => {
    expect(worklogStarted("2026-10-09", BA)).toEqual({
      started: "2026-10-09T09:00:00.000-0300",
      timeZone: BA,
      fallbackToUtc: false,
    });
  });

  it("sin fecha: ahora, expresado en la zona del usuario", () => {
    const now = new Date("2026-10-12T17:30:15.250Z");
    expect(worklogStarted(undefined, BA, now).started).toBe("2026-10-12T14:30:15.250-0300");
  });

  it("sin fecha cerca de medianoche UTC: el día es el del usuario", () => {
    const now = new Date("2026-10-13T01:00:00.000Z");
    expect(worklogStarted(undefined, BA, now).started).toBe("2026-10-12T22:00:00.000-0300");
  });

  it("respeta el horario de verano", () => {
    expect(worklogStarted("2026-07-01", "Europe/Madrid").started).toBe("2026-07-01T09:00:00.000+0200");
    expect(worklogStarted("2026-01-15", "Europe/Madrid").started).toBe("2026-01-15T09:00:00.000+0100");
  });

  it("zona ausente o inválida → UTC con aviso", () => {
    expect(worklogStarted("2026-10-09", undefined)).toEqual({
      started: "2026-10-09T09:00:00.000+0000",
      timeZone: "UTC",
      fallbackToUtc: true,
    });
    expect(worklogStarted("2026-10-09", "Marte/Olympus").fallbackToUtc).toBe(true);
  });
});

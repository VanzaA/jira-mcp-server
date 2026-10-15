import { describe, expect, it } from "vitest";
import { parseDuration, parseStartTime, worklogStarted } from "../../src/jira/time.js";

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

describe("parseStartTime", () => {
  it.each([
    ["3:00 PM", 15, 0],
    ["3pm", 15, 0],
    ["3 PM", 15, 0],
    ["3:30 p.m.", 15, 30],
    ["9:00 AM", 9, 0],
    ["9 a.m.", 9, 0],
    ["12 AM", 0, 0],
    ["12:30 am", 0, 30],
    ["12 PM", 12, 0],
    ["15:00", 15, 0],
    ["09:30", 9, 30],
    ["9", 9, 0],
    ["0:15", 0, 15],
    ["15hs", 15, 0],
    [" 15 h ", 15, 0],
  ])("%s → %i:%i", (input, hour, minute) => {
    expect(parseStartTime(input)).toEqual({ hour, minute });
  });

  it.each(["25:00", "13 PM", "0 AM", "9:75", "nueve", "", "3:0 PM", "15:00 PM hs"])("inválida: %s", (input) => {
    expect(() => parseStartTime(input)).toThrow(/Hora inválida.*"9:00 AM".*"3:30 PM".*"15:00"/);
  });
});

describe("worklogStarted", () => {
  const BA = "America/Argentina/Buenos_Aires";

  it("con fecha: 09:00 de ese día en la zona del usuario", () => {
    expect(worklogStarted("2026-10-09", BA)).toEqual({
      started: "2026-10-09T09:00:00.000-0300",
      startTime: "9:00 AM",
      timeZone: BA,
      fallbackToUtc: false,
    });
  });

  it("sin fecha: ahora, expresado en la zona del usuario", () => {
    const now = new Date("2026-10-12T17:30:15.250Z");
    expect(worklogStarted(undefined, BA, now)).toMatchObject({ started: "2026-10-12T14:30:15.250-0300", startTime: "2:30 PM" });
  });

  it("sin fecha cerca de medianoche UTC: el día es el del usuario", () => {
    const now = new Date("2026-10-13T01:00:00.000Z");
    expect(worklogStarted(undefined, BA, now).started).toBe("2026-10-12T22:00:00.000-0300");
  });

  it("con fecha y hora: esa hora de ese día", () => {
    expect(worklogStarted("2026-10-09", BA, new Date(), { hour: 15, minute: 30 })).toMatchObject({
      started: "2026-10-09T15:30:00.000-0300",
      startTime: "3:30 PM",
    });
    expect(worklogStarted("2026-10-09", BA, new Date(), { hour: 0, minute: 0 })).toMatchObject({
      started: "2026-10-09T00:00:00.000-0300",
      startTime: "12:00 AM",
    });
  });

  it("hora sin fecha: se ignora y queda ahora", () => {
    const now = new Date("2026-10-12T17:30:00.000Z");
    expect(worklogStarted(undefined, BA, now, { hour: 9, minute: 0 }).started).toBe("2026-10-12T14:30:00.000-0300");
  });

  it("con hora respeta el horario de verano", () => {
    expect(worklogStarted("2026-07-01", "Europe/Madrid", new Date(), { hour: 15, minute: 0 }).started).toBe(
      "2026-07-01T15:00:00.000+0200",
    );
  });

  it("respeta el horario de verano", () => {
    expect(worklogStarted("2026-07-01", "Europe/Madrid").started).toBe("2026-07-01T09:00:00.000+0200");
    expect(worklogStarted("2026-01-15", "Europe/Madrid").started).toBe("2026-01-15T09:00:00.000+0100");
  });

  it("zona ausente o inválida → UTC con aviso", () => {
    expect(worklogStarted("2026-10-09", undefined)).toEqual({
      started: "2026-10-09T09:00:00.000+0000",
      startTime: "9:00 AM",
      timeZone: "UTC",
      fallbackToUtc: true,
    });
    expect(worklogStarted("2026-10-09", "Marte/Olympus").fallbackToUtc).toBe(true);
  });
});

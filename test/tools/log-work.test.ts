import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logWork } from "../../src/tools/log-work.js";
import { baseRoutes, BASE_URL, data, fakeJira, fixture, jiraError, text, type Reply } from "../helpers.js";

function setup(extra: Record<string, Reply> = {}) {
  return fakeJira({
    ...baseRoutes(),
    "POST /issue/PROJ-123/worklog": ({ body }) => ({ ...fixture("worklog"), timeSpent: body.timeSpent, started: body.started, comment: body.comment }),
    ...extra,
  });
}

describe("log_work", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T17:30:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("duración en formato Jira, ahora en la zona del usuario", async () => {
    const jira = setup();

    const result = data(await jira.run(logWork, { issue_key: "PROJ-123", duration: "2h 30m" }));
    expect(jira.call("POST", "/issue/PROJ-123/worklog")!.body).toEqual({
      timeSpent: "2h 30m",
      started: "2026-10-12T14:30:00.000-0300",
    });
    expect(result).toEqual({
      key: "PROJ-123",
      time_spent: "2h 30m",
      started: "2026-10-12T14:30:00.000-0300",
      start_time: "2:30 PM",
      time_zone: "America/Argentina/Buenos_Aires",
      url: `${BASE_URL}/browse/PROJ-123`,
    });
  });

  it("horas decimales", async () => {
    const jira = setup();
    await jira.run(logWork, { issue_key: "PROJ-123", duration: "1.5" });
    expect(jira.call("POST", "/issue/PROJ-123/worklog")!.body.timeSpent).toBe("1h 30m");
  });

  it("fecha pasada con comentario: 09:00 de ese día", async () => {
    const jira = setup();

    const result = data(await jira.run(logWork, { issue_key: "PROJ-123", duration: "4h", date: "2026-10-09", comment: "Revisión de PR" }));
    expect(jira.call("POST", "/issue/PROJ-123/worklog")!.body).toEqual({
      timeSpent: "4h",
      started: "2026-10-09T09:00:00.000-0300",
      comment: "Revisión de PR",
    });
    expect(result).toMatchObject({
      time_spent: "4h",
      started: "2026-10-09T09:00:00.000-0300",
      start_time: "9:00 AM",
      comment: "Revisión de PR",
    });
  });

  it.each(["3:00 PM", "15:00"])("fecha y hora %s: esa hora de ese día, confirmada en AM/PM", async (start_time) => {
    const jira = setup();

    const result = data(await jira.run(logWork, { issue_key: "PROJ-123", duration: "1h", date: "2026-10-09", start_time }));
    expect(jira.call("POST", "/issue/PROJ-123/worklog")!.body).toEqual({
      timeSpent: "1h",
      started: "2026-10-09T15:00:00.000-0300",
    });
    expect(result).toMatchObject({ started: "2026-10-09T15:00:00.000-0300", start_time: "3:00 PM" });
  });

  it("hora sin fecha → error sin request", async () => {
    const jira = setup();
    expect(text(await jira.run(logWork, { issue_key: "PROJ-123", duration: "1h", start_time: "3:00 PM" }))).toBe(
      "Indicá la fecha (date, YYYY-MM-DD) junto con la hora de inicio.",
    );
    expect(jira.calls).toHaveLength(0);
  });

  it("hora inválida → ejemplos de formatos, sin request", async () => {
    const jira = setup();
    expect(
      text(await jira.run(logWork, { issue_key: "PROJ-123", duration: "1h", date: "2026-10-09", start_time: "13 PM" })),
    ).toMatch(/Hora inválida: "13 PM".*"9:00 AM".*"3:30 PM".*"15:00"/);
    expect(jira.calls).toHaveLength(0);
  });

  it("duración inválida → ejemplos de formatos, sin request", async () => {
    const jira = setup();
    expect(text(await jira.run(logWork, { issue_key: "PROJ-123", duration: "dos horas" }))).toMatch(/Duración inválida.*"2h 30m".*"1\.5"/);
    expect(jira.calls).toHaveLength(0);
  });

  it("duración cero → error sin request", async () => {
    const jira = setup();
    expect(text(await jira.run(logWork, { issue_key: "PROJ-123", duration: "0h" }))).toBe("La duración debe ser mayor a cero.");
    expect(jira.calls).toHaveLength(0);
  });

  it("usuario sin zona horaria → UTC con aviso", async () => {
    const jira = setup({ "GET /myself": () => ({ ...fixture("myself"), timeZone: undefined }) });

    const result = data(await jira.run(logWork, { issue_key: "PROJ-123", duration: "1h" }));
    expect(result.started).toBe("2026-10-12T17:30:00.000+0000");
    expect(result.warning).toMatch(/UTC/);
  });

  it("time tracking deshabilitado → el motivo de Jira llega al modelo", async () => {
    const jira = setup({
      "POST /issue/PROJ-123/worklog": () =>
        jiraError(400, { errorMessages: ["You must specify a valid time tracking configuration."], errors: {} }),
    });

    expect(text(await jira.run(logWork, { issue_key: "PROJ-123", duration: "1h" }))).toContain(
      "You must specify a valid time tracking configuration.",
    );
  });
});

import { z } from "zod";
import { issueUrl } from "../jira/format.js";
import { ToolInputError } from "../jira/errors.js";
import { parseDuration, parseStartTime, worklogStarted } from "../jira/time.js";
import type { WorklogPayload } from "../jira/types.js";
import { defineTool, isoDate, issueKey, ok } from "./tool.js";

export const logWork = defineTool({
  name: "log_work",
  title: "Cargar horas",
  description:
    'Registra horas trabajadas (log work) en una issue. Duración en formato Jira ("2h 30m", "45m", "1d") u horas ' +
    'decimales ("1.5"). Sin date se registra ahora; con date (YYYY-MM-DD) se registra a la hora de start_time de ese ' +
    'día ("9:00 AM", "3:30 PM", "15:00"), o a las 09:00 si no se indica, siempre en la zona horaria de tu usuario ' +
    'de Jira. start_time requiere date. Un rango ("de 3 a 6 PM") se pasa como date + start_time + duración ("3h"). ' +
    "Convertí fechas relativas (\"ayer\") a YYYY-MM-DD antes de llamarla.",
  inputSchema: {
    issue_key: issueKey,
    duration: z.string().trim().min(1).describe('Duración: "2h 30m", "45m", "1.5"'),
    date: isoDate.optional().describe("Día trabajado YYYY-MM-DD (por defecto hoy, ahora)"),
    start_time: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Hora de inicio en tu zona horaria ("9:00 AM", "3:30 PM", "15:00"). Requiere date.'),
    comment: z.string().trim().min(1).optional().describe("Comentario del worklog"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler({ issue_key, duration, date, start_time, comment }, { jira, session, baseUrl }) {
    const timeSpent = parseDuration(duration);
    if (start_time !== undefined && date === undefined) {
      throw new ToolInputError("Indicá la fecha (date, YYYY-MM-DD) junto con la hora de inicio.");
    }
    const time = start_time === undefined ? undefined : parseStartTime(start_time);
    const user = await session.myself();
    const { started, startTime, timeZone, fallbackToUtc } = worklogStarted(date, user.timeZone, new Date(), time);

    const payload: WorklogPayload = { timeSpent, started };
    if (comment !== undefined) payload.comment = comment;

    const worklog = await jira.addWorklog(issue_key, payload);
    return ok({
      key: issue_key,
      time_spent: worklog.timeSpent ?? timeSpent,
      started: worklog.started ?? started,
      start_time: startTime,
      time_zone: timeZone,
      ...(comment !== undefined ? { comment } : {}),
      ...(fallbackToUtc
        ? { warning: "Tu usuario de Jira no tiene zona horaria configurada: el worklog se registró en UTC." }
        : {}),
      url: issueUrl(baseUrl, issue_key),
    });
  },
});

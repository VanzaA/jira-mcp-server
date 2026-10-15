import { ToolInputError } from "./errors.js";

const DURATION_HINT = 'Usá el formato de Jira ("2h 30m", "1d", "45m") u horas decimales ("1.5").';

/**
 * Normalizes a duration to the format Jira accepts in `timeSpent`. Decimal hours ("1.5", "1.5h") are
 * converted to hours + minutes; weeks and days are sent as-is because their length depends on the
 * instance's time tracking configuration.
 */
export function parseDuration(input: string): string {
  const raw = input.trim().toLowerCase().replace(/,/g, ".");

  if (/^\d+(\.\d+)?$/.test(raw)) return hoursToJira(Number(raw));

  const tokens = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*([wdhm])/g)];
  const consumed = tokens.map((t) => t[0]).join("");
  if (tokens.length === 0 || consumed.replace(/\s/g, "") !== raw.replace(/\s/g, "")) {
    throw new ToolInputError(`Duración inválida: "${input}". ${DURATION_HINT}`);
  }

  const parts: string[] = [];
  let total = 0;
  for (const [, amount, unit] of tokens) {
    const value = Number(amount);
    total += value;
    if (unit === "h" && !Number.isInteger(value)) parts.push(hoursToJira(value));
    else if (unit === "m") parts.push(`${Math.round(value)}m`);
    else parts.push(`${amount}${unit}`);
  }
  if (total <= 0) throw new ToolInputError("La duración debe ser mayor a cero.");
  return parts.join(" ");
}

function hoursToJira(hours: number): string {
  const minutes = Math.round(hours * 60);
  if (minutes <= 0) throw new ToolInputError("La duración debe ser mayor a cero.");
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h > 0 ? `${h}h` : "", m > 0 ? `${m}m` : ""].filter(Boolean).join(" ");
}

const START_TIME_HINT = 'Usá "9:00 AM", "3:30 PM" o formato 24h ("15:00").';

/** Wall-clock time of day, 24h. */
export interface LocalTime {
  hour: number;
  minute: number;
}

/**
 * Parses a start time in 24h ("15:00", "9", "15hs") or AM/PM ("3:00 PM", "3pm", "3:30 p.m.") notation.
 * "12 AM" is midnight and "12 PM" is noon.
 */
export function parseStartTime(input: string): LocalTime {
  const raw = input.trim().toLowerCase().replace(/\s+/g, " ");
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?|hs?)?$/.exec(raw);
  const invalid = new ToolInputError(`Hora inválida: "${input}". ${START_TIME_HINT}`);
  if (!match) throw invalid;

  const [, h, m, meridiem] = match;
  let hour = Number(h);
  const minute = m === undefined ? 0 : Number(m);
  if (minute > 59) throw invalid;
  if (meridiem) {
    if (hour < 1 || hour > 12) throw invalid;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hour > 23) {
    throw invalid;
  }
  return { hour, minute };
}

function validTimeZone(timeZone: string | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Zone offset at that instant, in minutes (e.g. -180 for UTC-03:00). */
function offsetMinutes(timeZone: string, instant: Date): number {
  const label =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(instant)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(label);
  if (!match) return 0;
  const [, sign, hh, mm] = match;
  return (sign === "-" ? -1 : 1) * (Number(hh) * 60 + Number(mm));
}

function pad(n: number, size = 2): string {
  return String(n).padStart(size, "0");
}

/** `started` format expected by Jira: yyyy-MM-dd'T'HH:mm:ss.SSS±hhmm. */
function formatJira(localMs: number, offset: number): string {
  const d = new Date(localMs);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  );
}

/** Wall-clock time of a local timestamp as "h:mm AM/PM". */
function formatAmPm(localMs: number): string {
  const d = new Date(localMs);
  const hour = d.getUTCHours();
  return `${hour % 12 || 12}:${pad(d.getUTCMinutes())} ${hour < 12 ? "AM" : "PM"}`;
}

export interface Started {
  started: string;
  /** Local start time as "h:mm AM/PM". */
  startTime: string;
  timeZone: string;
  /** true if the Jira user has no valid time zone and UTC was used. */
  fallbackToUtc: boolean;
}

/**
 * Worklog start time in the Jira user's time zone: now, or `time` (09:00 by default) on `date` (YYYY-MM-DD).
 * The container runs in UTC, so the offset is computed explicitly. `time` is ignored without `date`.
 */
export function worklogStarted(
  date: string | undefined,
  userTimeZone: string | undefined,
  now = new Date(),
  time?: LocalTime,
): Started {
  const fallbackToUtc = !validTimeZone(userTimeZone);
  const timeZone = fallbackToUtc ? "UTC" : (userTimeZone as string);

  if (!date) {
    const offset = offsetMinutes(timeZone, now);
    const localMs = now.getTime() + offset * 60_000;
    return { started: formatJira(localMs, offset), startTime: formatAmPm(localMs), timeZone, fallbackToUtc };
  }

  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const localMs = Date.UTC(y, m - 1, d, time?.hour ?? 9, time?.minute ?? 0, 0, 0);
  const offset = offsetMinutes(timeZone, new Date(localMs - offsetMinutes(timeZone, new Date(localMs)) * 60_000));
  return { started: formatJira(localMs, offset), startTime: formatAmPm(localMs), timeZone, fallbackToUtc };
}

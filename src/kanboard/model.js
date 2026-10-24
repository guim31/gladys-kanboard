// -----------------------------------------------------------------------------
// From the raw Kanboard answers to what Gladys shows: projects, open tasks with
// their due time in milliseconds, and the counters of a local day (the time
// zone of Gladys, injected by the supervisor as TZ).
//
// Definitions, the same in the devices, the widget, the scene action and the
// documentation:
//   - open: an open task (with or without a due date);
//   - overdue: an open task whose due time has passed;
//   - to do today: an open task due before the end of the local day,
//     overdue ones included ("what is left to do by tonight");
//   - next task: the open task with the earliest due time still ahead.
// -----------------------------------------------------------------------------

/** Kanboard writes "no date" as 0; its timestamps are in seconds. */
const time = (value) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const int = (value, fallback = 0) =>
  Number.isInteger(Number(value)) && value !== null && value !== '' ? Number(value) : fallback;

/**
 * Active projects, sorted by name then id (Kanboard has no manual order).
 * @param {unknown[]} raw answer of getAllProjects / getMyProjects
 * @returns {Array<{ id: number, title: string, priorityDefault: number, priorityEnd: number }>}
 */
export function parseProjects(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((project) => project && int(project.id) > 0)
    .filter((project) => int(project.is_active, 1) === 1)
    .map((project) => ({
      // Kanboard on older PHP versions sends numbers as strings.
      id: int(project.id),
      title: text(project.name) || `#${project.id}`,
      priorityDefault: int(project.priority_default),
      priorityEnd: int(project.priority_end, 3),
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id);
}

/**
 * Open tasks, sorted by due time (undated last), then id.
 * @param {unknown[]} raw tasks of getAllTasks
 * @returns {Array<{ id: number, title: string, projectId: number, dueAt: number|null,
 *   priority: number }>}
 */
export function parseTasks(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((task) => task && int(task.id) > 0 && int(task.is_active, 1) === 1)
    .map((task) => ({
      id: int(task.id),
      title: text(task.title) || `#${task.id}`,
      projectId: int(task.project_id),
      dueAt: time(task.date_due),
      priority: int(task.priority),
    }))
    .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.id - b.id);
}

// --- Local days -------------------------------------------------------------------

const partsFormatters = new Map();

function zonedParts(ms, timeZone) {
  let format = partsFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormatters.set(timeZone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(ms)).map(({ type, value }) => [type, Number(value)]),
  );
  return parts;
}

/** Offset of `timeZone` from UTC at `ms`, in milliseconds. */
function offsetAt(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of local midnight of a local calendar day (DST-safe). */
function localMidnight(year, month, day, timeZone) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(guess, timeZone);
  let start = guess - offsetAt(first, timeZone);
  // Where the clocks jump at midnight (Chile, Cuba), 00:00 does not exist and
  // the instant found is 23:00 the day before: the day starts an hour later.
  if (zonedParts(start, timeZone).day !== day) {
    start += 60 * 60_000;
  }
  return start;
}

/** UTC instant of a local wall time (the later one when the clocks go back). */
function localTime(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
}

// The time given to a due date typed without one: late afternoon, so a task
// "for today" created in the morning is not overdue at once.
export const DEFAULT_DUE_TIME = { hour: 18, minute: 0 };

const RELATIVE_DAYS = new Map([
  ['today', 0],
  ["aujourd'hui", 0],
  ['heute', 0],
  ['hoy', 0],
  ['tomorrow', 1],
  ['demain', 1],
  ['morgen', 1],
  ['manana', 1],
]);

/**
 * A due date typed in a scene action: empty (none), `2026-10-25`,
 * `2026-10-25 09:30`, `25/10/2026`, `today` / `tomorrow` (and their French,
 * German and Spanish words), `+3` (in three days), each optionally followed
 * by a time (`09:30`, `9h30`); a time alone means today.
 * @returns {number|null|undefined} milliseconds, null when empty, undefined when not understood
 */
export function parseDue(raw, { now, timeZone }) {
  const typed = fold(String(raw ?? '')).replace(/[’`]/g, "'");
  if (typed === '') {
    return null;
  }
  const match = typed.match(/^(?:(.+?)(?:[ t]+|$))??(?:(\d{1,2})(?::|h)(\d{2})?)?$/);
  if (!match || (match[1] === undefined && match[2] === undefined)) {
    return undefined;
  }
  const [, dayPart, hourText, minuteText] = match;
  const today = zonedParts(now, timeZone);
  let date;
  if (dayPart === undefined) {
    date = { year: today.year, month: today.month, day: today.day };
  } else {
    let days = RELATIVE_DAYS.get(dayPart);
    const relative = dayPart.match(/^\+(\d{1,3})$/);
    if (relative) {
      days = Number(relative[1]);
    }
    if (days !== undefined) {
      const d = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
      date = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    } else {
      const iso = dayPart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const european = dayPart.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
      if (iso) {
        date = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
      } else if (european) {
        date = { year: Number(european[3]), month: Number(european[2]), day: Number(european[1]) };
      } else {
        return undefined;
      }
      const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
      if (check.getUTCMonth() + 1 !== date.month || check.getUTCDate() !== date.day) {
        return undefined;
      }
    }
  }
  const hour = hourText === undefined ? DEFAULT_DUE_TIME.hour : Number(hourText);
  const minute = hourText === undefined ? DEFAULT_DUE_TIME.minute : Number(minuteText ?? 0);
  if (hour > 23 || minute > 59) {
    return undefined;
  }
  const at = localTime(date.year, date.month, date.day, hour, minute, timeZone);
  if (hourText === undefined && at <= now) {
    // "today" typed in the evening: due tonight, not already overdue.
    return localTime(date.year, date.month, date.day, 23, 59, timeZone);
  }
  return at;
}

/** A time zone Intl knows, else the one of the process. */
export function resolveTimeZone(timeZone) {
  try {
    if (timeZone) {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return timeZone;
    }
  } catch {
    // fall through
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Start and end (exclusive) of the local day holding `now`. */
export function localDay(now, timeZone) {
  const p = zonedParts(now, timeZone);
  const start = localMidnight(p.year, p.month, p.day, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = localMidnight(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { start, end };
}

// --- Counters ---------------------------------------------------------------------

/**
 * Counters of one day, for every followed project (`projectId` null) or one.
 * @param {ReturnType<typeof parseTasks>} tasks
 * @param {{ now: number, day: { start: number, end: number }, projectId?: number|null }} options
 */
export function summarize(tasks, { now, day, projectId = null }) {
  const mine = projectId === null ? tasks : tasks.filter((task) => task.projectId === projectId);
  const dated = mine.filter((task) => task.dueAt !== null);
  const today = dated.filter((task) => task.dueAt < day.end);
  return {
    open: mine.length,
    toDoToday: today.length,
    overdue: dated.filter((task) => task.dueAt < now).length,
    next: dated.find((task) => task.dueAt >= now) ?? null,
    today,
  };
}

const fold = (value) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Find an item by its number (`12`, `#12`) or its exact title (case, accents
 * and repeated blanks ignored).
 * @template {{ id: number, title: string }} T
 * @param {T[]} items
 * @param {unknown} query
 * @returns {{ item: T|null, reason?: 'empty'|'not_found'|'ambiguous' }}
 */
export function findByIdOrTitle(items, query) {
  const wanted = typeof query === 'number' ? String(query) : String(query ?? '').trim();
  if (!wanted) {
    return { item: null, reason: 'empty' };
  }
  const number = wanted.match(/^#?(\d+)$/);
  if (number) {
    const byId = items.find((item) => item.id === Number(number[1]));
    if (byId) {
      return { item: byId };
    }
  }
  const matches = items.filter((item) => fold(item.title) === fold(wanted));
  if (matches.length === 1) {
    return { item: matches[0] };
  }
  return { item: null, reason: matches.length > 1 ? 'ambiguous' : 'not_found' };
}

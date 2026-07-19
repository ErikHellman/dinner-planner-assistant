/**
 * ISO 8601 week utilities (Monday start, week 1 contains January 4th).
 * Week ids are "YYYY-Www" with a zero-padded week number, e.g. "2026-W07".
 * Shared by server (plan persistence, agent tools) and client (week switcher).
 */

const WEEK_ID_PATTERN = /^(\d{4})-W(\d{2})$/;
const DAY_MS = 86_400_000;

const stockholmDate = new Intl.DateTimeFormat('sv-SE', {
	timeZone: 'Europe/Stockholm',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

/** ISO week-numbering year and week of a UTC calendar date (Thursday algorithm). */
function isoWeekOfUtc(date: Date): { year: number; week: number } {
	const thursday = new Date(date.getTime());
	const isoDay = thursday.getUTCDay() || 7; // Mon=1 .. Sun=7
	thursday.setUTCDate(thursday.getUTCDate() + 4 - isoDay);
	const year = thursday.getUTCFullYear();
	const yearStart = Date.UTC(year, 0, 1);
	const week = Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / 7);
	return { year, week };
}

function formatWeekId(year: number, week: number): string {
	return `${year}-W${String(week).padStart(2, '0')}`;
}

/** UTC date of the Monday starting the given ISO week (January 4th is always in W01). */
function mondayOfWeek(year: number, week: number): Date {
	const jan4 = new Date(Date.UTC(year, 0, 4));
	const isoDay = jan4.getUTCDay() || 7;
	const mondayW1 = jan4.getTime() - (isoDay - 1) * DAY_MS;
	return new Date(mondayW1 + (week - 1) * 7 * DAY_MS);
}

function toIsoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function parseOrThrow(id: string): { year: number; week: number } {
	const parsed = parseWeekId(id);
	if (!parsed) throw new Error(`Invalid week id "${id}" — expected "YYYY-Www", e.g. "2026-W29"`);
	return parsed;
}

/** The week id of `now` (default: current time) on the Europe/Stockholm calendar. */
export function currentWeekId(now: Date = new Date()): string {
	// "sv-SE" formats as YYYY-MM-DD; re-anchor that local calendar date at UTC
	// midnight so the pure UTC week math below sees Stockholm's date.
	const localDate = new Date(`${stockholmDate.format(now)}T00:00:00Z`);
	const { year, week } = isoWeekOfUtc(localDate);
	return formatWeekId(year, week);
}

/** Number of ISO weeks in a week-numbering year: 52 or 53. */
export function weeksInIsoYear(year: number): 52 | 53 {
	// December 28th is always in the last week of the ISO year.
	return isoWeekOfUtc(new Date(Date.UTC(year, 11, 28))).week as 52 | 53;
}

/** Parse "YYYY-Www" into its parts; null when malformed or out of range. */
export function parseWeekId(id: string): { year: number; week: number } | null {
	const match = WEEK_ID_PATTERN.exec(id);
	if (!match) return null;
	const year = Number(match[1]);
	const week = Number(match[2]);
	if (week < 1 || week > weeksInIsoYear(year)) return null;
	return { year, week };
}

/** Shift a week id by a number of weeks, crossing year boundaries as needed. */
export function addWeeks(id: string, delta: number): string {
	const { year, week } = parseOrThrow(id);
	const monday = new Date(mondayOfWeek(year, week).getTime() + delta * 7 * DAY_MS);
	const shifted = isoWeekOfUtc(monday);
	return formatWeekId(shifted.year, shifted.week);
}

/** The Monday and Sunday calendar dates ("YYYY-MM-DD") of the week. */
export function weekRange(id: string): { start: string; end: string } {
	const { year, week } = parseOrThrow(id);
	const monday = mondayOfWeek(year, week);
	const sunday = new Date(monday.getTime() + 6 * DAY_MS);
	return { start: toIsoDate(monday), end: toIsoDate(sunday) };
}

/** Chronological comparator for week ids (usable with Array.prototype.sort). */
export function compareWeekIds(a: string, b: string): number {
	const pa = parseOrThrow(a);
	const pb = parseOrThrow(b);
	return pa.year - pb.year || pa.week - pb.week;
}

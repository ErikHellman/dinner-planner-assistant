import { describe, expect, it } from 'vitest';
import {
	addWeeks,
	compareWeekIds,
	currentWeekId,
	parseWeekId,
	weekRange,
	weeksInIsoYear
} from './week';

describe('currentWeekId', () => {
	it('computes the ISO week of the Stockholm calendar date', () => {
		expect(currentWeekId(new Date('2026-07-19T10:00:00Z'))).toBe('2026-W29');
		expect(currentWeekId(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
	});

	it('rolls over at Stockholm midnight, not UTC midnight (CEST, UTC+2)', () => {
		// 22:30 UTC on Sunday is 00:30 Monday in Stockholm — already next week there.
		expect(currentWeekId(new Date('2026-07-19T22:30:00Z'))).toBe('2026-W30');
	});

	it('rolls over at Stockholm midnight in winter (CET, UTC+1)', () => {
		// Sunday 2026-01-04 23:30 UTC is Monday 00:30 in Stockholm.
		expect(currentWeekId(new Date('2026-01-04T23:30:00Z'))).toBe('2026-W02');
	});

	it('assigns year-boundary dates to the ISO year, not the calendar year', () => {
		expect(currentWeekId(new Date('2025-12-29T12:00:00Z'))).toBe('2026-W01');
		expect(currentWeekId(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
	});
});

describe('weeksInIsoYear', () => {
	it('knows 53-week years', () => {
		expect(weeksInIsoYear(2026)).toBe(53);
		expect(weeksInIsoYear(2020)).toBe(53);
	});

	it('knows 52-week years', () => {
		expect(weeksInIsoYear(2025)).toBe(52);
		expect(weeksInIsoYear(2027)).toBe(52);
	});
});

describe('parseWeekId', () => {
	it('parses valid ids', () => {
		expect(parseWeekId('2026-W29')).toEqual({ year: 2026, week: 29 });
		expect(parseWeekId('2026-W53')).toEqual({ year: 2026, week: 53 });
		expect(parseWeekId('2026-W07')).toEqual({ year: 2026, week: 7 });
	});

	it('rejects malformed and out-of-range ids', () => {
		expect(parseWeekId('2026-W00')).toBeNull();
		expect(parseWeekId('2026-W54')).toBeNull();
		expect(parseWeekId('2025-W53')).toBeNull(); // 2025 has 52 weeks
		expect(parseWeekId('2026-w29')).toBeNull();
		expect(parseWeekId('2026-W7')).toBeNull(); // must be zero-padded
		expect(parseWeekId('garbage')).toBeNull();
		expect(parseWeekId('')).toBeNull();
	});
});

describe('addWeeks', () => {
	it('adds within a year', () => {
		expect(addWeeks('2026-W29', 1)).toBe('2026-W30');
		expect(addWeeks('2026-W29', -1)).toBe('2026-W28');
	});

	it('crosses year boundaries in both directions', () => {
		expect(addWeeks('2026-W53', 1)).toBe('2027-W01');
		expect(addWeeks('2027-W01', -1)).toBe('2026-W53');
		expect(addWeeks('2026-W01', -1)).toBe('2025-W52');
	});

	it('throws on an invalid week id', () => {
		expect(() => addWeeks('2026-W99', 1)).toThrow();
	});
});

describe('weekRange', () => {
	it('returns the Monday..Sunday dates of the week', () => {
		expect(weekRange('2026-W29')).toEqual({ start: '2026-07-13', end: '2026-07-19' });
		expect(weekRange('2026-W01')).toEqual({ start: '2025-12-29', end: '2026-01-04' });
	});
});

describe('compareWeekIds', () => {
	it('orders ids chronologically across years', () => {
		expect(compareWeekIds('2026-W02', '2026-W10')).toBeLessThan(0);
		expect(compareWeekIds('2026-W53', '2027-W01')).toBeLessThan(0);
		expect(compareWeekIds('2026-W29', '2026-W29')).toBe(0);
		expect(compareWeekIds('2027-W01', '2026-W53')).toBeGreaterThan(0);
	});
});

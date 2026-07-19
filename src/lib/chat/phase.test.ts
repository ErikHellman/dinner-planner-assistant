import { describe, expect, test } from 'vitest';
import { phaseFor, phaseLabel } from './phase';

describe('phaseFor', () => {
	test('a started turn is thinking before anything arrives', () => {
		expect(phaseFor({ type: 'start' })).toBe('thinking');
	});

	test('a text delta means the agent is writing', () => {
		expect(phaseFor({ type: 'text' })).toBe('writing');
	});

	test('a tool start interrupts writing', () => {
		expect(phaseFor({ type: 'tool-start' })).toBe('tool');
	});

	test('a finished tool returns to thinking, since more output is expected', () => {
		expect(phaseFor({ type: 'tool-end' })).toBe('thinking');
	});

	test('the end of the stream is idle', () => {
		expect(phaseFor({ type: 'end' })).toBe('idle');
	});
});

describe('phaseLabel', () => {
	test('idle has no label', () => {
		expect(phaseLabel('idle', null)).toBeNull();
	});

	test('thinking and writing have Swedish labels', () => {
		expect(phaseLabel('thinking', null)).toBe('Tänker…');
		expect(phaseLabel('writing', null)).toBe('Skriver…');
	});

	test('a running tool shows its own activity label', () => {
		expect(phaseLabel('tool', 'Söker recept…')).toBe('Söker recept…');
	});

	test('a running tool without a known activity falls back to a generic label', () => {
		expect(phaseLabel('tool', null)).toBe('Arbetar…');
	});
});

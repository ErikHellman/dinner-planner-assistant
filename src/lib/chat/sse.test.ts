import { describe, expect, it } from 'vitest';
import { createSseParser } from './sse';

const enc = new TextEncoder();

function frame(json: string): string {
	return `data: ${json}\n\n`;
}

describe('createSseParser', () => {
	it('parses a complete data event', () => {
		const parser = createSseParser();
		const events = parser.push(enc.encode(frame('{"type":"text","delta":"Hi"}')));
		expect(events).toEqual([{ type: 'text', delta: 'Hi' }]);
	});

	it('parses multiple events in one chunk', () => {
		const parser = createSseParser();
		const chunk = frame('{"type":"text","delta":"a"}') + frame('{"type":"done"}');
		expect(parser.push(enc.encode(chunk))).toEqual([
			{ type: 'text', delta: 'a' },
			{ type: 'done' }
		]);
	});

	it('buffers an event split across chunk boundaries', () => {
		const parser = createSseParser();
		const whole = frame('{"type":"text","delta":"hello"}');
		const first = parser.push(enc.encode(whole.slice(0, 12)));
		expect(first).toEqual([]);
		const second = parser.push(enc.encode(whole.slice(12)));
		expect(second).toEqual([{ type: 'text', delta: 'hello' }]);
	});

	it('reassembles multi-byte UTF-8 characters split across chunks', () => {
		const parser = createSseParser();
		const bytes = enc.encode(frame('{"type":"text","delta":"kött"}'));
		// Split inside the two-byte "ö" character.
		const splitAt = 22;
		const first = parser.push(bytes.slice(0, splitAt));
		const second = parser.push(bytes.slice(splitAt));
		expect([...first, ...second]).toEqual([{ type: 'text', delta: 'kött' }]);
	});

	it('skips malformed JSON without dropping later events', () => {
		const parser = createSseParser();
		const chunk = frame('{not json}') + frame('{"type":"done"}');
		expect(parser.push(enc.encode(chunk))).toEqual([{ type: 'done' }]);
	});

	it('ignores non-data lines such as comments', () => {
		const parser = createSseParser();
		const chunk = ': keepalive\n\n' + frame('{"type":"done"}');
		expect(parser.push(enc.encode(chunk))).toEqual([{ type: 'done' }]);
	});
});

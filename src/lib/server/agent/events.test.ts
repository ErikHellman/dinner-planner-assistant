import { describe, expect, it } from 'vitest';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { toWireEvent } from './events';

describe('toWireEvent', () => {
	it('maps text deltas to text events', () => {
		const event = {
			type: 'message_update',
			message: { role: 'assistant' },
			assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hi' }
		} as AgentSessionEvent;
		expect(toWireEvent(event)).toEqual({ type: 'text', delta: 'Hi' });
	});

	it('maps a failed assistant message to an error event', () => {
		// Pi ends a failed turn with message_end (stopReason "error") and resolves
		// prompt() normally — no message_update error event is emitted.
		const event = {
			type: 'message_end',
			message: {
				role: 'assistant',
				stopReason: 'error',
				errorMessage: '401 invalid x-api-key'
			}
		} as AgentSessionEvent;
		expect(toWireEvent(event)).toEqual({
			type: 'error',
			code: 'agent_error',
			message: '401 invalid x-api-key'
		});
	});

	it('ignores message_end for successful turns', () => {
		const event = {
			type: 'message_end',
			message: { role: 'assistant', stopReason: 'stop' }
		} as AgentSessionEvent;
		expect(toWireEvent(event)).toBeNull();
	});

	it('ignores message_end for aborted turns', () => {
		const event = {
			type: 'message_end',
			message: { role: 'assistant', stopReason: 'aborted' }
		} as AgentSessionEvent;
		expect(toWireEvent(event)).toBeNull();
	});

	it('ignores non-assistant message_end entries', () => {
		const event = {
			type: 'message_end',
			message: { role: 'user' }
		} as AgentSessionEvent;
		expect(toWireEvent(event)).toBeNull();
	});
});

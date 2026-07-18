import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { WireEvent } from '$lib/chat/types';

/**
 * Maps Pi session events onto the wire protocol. This is the only place that
 * knows Pi's event names; everything downstream speaks WireEvent.
 *
 * Provider failures do not reject prompt(): Pi ends the turn with a
 * message_end whose assistant message has stopReason "error", so that is where
 * errors are detected. Aborts are not mapped — the client initiated them and
 * handles the cut-off locally. Turn completion ("done") is signalled by the
 * caller when session.prompt() resolves.
 */
export function toWireEvent(event: AgentSessionEvent): WireEvent | null {
	switch (event.type) {
		case 'message_update': {
			const e = event.assistantMessageEvent;
			if (e.type === 'text_delta') {
				return { type: 'text', delta: e.delta };
			}
			return null;
		}
		case 'message_end': {
			const message = event.message;
			if (message.role === 'assistant' && message.stopReason === 'error') {
				return {
					type: 'error',
					code: 'agent_error',
					message: message.errorMessage ?? 'The agent reported an error.'
				};
			}
			return null;
		}
		case 'tool_execution_start':
			return { type: 'tool', name: event.toolName, phase: 'start' };
		case 'tool_execution_end':
			return { type: 'tool', name: event.toolName, phase: 'end' };
		default:
			return null;
	}
}

/**
 * Wire protocol between the chat API and the browser: each SSE `data:` line
 * carries one JSON-encoded WireEvent.
 */
export type WireEvent =
	| { type: 'text'; delta: string }
	| { type: 'tool'; name: string; phase: 'start' | 'end' }
	| { type: 'done' }
	| { type: 'error'; code: 'missing_api_key' | 'agent_error'; message: string };

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	error?: boolean;
}

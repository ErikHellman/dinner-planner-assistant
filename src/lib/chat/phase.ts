/**
 * The agent's visible working state during one chat turn. Kept pure and
 * separate from the store so the transition table can be unit tested.
 */
export type ChatPhase = 'idle' | 'thinking' | 'tool' | 'writing';

/** Turn lifecycle events, derived from the wire events in `types.ts`. */
export type PhaseEvent =
	| { type: 'start' }
	| { type: 'text' }
	| { type: 'tool-start' }
	| { type: 'tool-end' }
	| { type: 'end' };

/** The phase depends only on the most recent event, not on the previous phase. */
export function phaseFor(event: PhaseEvent): ChatPhase {
	switch (event.type) {
		case 'start':
			return 'thinking';
		case 'text':
			return 'writing';
		case 'tool-start':
			return 'tool';
		// A tool result means the agent is deciding what to do next, so more
		// output is still expected — never go idle here.
		case 'tool-end':
			return 'thinking';
		case 'end':
			return 'idle';
	}
}

/**
 * Swedish status text for a phase. `activity` is the running tool's label
 * (see `activity.ts`) and is only used while a tool is running.
 */
export function phaseLabel(phase: ChatPhase, activity: string | null): string | null {
	switch (phase) {
		case 'idle':
			return null;
		case 'thinking':
			return 'Tänker…';
		case 'tool':
			return activity ?? 'Arbetar…';
		case 'writing':
			return 'Skriver…';
	}
}

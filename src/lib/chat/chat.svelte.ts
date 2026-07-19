import { activityLabel } from './activity';
import { phaseFor, phaseLabel, type ChatPhase } from './phase';
import { createSseParser } from './sse';
import type { ChatMessage } from './types';

export class ChatStore {
	messages = $state<ChatMessage[]>([]);
	/** What the agent is doing right now; drives every "is it working" affordance. */
	phase = $state<ChatPhase>('idle');
	/** Unsent input text; lives here so it survives tab navigation. */
	draft = $state('');
	/** Swedish label for the tool the agent is currently running, if any. */
	activity = $state<string | null>(null);
	#controller: AbortController | null = null;

	get busy(): boolean {
		return this.phase !== 'idle';
	}

	/** Swedish status text for the current phase, or null when idle. */
	get statusLabel(): string | null {
		return phaseLabel(this.phase, this.activity);
	}

	async send(text: string): Promise<void> {
		const message = text.trim();
		if (!message || this.busy) return;

		this.messages.push({ role: 'user', content: message });
		this.messages.push({ role: 'assistant', content: '' });
		// Re-read through the $state proxy so mutations below are reactive.
		const reply = this.messages[this.messages.length - 1];
		this.phase = phaseFor({ type: 'start' });
		this.#controller = new AbortController();

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message }),
				signal: this.#controller.signal
			});

			if (!res.ok || !res.body) {
				const details = (await res.json().catch(() => null)) as { error?: string } | null;
				reply.content = details?.error ?? `Request failed (HTTP ${res.status})`;
				reply.error = true;
				return;
			}

			const reader = res.body.getReader();
			const parser = createSseParser();
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				for (const event of parser.push(value)) {
					if (event.type === 'text') {
						reply.content += event.delta;
						this.phase = phaseFor({ type: 'text' });
					} else if (event.type === 'tool') {
						const start = event.phase === 'start';
						this.activity = start ? activityLabel(event.name) : null;
						this.phase = phaseFor({ type: start ? 'tool-start' : 'tool-end' });
					} else if (event.type === 'error') {
						reply.content = reply.content || event.message;
						reply.error = true;
					}
				}
			}
		} catch (error) {
			if (isAbortError(error)) {
				reply.content = reply.content || '(stopped)';
			} else {
				reply.content = reply.content || 'Connection to the server was lost.';
				reply.error = true;
			}
		} finally {
			this.#controller = null;
			this.phase = phaseFor({ type: 'end' });
			this.activity = null;
		}
	}

	stop(): void {
		this.#controller?.abort();
	}

	async newChat(): Promise<void> {
		this.stop();
		await fetch('/api/chat/reset', { method: 'POST' });
		this.messages = [];
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

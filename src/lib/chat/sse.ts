import type { WireEvent } from './types';

export interface SseParser {
	/** Feed a chunk from the response body; returns any events completed by it. */
	push(chunk: Uint8Array): WireEvent[];
}

export function createSseParser(): SseParser {
	const decoder = new TextDecoder();
	let buffer = '';

	return {
		push(chunk) {
			buffer += decoder.decode(chunk, { stream: true });
			const events: WireEvent[] = [];

			let boundary;
			while ((boundary = buffer.indexOf('\n\n')) !== -1) {
				const block = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);

				for (const line of block.split('\n')) {
					if (!line.startsWith('data:')) continue;
					try {
						events.push(JSON.parse(line.slice(5)));
					} catch {
						// Malformed frame: skip it rather than break the stream.
					}
				}
			}

			return events;
		}
	};
}

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { WireEvent } from '$lib/chat/types';
import { AgentConfigError } from '$lib/server/agent/config';
import { toWireEvent } from '$lib/server/agent/events';
import { getAgent } from '$lib/server/agent/session';

const encoder = new TextEncoder();

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
	const message = typeof body?.message === 'string' ? body.message.trim() : '';
	if (!message) {
		return json({ error: 'message is required', code: 'bad_request' }, { status: 400 });
	}

	let session;
	try {
		({ session } = await getAgent());
	} catch (error) {
		const code = error instanceof AgentConfigError ? 'missing_api_key' : 'agent_error';
		const msg = error instanceof Error ? error.message : String(error);
		return json({ error: msg, code }, { status: 503 });
	}

	if (session.isStreaming) {
		return json({ error: 'A response is already in progress', code: 'busy' }, { status: 409 });
	}

	let unsubscribe: (() => void) | undefined;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let open = true;
			const send = (event: WireEvent) => {
				if (!open) return;
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			};
			const finish = (event: WireEvent) => {
				if (!open) return;
				send(event);
				open = false;
				unsubscribe?.();
				controller.close();
			};

			unsubscribe = session.subscribe((event) => {
				const wire = toWireEvent(event);
				if (wire) send(wire);
			});

			session
				.prompt(message)
				.then(() => finish({ type: 'done' }))
				.catch((error: unknown) =>
					finish({
						type: 'error',
						code: 'agent_error',
						message: error instanceof Error ? error.message : String(error)
					})
				);
		},
		cancel() {
			// Client disconnected or aborted: stop the agent turn and detach.
			unsubscribe?.();
			void session.abort();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};

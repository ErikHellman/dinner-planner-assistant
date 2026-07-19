/** Typed fetch wrapper for the app's own API. Wire errors are {error, code}
 * with English detail; Swedish user-facing text is mapped from the code here. */
export class ApiError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(input, init);
	} catch {
		throw new ApiError('network', 'Could not reach the server', 0);
	}
	if (!res.ok) {
		const details = (await res.json().catch(() => null)) as {
			error?: string;
			code?: string;
		} | null;
		throw new ApiError(details?.code ?? 'unknown', details?.error ?? `HTTP ${res.status}`, res.status);
	}
	return (await res.json()) as T;
}

const MESSAGES: Record<string, string> = {
	willys_not_configured:
		'Willys-uppgifter saknas. Ange WILLYS_USERNAME och WILLYS_PASSWORD i .env och starta om servern.',
	willys_error: 'Kunde inte nå Willys. Försök igen.',
	bad_request: 'Felaktig förfrågan.',
	not_found: 'Hittades inte.',
	recipes_unavailable: 'Receptdatabasen är inte tillgänglig.',
	plan_error: 'Kunde inte läsa veckoplanen.',
	network: 'Kunde inte nå servern. Kontrollera att den är igång.',
	unknown: 'Något gick fel.'
};

export function messageForCode(code: string): string {
	return MESSAGES[code] ?? MESSAGES.unknown;
}

export function messageFor(err: unknown): string {
	return err instanceof ApiError ? messageForCode(err.code) : MESSAGES.unknown;
}

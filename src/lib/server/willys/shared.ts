import { rm } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { effectiveWillysEnv } from '../settings/effective';
import { getSettingsSnapshot } from '../settings/shared';
import { WillysClient } from './client';
import { WillysSession } from './session';

// One WillysClient for the whole server (agent tools + cart REST routes):
// data/willys/session.json has no lock, so a single in-memory cookie jar and
// auth promise must own it. Cached on globalThis to survive Vite HMR reloads.
const g = globalThis as typeof globalThis & { __willysClient?: WillysClient };

function sessionFile(): string {
	return path.resolve(process.cwd(), 'data/willys/session.json');
}

export function getWillysClient(): WillysClient {
	// Credentials come from the Inställningar tab first, .env second; the env
	// view reads the settings snapshot lazily, at auth time.
	g.__willysClient ??= new WillysClient(
		new WillysSession(effectiveWillysEnv(getSettingsSnapshot, env), sessionFile())
	);
	return g.__willysClient;
}

/** Drop the cached client after a credential change. The persisted session goes
 * with it — those cookies authenticate the PREVIOUS account, and a stale jar
 * would silently keep using it. */
export async function resetWillysClient(): Promise<void> {
	g.__willysClient = undefined;
	await rm(sessionFile(), { force: true });
}

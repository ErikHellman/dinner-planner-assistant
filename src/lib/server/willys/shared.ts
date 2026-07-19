import path from 'node:path';
import { env } from '$env/dynamic/private';
import { WillysClient } from './client';
import { WillysSession } from './session';

// One WillysClient for the whole server (agent tools + cart REST routes):
// data/willys/session.json has no lock, so a single in-memory cookie jar and
// auth promise must own it. Cached on globalThis to survive Vite HMR reloads.
const g = globalThis as typeof globalThis & { __willysClient?: WillysClient };

export function getWillysClient(): WillysClient {
	g.__willysClient ??= new WillysClient(
		new WillysSession(env, path.resolve(process.cwd(), 'data/willys/session.json'))
	);
	return g.__willysClient;
}

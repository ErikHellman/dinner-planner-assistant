import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRuntime,
	SessionManager,
	type AgentSession
} from '@earendil-works/pi-coding-agent';
import { AgentConfigError, getAgentConfig } from './config';
import { SYSTEM_PROMPT } from './prompt';
import { WillysSession } from '../willys/session';
import { WillysClient } from '../willys/client';
import { createWillysTools } from './tools/willys';

const SESSIONS_DIR = path.resolve(process.cwd(), 'data/sessions');

export interface AgentBundle {
	session: AgentSession;
}

// Cached on globalThis so the singleton survives Vite HMR module reloads in dev.
// The promise (not the resolved value) is cached to prevent double-init races.
const g = globalThis as typeof globalThis & { __dinnerAgent?: Promise<AgentBundle> };

export function getAgent(): Promise<AgentBundle> {
	g.__dinnerAgent ??= init().catch((error) => {
		g.__dinnerAgent = undefined;
		throw error;
	});
	return g.__dinnerAgent;
}

/** Disposes the current session (if any) and lets the next getAgent() start fresh. */
export async function resetAgent(): Promise<void> {
	const pending = g.__dinnerAgent;
	g.__dinnerAgent = undefined;
	if (!pending) return;
	try {
		const { session } = await pending;
		await session.abort();
		session.dispose();
	} catch {
		// A broken previous session must not block starting a fresh one.
	}
}

async function init(): Promise<AgentBundle> {
	const config = getAgentConfig();
	await mkdir(SESSIONS_DIR, { recursive: true });

	const cwd = process.cwd();
	const agentDir = getAgentDir();

	const modelRuntime = await ModelRuntime.create();
	// Vite/SvelteKit load .env themselves, so the key from $env/dynamic/private is
	// handed to Pi explicitly instead of relying on it being in process.env.
	await modelRuntime.setRuntimeApiKey(config.provider, config.apiKey);

	const model = modelRuntime.getModel(config.provider, config.model);
	if (!model) {
		throw new AgentConfigError(
			`Unknown model "${config.provider}/${config.model}". Check PI_PROVIDER and PI_MODEL in .env.`
		);
	}

	// Pure chat assistant for now: no coding tools, and no skills/extensions/context
	// files from disk. Later milestones register curated dinner-planning tools here.
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		systemPromptOverride: () => SYSTEM_PROMPT,
		appendSystemPromptOverride: () => []
	});
	await resourceLoader.reload();

	const willys = new WillysClient(
		new WillysSession(env, path.resolve(process.cwd(), 'data/willys/session.json'))
	);

	const { session } = await createAgentSession({
		cwd,
		modelRuntime,
		model,
		noTools: 'builtin',
		customTools: createWillysTools(willys),
		resourceLoader,
		sessionManager: SessionManager.create(cwd, SESSIONS_DIR)
	});

	return { session };
}

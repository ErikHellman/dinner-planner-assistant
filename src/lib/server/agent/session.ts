import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRuntime,
	SessionManager,
	type AgentSession
} from '@earendil-works/pi-coding-agent';
import { AgentConfigError, getAgentConfig } from './config';
import { buildSystemPrompt } from './prompt';
import { getWillysClient } from '../willys/shared';
import { createWillysTools } from './tools/willys';
import { RecipeStore } from '../recipes/query';
import { createRecipeTools } from './tools/recipes';
import { PlanStore } from '../plans/store';
import { createPlanTools } from './tools/plans';

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

	// Grocery tools (Willys search + cart), recipe-database tools and weekly-plan tools
	// are registered below via customTools; the agent runs with noTools:'builtin' so it
	// has these and no shell/file tools. No skills/extensions/context files are loaded
	// from disk. The system prompt is built per session so its week context is current.
	const systemPrompt = buildSystemPrompt();
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		systemPromptOverride: () => systemPrompt,
		appendSystemPromptOverride: () => []
	});
	await resourceLoader.reload();

	// Shared with the cart REST routes — one client must own the session file.
	const willys = getWillysClient();
	const recipes = new RecipeStore(path.resolve(process.cwd(), 'data/recipes'));
	const plans = new PlanStore();

	const { session } = await createAgentSession({
		cwd,
		modelRuntime,
		model,
		noTools: 'builtin',
		customTools: [
			...createWillysTools(willys),
			...createRecipeTools(recipes, { plans }),
			...createPlanTools({ willys, plans })
		],
		resourceLoader,
		sessionManager: SessionManager.create(cwd, SESSIONS_DIR)
	});

	return { session };
}

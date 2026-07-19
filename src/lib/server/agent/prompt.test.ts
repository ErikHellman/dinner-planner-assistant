import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, coreSystemPrompt } from './prompt';

const NOW = new Date('2026-07-19T12:00:00Z');

describe('coreSystemPrompt', () => {
	it('describes the agent, its tools and the current week', () => {
		const prompt = coreSystemPrompt(NOW);
		expect(prompt).toContain('Dinner Planner Assistant');
		expect(prompt).toContain('recipe_aggregate');
		expect(prompt).toContain('2026-W30');
	});

	it('tells the agent to check recent weeks before proposing dinners', () => {
		const prompt = coreSystemPrompt(NOW);
		expect(prompt).toContain('plan_history');
		expect(prompt).toContain('avoid repeating a dish');
	});
});

describe('buildSystemPrompt', () => {
	it('is exactly the core prompt when nothing is saved', () => {
		expect(buildSystemPrompt(NOW)).toBe(coreSystemPrompt(NOW));
		expect(
			buildSystemPrompt(NOW, {
				foodPreferences: '   ',
				dislikesAllergies: '',
				extraInstructions: ''
			})
		).toBe(coreSystemPrompt(NOW));
	});

	it('appends each saved block', () => {
		const prompt = buildSystemPrompt(NOW, {
			foodPreferences: 'gillar starkt, inget fläsk',
			dislikesAllergies: 'nötter',
			extraInstructions: 'svara kortfattat'
		});
		expect(prompt).toContain('gillar starkt, inget fläsk');
		expect(prompt).toContain('nötter');
		expect(prompt).toContain('svara kortfattat');
	});

	it('states allergies as hard constraints', () => {
		expect(buildSystemPrompt(NOW, { dislikesAllergies: 'nötter' })).toContain('HARD constraints');
	});

	it('omits the blocks that are blank', () => {
		const prompt = buildSystemPrompt(NOW, { foodPreferences: 'fisk' });
		expect(prompt).toContain('fisk');
		expect(prompt).not.toContain('Extra instructions');
		expect(prompt).not.toContain('Disliked food');
	});
});

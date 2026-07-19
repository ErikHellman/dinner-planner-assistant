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
		expect(prompt).not.toContain('has judged');
	});

	it('lists judged recipes, vetoes worded as a prohibition', () => {
		const prompt = buildSystemPrompt(NOW, {
			likedRecipes: ['Laxwok med teriyakisås'],
			vetoedRecipes: ['Grillad fläskkotlett']
		});
		expect(prompt).toContain('Recipes the user has judged');
		expect(prompt).toContain('- Laxwok med teriyakisås');
		expect(prompt).toContain('- Grillad fläskkotlett');
		expect(prompt).toContain('Never suggest or plan them');
	});

	it('omits the half of the verdict block that is empty', () => {
		const liked = buildSystemPrompt(NOW, { likedRecipes: ['Laxwok'] });
		expect(liked).toContain('Favoriter');
		expect(liked).not.toContain('Aldrig igen');

		const vetoed = buildSystemPrompt(NOW, { vetoedRecipes: ['Fläskkotlett'] });
		expect(vetoed).toContain('Aldrig igen');
		expect(vetoed).not.toContain('Favoriter');
	});

	it('ignores empty verdict lists entirely', () => {
		expect(buildSystemPrompt(NOW, { likedRecipes: [], vetoedRecipes: [] })).toBe(
			coreSystemPrompt(NOW)
		);
	});
});

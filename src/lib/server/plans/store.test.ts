import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ShoppingList } from '../recipes/aggregate';
import type { WillysCartSnapshot } from '../../plans/types';
import { createWeeklyPlan, PlanStore, PlanStoreError } from './store';

const LIST: ShoppingList = {
	servings: 4,
	recipes: [{ recipeId: 100575, name: 'Grillad fläskkotlett' }],
	items: [
		{
			name: 'potatis',
			amounts: [{ value: 800, unit: 'g', display: '800 g' }],
			toTaste: false,
			recipeIds: [100575]
		}
	],
	pantryStaples: [{ name: 'salt', amounts: [], toTaste: true, recipeIds: [100575] }],
	generatedAt: '2026-07-19T10:00:00.000Z'
};

const SNAPSHOT: WillysCartSnapshot = {
	recordedAt: '2026-07-19T11:00:00.000Z',
	store: { id: '2583' },
	itemCount: 1,
	totalQuantity: 2,
	lines: [
		{
			productId: '101233933_ST',
			name: 'Potatis fast',
			brand: null,
			quantity: 2,
			pickUnit: 'pieces',
			unitPrice: { amount: 12.9, formatted: '12,90 kr', currency: 'SEK' },
			lineTotal: { amount: 25.8, formatted: '25,80 kr', currency: 'SEK' },
			categories: [],
			displaySize: '1 kg',
			imageUrl: null
		}
	],
	subtotal: { amount: 25.8, formatted: '25,80 kr', currency: 'SEK' }
};

describe('PlanStore', () => {
	let dir: string;
	let store: PlanStore;

	beforeEach(async () => {
		dir = await mkdtemp(path.join(os.tmpdir(), 'plans-'));
		store = new PlanStore(dir);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('round-trips a plan through save and load', async () => {
		const plan = createWeeklyPlan(LIST, '2026-W29');
		expect(plan.willysCart).toBeNull();
		expect(plan.generatedAt).toBe(LIST.generatedAt);

		const { plan: saved, filePath } = await store.save(plan);
		expect(filePath).toBe(path.join(dir, '2026-W29.json'));

		const loaded = await store.load('2026-W29');
		expect(loaded).toEqual(saved);
		expect(loaded?.shoppingList.items[0].name).toBe('potatis');
	});

	it('returns null when no plan exists for the week', async () => {
		await expect(store.load('2026-W30')).resolves.toBeNull();
	});

	it('rejects an invalid week id on load and save', async () => {
		await expect(store.load('2026-W99')).rejects.toThrow(PlanStoreError);
		const plan = { ...createWeeklyPlan(LIST, '2026-W29'), weekId: 'nonsense' };
		await expect(store.save(plan)).rejects.toThrow(PlanStoreError);
	});

	it('rejects a corrupt plan file', async () => {
		await writeFile(path.join(dir, '2026-W29.json'), '{ not json');
		await expect(store.load('2026-W29')).rejects.toThrow(PlanStoreError);
	});

	it('rejects a plan file whose weekId does not match its filename', async () => {
		const plan = createWeeklyPlan(LIST, '2026-W29');
		await writeFile(path.join(dir, '2026-W30.json'), JSON.stringify(plan, null, 2));
		await expect(store.load('2026-W30')).rejects.toThrow(PlanStoreError);
	});

	it('lists only valid week files, sorted chronologically across years', async () => {
		await store.save(createWeeklyPlan(LIST, '2027-W01'));
		await store.save(createWeeklyPlan(LIST, '2026-W29'));
		await store.save(createWeeklyPlan(LIST, '2026-W53'));
		await writeFile(path.join(dir, 'shopping-list.json'), '{}'); // legacy file
		await writeFile(path.join(dir, '2025-W53.json'), '{}'); // 2025 has 52 weeks
		await writeFile(path.join(dir, 'junk.txt'), 'junk');

		await expect(store.listWeeks()).resolves.toEqual(['2026-W29', '2026-W53', '2027-W01']);
	});

	it('returns an empty list when the directory does not exist', async () => {
		const missing = new PlanStore(path.join(dir, 'absent'));
		await expect(missing.listWeeks()).resolves.toEqual([]);
	});

	it('records a Willys snapshot on an existing plan', async () => {
		await store.save(createWeeklyPlan(LIST, '2026-W29'));
		const updated = await store.setWillysSnapshot('2026-W29', SNAPSHOT);
		expect(updated.willysCart).toEqual(SNAPSHOT);

		const loaded = await store.load('2026-W29');
		expect(loaded?.willysCart?.lines[0].productId).toBe('101233933_ST');
	});

	it('refuses to record a snapshot when the week has no plan', async () => {
		await expect(store.setWillysSnapshot('2026-W30', SNAPSHOT)).rejects.toThrow(/no plan/i);
	});

	it('leaves no tmp files behind after saving', async () => {
		await store.save(createWeeklyPlan(LIST, '2026-W29'));
		const files = await readdir(dir);
		expect(files).toEqual(['2026-W29.json']);
	});

	it('writes pretty-printed JSON with a trailing newline', async () => {
		const { filePath } = await store.save(createWeeklyPlan(LIST, '2026-W29'));
		const text = await readFile(filePath, 'utf8');
		expect(text.endsWith('}\n')).toBe(true);
		expect(text).toContain('\n  "weekId": "2026-W29",\n');
	});
});

describe('createWeeklyPlan', () => {
	it('rejects an invalid week id', () => {
		expect(() => createWeeklyPlan(LIST, '2026-w29')).toThrow(PlanStoreError);
	});

	it('wraps the shopping list without mutating it', () => {
		const plan = createWeeklyPlan(LIST, '2026-W29');
		expect(plan.version).toBe(1);
		expect(plan.servings).toBe(4);
		expect(plan.recipes).toEqual(LIST.recipes);
		expect(plan.shoppingList.items).toEqual(LIST.items);
		expect(plan.shoppingList.pantryStaples).toEqual(LIST.pantryStaples);
	});
});

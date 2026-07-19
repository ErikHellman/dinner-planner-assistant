import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsStore, SettingsStoreError } from './store';

let dir: string;
let store: SettingsStore;

function newStore(): SettingsStore {
	return new SettingsStore(path.join(dir, 'settings.json'), path.join(dir, 'settings.key'));
}

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'settings-store-'));
	store = newStore();
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('load', () => {
	it('returns defaults when no file exists', async () => {
		const settings = await store.load();
		expect(settings.foodPreferences).toBe('');
		expect(settings.llm).toEqual({ provider: null, model: null, apiKey: null });
		expect(settings.willys).toEqual({ username: null, password: null });
	});

	it('throws on invalid JSON', async () => {
		await writeFile(path.join(dir, 'settings.json'), '{ not json');
		await expect(store.load()).rejects.toThrow(SettingsStoreError);
	});

	it('throws on a document of the wrong shape', async () => {
		await writeFile(path.join(dir, 'settings.json'), JSON.stringify({ version: 2 }));
		await expect(store.load()).rejects.toThrow(SettingsStoreError);
	});

	it('reports a secret it cannot decrypt instead of failing', async () => {
		await store.save({ llm: { apiKey: 'sk-test' } });
		await rm(path.join(dir, 'settings.key'));
		const settings = await newStore().load();
		expect(settings.llm.apiKey).toBeNull();
		expect(settings.secretError).toMatch(/settings.key/);
	});
});

describe('save', () => {
	it('round-trips plain fields and secrets', async () => {
		await store.save({
			foodPreferences: 'gillar starkt',
			dislikesAllergies: 'nötter',
			extraInstructions: 'var kortfattad',
			llm: { provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'sk-test' },
			willys: { username: '199001011234', password: 'hemligt' }
		});
		const settings = await newStore().load();
		expect(settings.foodPreferences).toBe('gillar starkt');
		expect(settings.dislikesAllergies).toBe('nötter');
		expect(settings.extraInstructions).toBe('var kortfattad');
		expect(settings.llm).toEqual({
			provider: 'anthropic',
			model: 'claude-sonnet-5',
			apiKey: 'sk-test'
		});
		expect(settings.willys).toEqual({ username: '199001011234', password: 'hemligt' });
		expect(settings.updatedAt).not.toBe('');
	});

	it('never writes a secret in plaintext', async () => {
		await store.save({ llm: { apiKey: 'sk-test' }, willys: { password: 'hemligt' } });
		const raw = await readFile(path.join(dir, 'settings.json'), 'utf8');
		expect(raw).not.toContain('sk-test');
		expect(raw).not.toContain('hemligt');
	});

	it('keeps a secret when the field is absent and clears it on empty string', async () => {
		await store.save({ llm: { apiKey: 'sk-test' } });
		expect((await store.save({ foodPreferences: 'fisk' })).llm.apiKey).toBe('sk-test');
		expect((await store.save({ llm: { apiKey: '' } })).llm.apiKey).toBeNull();
	});

	it('stores blank plain values as null so .env can take over', async () => {
		await store.save({ llm: { provider: 'anthropic' }, willys: { username: '1234' } });
		const settings = await store.save({ llm: { provider: '  ' }, willys: { username: null } });
		expect(settings.llm.provider).toBeNull();
		expect(settings.willys.username).toBeNull();
	});

	it('leaves untouched fields alone', async () => {
		await store.save({ foodPreferences: 'gillar starkt', llm: { model: 'claude-sonnet-5' } });
		const settings = await store.save({ dislikesAllergies: 'skaldjur' });
		expect(settings.foodPreferences).toBe('gillar starkt');
		expect(settings.llm.model).toBe('claude-sonnet-5');
	});
});

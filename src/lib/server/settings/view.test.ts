import { describe, expect, it } from 'vitest';
import { defaultSettings, type ResolvedSettings } from './store';
import {
	changesWillysCredentials,
	parseSettingsPatch,
	SettingsRequestError,
	toSettingsView
} from './view';

function settings(patch: Partial<ResolvedSettings> = {}): ResolvedSettings {
	return { ...defaultSettings(), ...patch };
}

describe('toSettingsView', () => {
	it('never exposes a secret value', () => {
		const view = toSettingsView(
			settings({
				llm: { provider: null, model: null, apiKey: 'sk-hemlig' },
				willys: { username: '199001011234', password: 'hemligt' }
			}),
			{}
		);
		expect(JSON.stringify(view)).not.toContain('sk-hemlig');
		expect(JSON.stringify(view)).not.toContain('hemligt');
		expect(view.llm.apiKeySource).toBe('settings');
		expect(view.willys.passwordSource).toBe('settings');
	});

	it('reports the effective values and where they come from', () => {
		const view = toSettingsView(settings(), {
			PI_MODEL: 'claude-opus-4-8',
			ANTHROPIC_API_KEY: 'k'
		});
		expect(view.llm.model).toBeNull();
		expect(view.llm.effectiveModel).toBe('claude-opus-4-8');
		expect(view.llm.apiKeySource).toBe('env');
		expect(view.willys.passwordSource).toBe('none');
	});

	it('includes the core prompt for the read-only preview', () => {
		expect(toSettingsView(settings(), {}).corePrompt).toContain('Dinner Planner Assistant');
	});
});

describe('parseSettingsPatch', () => {
	it('keeps only the fields that are present', () => {
		expect(parseSettingsPatch({ foodPreferences: 'fisk' })).toEqual({ foodPreferences: 'fisk' });
	});

	it('passes an empty secret through as the "clear" signal', () => {
		expect(parseSettingsPatch({ llm: { apiKey: '' } })).toEqual({ llm: { apiKey: '' } });
	});

	it('rejects a non-object body and wrong types', () => {
		expect(() => parseSettingsPatch(null)).toThrow(SettingsRequestError);
		expect(() => parseSettingsPatch({ foodPreferences: 42 })).toThrow(SettingsRequestError);
		expect(() => parseSettingsPatch({ llm: 'anthropic' })).toThrow(SettingsRequestError);
		expect(() => parseSettingsPatch({ foodPreferences: 'x'.repeat(20_001) })).toThrow(
			SettingsRequestError
		);
	});
});

describe('changesWillysCredentials', () => {
	const before = settings({ willys: { username: 'u', password: 'p' } });

	it('is false when the patch leaves them alone or repeats them', () => {
		expect(changesWillysCredentials({ foodPreferences: 'fisk' }, before)).toBe(false);
		expect(changesWillysCredentials({ willys: { username: 'u', password: 'p' } }, before)).toBe(
			false
		);
	});

	it('is true when a credential changes or is cleared', () => {
		expect(changesWillysCredentials({ willys: { password: 'annat' } }, before)).toBe(true);
		expect(changesWillysCredentials({ willys: { username: '' } }, before)).toBe(true);
	});
});

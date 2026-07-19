import { SvelteSet } from 'svelte/reactivity';
import { apiFetch, messageFor } from '$lib/api/client';
import type { Verdict, VerdictEntry, VerdictsView } from './types';

/**
 * Client cache of the user's per-recipe verdicts, shared by the recipe grid and
 * the detail page. Loaded once per app lifetime and updated optimistically —
 * the buttons must feel instant, and a failed write is reverted with an error.
 */
export class VerdictStoreClient {
	verdicts = $state.raw<Record<string, VerdictEntry>>({});
	error = $state<string | null>(null);
	/** Recipe ids with a write in flight, so the buttons can disable themselves. */
	pending = new SvelteSet<number>();
	#loaded = false;
	#loading: Promise<void> | null = null;

	verdictFor(recipeId: number): Verdict | null {
		return this.verdicts[String(recipeId)]?.verdict ?? null;
	}

	isPending(recipeId: number): boolean {
		return this.pending.has(recipeId);
	}

	/** Concurrent callers (grid and detail page mount together) share one request. */
	async load(): Promise<void> {
		if (this.#loaded) return;
		this.#loading ??= this.#load();
		return this.#loading;
	}

	async #load(): Promise<void> {
		try {
			const { verdicts } = await apiFetch<VerdictsView>('/api/verdicts');
			this.verdicts = verdicts;
			this.#loaded = true;
		} catch (err) {
			this.error = messageFor(err);
		} finally {
			this.#loading = null;
		}
	}

	/** Set the verdict, or clear it when it is already the current one. */
	async toggle(recipeId: number, verdict: Verdict): Promise<void> {
		const next = this.verdictFor(recipeId) === verdict ? null : verdict;
		const previous = this.verdicts;

		this.verdicts =
			next === null
				? Object.fromEntries(
						Object.entries(this.verdicts).filter(([id]) => id !== String(recipeId))
					)
				: {
						...this.verdicts,
						// name/updatedAt are the server's to fill in; this entry only has
						// to survive until the response replaces it.
						[String(recipeId)]: { verdict: next, name: '', updatedAt: '' }
					};
		this.pending.add(recipeId);
		this.error = null;

		try {
			const { verdicts } = await apiFetch<VerdictsView>(`/api/verdicts/${recipeId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ verdict: next })
			});
			// Take only THIS recipe's entry from the response. Two overlapping
			// toggles return two full maps, and the slower response's map is
			// stale for the other recipe — replacing wholesale would undo it.
			const entry = verdicts[String(recipeId)];
			this.verdicts = entry
				? { ...this.verdicts, [String(recipeId)]: entry }
				: Object.fromEntries(
						Object.entries(this.verdicts).filter(([id]) => id !== String(recipeId))
					);
			this.#loaded = true;
		} catch (err) {
			// Undo only this recipe's optimistic change; another toggle may have
			// landed in the meantime.
			const restored = previous[String(recipeId)];
			this.verdicts = restored
				? { ...this.verdicts, [String(recipeId)]: restored }
				: Object.fromEntries(
						Object.entries(this.verdicts).filter(([id]) => id !== String(recipeId))
					);
			this.error = messageFor(err);
		} finally {
			this.pending.delete(recipeId);
		}
	}
}

/** Module singleton: verdicts survive tab navigation. */
export const verdictStore = new VerdictStoreClient();

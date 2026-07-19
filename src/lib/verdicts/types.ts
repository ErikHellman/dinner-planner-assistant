/**
 * What the user thought of a recipe after cooking it. Deliberately binary —
 * a scale invites analytics nobody asked for, while "more of this" / "never
 * again" is exactly what the agent needs to plan differently next week.
 * Swedish wording ("Favorit" / "Aldrig igen") belongs to the UI, not the data.
 */
export type Verdict = 'liked' | 'vetoed';

export interface VerdictEntry {
	verdict: Verdict;
	/** Denormalized so the system prompt can list names without loading 200
	 * recipe documents. */
	name: string;
	updatedAt: string;
}

/** data/verdicts.json — keyed by recipeId as a string (JSON object keys). */
export interface VerdictsDocument {
	version: 1;
	verdicts: Record<string, VerdictEntry>;
}

/** What GET /api/verdicts returns, and PUT /api/verdicts/[id] echoes back. */
export interface VerdictsView {
	verdicts: Record<string, VerdictEntry>;
}

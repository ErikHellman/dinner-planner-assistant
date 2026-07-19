import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { compareWeekIds, parseWeekId } from '../../plans/week';
import type { PlanStatus, WeeklyPlan, WillysCartSnapshot } from '../../plans/types';
import type { ShoppingList } from '../recipes/aggregate';
import { writeFileAtomic } from '../recipes/atomic-write';

export class PlanStoreError extends Error {}

const WEEK_FILE_PATTERN = /^(\d{4}-W\d{2})\.json$/;

export function defaultPlansDir(): string {
	return path.resolve(process.cwd(), 'data/plans');
}

function assertValidWeekId(weekId: string): void {
	if (!parseWeekId(weekId)) {
		throw new PlanStoreError(`Invalid week id "${weekId}" — expected "YYYY-Www", e.g. "2026-W29".`);
	}
}

/** Wrap an aggregated shopping list in a fresh plan document for the week. */
export function createWeeklyPlan(list: ShoppingList, weekId: string): WeeklyPlan {
	assertValidWeekId(weekId);
	return {
		version: 1,
		weekId,
		servings: list.servings,
		status: 'new',
		recipes: list.recipes,
		shoppingList: { items: list.items, pantryStaples: list.pantryStaples },
		willysCart: null,
		generatedAt: list.generatedAt,
		updatedAt: new Date().toISOString()
	};
}

const PLAN_STATUSES: PlanStatus[] = ['new', 'ordered'];

export function isPlanStatus(value: unknown): value is PlanStatus {
	return PLAN_STATUSES.includes(value as PlanStatus);
}

/** Legacy documents predate the field, so absent is allowed — but a status
 * that IS present and unrecognised means a corrupt file, not an old one. */
function isWeeklyPlanShape(value: unknown): value is Omit<WeeklyPlan, 'status'> & {
	status?: PlanStatus;
} {
	if (typeof value !== 'object' || value === null) return false;
	const plan = value as Partial<WeeklyPlan>;
	return (
		plan.version === 1 &&
		(plan.status === undefined || isPlanStatus(plan.status)) &&
		typeof plan.weekId === 'string' &&
		typeof plan.servings === 'number' &&
		Array.isArray(plan.recipes) &&
		typeof plan.shoppingList === 'object' &&
		plan.shoppingList !== null &&
		Array.isArray(plan.shoppingList.items) &&
		Array.isArray(plan.shoppingList.pantryStaples)
	);
}

/** Snapshots recorded before cart coverage existed have no `coverage` field.
 * Unlike a missing status, that absence is not a claim about what happened —
 * an empty list reads as "not recorded", and buildCoverageDiff reports it as
 * unknown rather than as nothing-matched. */
function normalizeSnapshot(snapshot: WillysCartSnapshot | null): WillysCartSnapshot | null {
	if (!snapshot) return null;
	return { ...snapshot, coverage: snapshot.coverage ?? [] };
}

/** Week-keyed plan documents under data/plans/, one JSON file per ISO week. */
export class PlanStore {
	constructor(private readonly dir: string = defaultPlansDir()) {}

	filePath(weekId: string): string {
		return path.join(this.dir, `${weekId}.json`);
	}

	/** Week ids that have a plan file, sorted chronologically. Non-plan files
	 * (including the legacy shopping-list.json) are ignored. */
	async listWeeks(): Promise<string[]> {
		let files: string[];
		try {
			files = await readdir(this.dir);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw err;
		}
		return files
			.map((file) => WEEK_FILE_PATTERN.exec(file)?.[1])
			.filter((weekId): weekId is string => weekId !== undefined && parseWeekId(weekId) !== null)
			.sort(compareWeekIds);
	}

	/** The plan for a week, or null when none has been saved. */
	async load(weekId: string): Promise<WeeklyPlan | null> {
		assertValidWeekId(weekId);
		const file = this.filePath(weekId);
		let text: string;
		try {
			text = await readFile(file, 'utf8');
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
			throw err;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			throw new PlanStoreError(`Plan file ${file} is corrupt: not valid JSON.`);
		}
		if (!isWeeklyPlanShape(parsed) || parsed.weekId !== weekId) {
			throw new PlanStoreError(`Plan file ${file} is corrupt: not a week-${weekId} plan document.`);
		}
		// Every plan written from now on carries a status, so a missing one can
		// only be a document from before the field existed — and those weeks
		// were already ordered.
		return {
			...parsed,
			status: parsed.status ?? 'ordered',
			willysCart: normalizeSnapshot(parsed.willysCart)
		};
	}

	/** Persist the plan (atomic write), stamping updatedAt. */
	async save(plan: WeeklyPlan): Promise<{ plan: WeeklyPlan; filePath: string }> {
		assertValidWeekId(plan.weekId);
		if (!Number.isInteger(plan.servings) || plan.servings < 1) {
			throw new PlanStoreError(`Invalid servings ${plan.servings} — must be a positive integer.`);
		}
		const stamped: WeeklyPlan = { ...plan, updatedAt: new Date().toISOString() };
		const file = this.filePath(plan.weekId);
		await mkdir(this.dir, { recursive: true });
		await writeFileAtomic(file, JSON.stringify(stamped, null, 2) + '\n');
		return { plan: stamped, filePath: file };
	}

	/** Delete a week's plan document. True when a plan existed, false when the
	 * week had none (already-gone is not an error). The Willys cart itself is
	 * untouched — plans only reference it. */
	async delete(weekId: string): Promise<boolean> {
		assertValidWeekId(weekId);
		try {
			await unlink(this.filePath(weekId));
			return true;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
			throw err;
		}
	}

	/** Set an existing week's lifecycle status (new ⇄ ordered). */
	async setStatus(weekId: string, status: PlanStatus): Promise<WeeklyPlan> {
		const plan = await this.load(weekId);
		if (!plan) {
			throw new PlanStoreError(`No plan for week ${weekId} — nothing to mark.`);
		}
		const { plan: saved } = await this.save({ ...plan, status });
		return saved;
	}

	/** Attach a Willys cart snapshot to an existing week's plan. */
	async setWillysSnapshot(weekId: string, snapshot: WillysCartSnapshot): Promise<WeeklyPlan> {
		const plan = await this.load(weekId);
		if (!plan) {
			throw new PlanStoreError(`No plan for week ${weekId} — aggregate the week's recipes first.`);
		}
		const { plan: saved } = await this.save({ ...plan, willysCart: snapshot });
		return saved;
	}
}

/**
 * Pure geometry/scale helpers for the horizontal zoomable timeline
 * (`HorizontalTimeline.svelte`). No Svelte/DOM APIs — safe to unit test in
 * isolation.
 */

import { compareSortKeys, diffDays, firstDay, fromSortKey, lastDay } from '../dates/fuzzy';
import { FRENCH_MONTHS } from '../dates/fuzzy';
import type { TimelineItem } from './types';

export type Zoom = 'year' | 'month';

/** Pixels-per-day at the fully zoomed-out "year" level. */
export const MIN_PX_PER_DAY = 1;
/** Pixels-per-day at the fully zoomed-in "month" level. */
export const MAX_PX_PER_DAY = 8;

/** Clamps a candidate pixels-per-day value to the [year, month] zoom range. */
export function clampPxPerDay(pxPerDay: number): number {
	return Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, pxPerDay));
}

/** Tick granularity to use for the ruler at a given zoom level. */
export function granularityFor(pxPerDay: number): Zoom {
	return pxPerDay >= (MIN_PX_PER_DAY + MAX_PX_PER_DAY) / 2 ? 'month' : 'year';
}

export interface Tick {
	/** ISO day (`YYYY-MM-DD`) of the first day of the tick's period. */
	day: string;
	/** French display label: the year ("2018") or "mois année" ("mars 2018"). */
	label: string;
}

function pad4(n: number): string {
	return String(n).padStart(4, '0');
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/**
 * Ticks are only emitted for periods (year or month) that overlap
 * `[minDay, maxDay]`, so callers get exactly the labels visible on the
 * ruler for that span, not the whole calendar years it touches.
 */
function computeTicks(minDay: string, maxDay: string, zoom: Zoom): Tick[] {
	const minYear = Number(minDay.slice(0, 4));
	const maxYear = Number(maxDay.slice(0, 4));
	const result: Tick[] = [];

	if (zoom === 'year') {
		for (let year = minYear; year <= maxYear; year++) {
			const day = `${pad4(year)}-01-01`;
			const periodEnd = `${pad4(year)}-12-31`;
			if (day > maxDay || periodEnd < minDay) continue;
			result.push({ day, label: String(year) });
		}
		return result;
	}

	for (let year = minYear; year <= maxYear; year++) {
		for (let month = 1; month <= 12; month++) {
			const day = `${pad4(year)}-${pad2(month)}-01`;
			const periodEnd = lastDay({ year, month, precision: 'month' });
			if (day > maxDay || periodEnd < minDay) continue;
			result.push({ day, label: `${FRENCH_MONTHS[month - 1]} ${year}` });
		}
	}
	return result;
}

export interface Scale {
	/** Horizontal pixel offset of an ISO day, relative to `minDay`. Monotonic non-decreasing. */
	x(day: string): number;
	/** Ruler ticks (one per year or per month) spanning `[minDay, maxDay]`, French labels. */
	ticks(zoom: Zoom): Tick[];
	pxPerDay: number;
	minDay: string;
	maxDay: string;
	/** Total scrollable width in pixels, at least 1px. */
	totalWidth: number;
}

/**
 * Builds a horizontal day→pixel scale over `[minDay, maxDay]`. `pxPerDay` is
 * clamped to the continuous [year..month] zoom range (see `clampPxPerDay`).
 */
export function makeScale(minDay: string, maxDay: string, pxPerDay: number): Scale {
	const clamped = clampPxPerDay(pxPerDay);

	function x(day: string): number {
		return diffDays(minDay, day) * clamped;
	}

	return {
		x,
		ticks: (zoom: Zoom) => computeTicks(minDay, maxDay, zoom),
		pxPerDay: clamped,
		minDay,
		maxDay,
		totalWidth: Math.max(1, diffDays(minDay, maxDay) * clamped)
	};
}

/**
 * The `[fromDay, toDay]` span a timeline item occupies on the frise: entries
 * with an explicit end use `[firstDay(start), lastDay(end)]`; open-ended
 * (`ongoing`) items extend to `today`; everything else (a single fuzzy date,
 * incl. `occurrence` items) spans its own precision: a month-precision
 * souvenir covers its whole month, a day-precision one covers a single day.
 */
export function itemRange(item: TimelineItem, today: string): [string, string] {
	const start = firstDay(fromSortKey(item.startSort));
	if (item.endSort) {
		return [start, lastDay(fromSortKey(item.endSort))];
	}
	if (item.ongoing) {
		return [start, today];
	}
	return [start, lastDay(fromSortKey(item.startSort))];
}

/** Max number of side-by-side phase bands; a 4th+ overlapping phase shares the last lane. */
export const MAX_PHASE_LANES = 3;

export interface LanedPhase {
	item: TimelineItem;
	lane: number;
}

/**
 * Greedy non-overlapping lane assignment for the phase-band track, sorted by
 * start, over each phase's `itemRange` (EC-1: ongoing phases extend to
 * `today`). Shared by both timeline views — `layout.ts`'s `assignPhaseLanes`
 * (T31) wraps this to add the resolved day range the vertical view needs.
 */
export function phaseLanes(
	items: TimelineItem[],
	today: string,
	maxLanes = MAX_PHASE_LANES
): LanedPhase[] {
	const sorted = [...items].sort((a, b) => compareSortKeys(a.startSort, b.startSort));
	const laneEndDay: string[] = [];
	const result: LanedPhase[] = [];

	for (const item of sorted) {
		const [from, to] = itemRange(item, today);
		let lane = laneEndDay.findIndex((end) => compareSortKeys(end, from) < 0);
		if (lane === -1) {
			if (laneEndDay.length < maxLanes) {
				lane = laneEndDay.length;
				laneEndDay.push(to);
			} else {
				lane = maxLanes - 1;
				if (compareSortKeys(to, laneEndDay[lane]) > 0) laneEndDay[lane] = to;
			}
		} else {
			laneEndDay[lane] = to;
		}
		result.push({ item, lane });
	}

	return result;
}

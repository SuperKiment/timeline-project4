/**
 * Pure layout helpers for `VerticalTimeline.svelte` (T31). Grouping, lane
 * assignment, date formatting and link targets all live here so they stay
 * unit-testable without a component test harness — the component itself
 * stays a thin renderer of this module's output.
 *
 * Assumes `items` is already chronologically sorted past→present, as
 * returned by `getTimeline` (per Conventions/EC-3).
 */

import { resolve } from '$app/paths';
import { compareSortKeys, formatPeriodFr, fromSortKey, isoDay, daysInMonth } from '../dates/fuzzy';
import { itemRange, phaseLanes } from './scale';
import type { TimelineItem } from './types';

/** Items placed under a single calendar month sub-section. */
export interface MonthGroup {
	/** `YYYY-MM`, unique within a `YearGroup`. */
	key: string;
	year: number;
	month: number;
	items: TimelineItem[];
}

/**
 * All items for a given year: `yearItems` are precision-`'year'` items shown
 * directly at the year head; `months` are the month-precision/day-precision
 * sub-sections, in the order their items first appear.
 */
export interface YearGroup {
	/** String year, e.g. `"2020"`. */
	key: string;
	/** Sticky separator anchor id, target of the year-jump `<select>`. */
	id: string;
	year: number;
	yearItems: TimelineItem[];
	months: MonthGroup[];
}

/**
 * Buckets items by year, and within a year by month — precision-`'year'`
 * items go to the year head (`yearItems`), precision-`'month'`/`'day'` items
 * go to their month sub-section. Preserves input order (stable), so callers
 * must pass chronologically sorted items to get chronological groups.
 */
export function groupByYearMonth(items: TimelineItem[]): YearGroup[] {
	const years = new Map<number, YearGroup>();
	const order: number[] = [];

	for (const item of items) {
		const fd = fromSortKey(item.startSort);
		let group = years.get(fd.year);
		if (!group) {
			group = {
				key: String(fd.year),
				id: `y-${fd.year}`,
				year: fd.year,
				yearItems: [],
				months: []
			};
			years.set(fd.year, group);
			order.push(fd.year);
		}

		if (item.startPrecision === 'year') {
			group.yearItems.push(item);
			continue;
		}

		const month = fd.month as number;
		let monthGroup = group.months.find((m) => m.month === month);
		if (!monthGroup) {
			monthGroup = { key: `${fd.year}-${month}`, year: fd.year, month, items: [] };
			group.months.push(monthGroup);
		}
		monthGroup.items.push(item);
	}

	return order.map((year) => years.get(year)!);
}

/** A `phase` item assigned to a lane, with its resolved day range. */
export interface PhaseLane {
	item: TimelineItem;
	lane: number;
	fromDay: string;
	toDay: string;
}

/**
 * Lane assignment for `phase` items: delegates to `phaseLanes()` in
 * `scale.ts` (shared with the horizontal view, so both views agree) and adds
 * each phase's resolved `itemRange` — open-ended phases (`ongoing`, EC-1)
 * extend to `today`.
 */
export function assignPhaseLanes(phases: TimelineItem[], today: string): PhaseLane[] {
	return phaseLanes(phases, today).map(({ item, lane }) => {
		const [fromDay, toDay] = itemRange(item, today);
		return { item, lane, fromDay, toDay };
	});
}

/** Day range spanned by a section: a whole year (`month === null`) or a single month. */
export function sectionRange(
	year: number,
	month: number | null
): { fromDay: string; toDay: string } {
	if (month === null) {
		return { fromDay: isoDay(year, 1, 1), toDay: isoDay(year, 12, 31) };
	}
	return { fromDay: isoDay(year, month, 1), toDay: isoDay(year, month, daysInMonth(year, month)) };
}

/** A flat, render-ready timeline section (year head or month sub-section). */
export interface RenderSection {
	kind: 'year' | 'month';
	/** Sticky separator anchor id; only `'y-YYYY'` (year sections) is a jump target. */
	id: string;
	year: number;
	month: number | null;
	/** Non-`histoire` items of the section, left column. */
	mainItems: TimelineItem[];
	/** `histoire` items of the section, grey right column. */
	histoireItems: TimelineItem[];
	fromDay: string;
	toDay: string;
}

function splitHistoire(items: TimelineItem[]): {
	mainItems: TimelineItem[];
	histoireItems: TimelineItem[];
} {
	const mainItems: TimelineItem[] = [];
	const histoireItems: TimelineItem[] = [];
	for (const item of items) {
		(item.type === 'histoire' ? histoireItems : mainItems).push(item);
	}
	return { mainItems, histoireItems };
}

/** Flattens `groupByYearMonth` output into the ordered list of sections a component renders. */
export function buildSections(groups: YearGroup[]): RenderSection[] {
	const sections: RenderSection[] = [];

	for (const group of groups) {
		const { fromDay, toDay } = sectionRange(group.year, null);
		sections.push({
			kind: 'year',
			id: group.id,
			year: group.year,
			month: null,
			fromDay,
			toDay,
			...splitHistoire(group.yearItems)
		});

		for (const monthGroup of group.months) {
			const range = sectionRange(monthGroup.year, monthGroup.month);
			sections.push({
				kind: 'month',
				id: `${group.id}-m-${String(monthGroup.month).padStart(2, '0')}`,
				year: monthGroup.year,
				month: monthGroup.month,
				fromDay: range.fromDay,
				toDay: range.toDay,
				...splitHistoire(monthGroup.items)
			});
		}
	}

	return sections;
}

/**
 * Index in `sections` before which the `#today` marker should be inserted
 * (`sections.length` — i.e. after everything — in the common case where no
 * item is dated after `today`).
 */
export function todayMarkerIndex(sections: RenderSection[], today: string): number {
	const idx = sections.findIndex((s) => compareSortKeys(s.fromDay, today) > 0);
	return idx === -1 ? sections.length : idx;
}

/** Phase lanes (from `assignPhaseLanes`) overlapping `[fromDay, toDay]`, ascending. */
export function activeLanes(phaseLanes: PhaseLane[], fromDay: string, toDay: string): number[] {
	const active = new Set<number>();
	for (const pl of phaseLanes) {
		if (compareSortKeys(pl.toDay, fromDay) >= 0 && compareSortKeys(pl.fromDay, toDay) <= 0) {
			active.add(pl.lane);
		}
	}
	return [...active].sort((a, b) => a - b);
}

/** "12 mars 2018" / "mars 2018 – en cours" / "2018 – 2020" style display for a card. */
export function formatItemDateRange(item: TimelineItem): string {
	const end = item.ongoing || !item.endSort ? null : fromSortKey(item.endSort);
	return formatPeriodFr(fromSortKey(item.startSort), end, item.ongoing);
}

/** Resolved detail page URL for a timeline item: entry page, or occurrence page for `occurrence` items. */
export function itemHref(item: TimelineItem): string {
	if (
		item.kind === 'occurrence' &&
		item.seriesId !== undefined &&
		item.occurrenceDate !== undefined
	) {
		return resolve('/entries/[id]/occurrences/[date]', {
			id: String(item.seriesId),
			date: item.occurrenceDate
		});
	}
	return resolve('/entries/[id]', { id: String(item.id) });
}

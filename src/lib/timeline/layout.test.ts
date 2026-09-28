import { describe, expect, it } from 'vitest';
import {
	activeLanes,
	assignPhaseLanes,
	buildSections,
	formatItemDateRange,
	groupByYearMonth,
	itemHref,
	sectionRange,
	todayMarkerIndex
} from './layout';
import type { TimelineItem } from './types';

let nextId = 1;

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
	const id = nextId++;
	return {
		kind: 'entry',
		key: `e:${id}`,
		id,
		type: 'souvenir',
		title: `Item ${id}`,
		startSort: '2020-00-00',
		startPrecision: 'year',
		endSort: null,
		endPrecision: null,
		ongoing: false,
		thumbUrl: null,
		location: null,
		...overrides
	};
}

describe('groupByYearMonth', () => {
	it('buckets year-precision items at the year head and month/day items under their month, preserving order', () => {
		const items = [
			item({ startSort: '2020-00-00', startPrecision: 'year', title: 'Year 2020' }),
			item({ startSort: '2020-03-00', startPrecision: 'month', title: 'March 2020' }),
			item({ startSort: '2020-03-15', startPrecision: 'day', title: 'Mid March 2020' }),
			item({ startSort: '2020-07-01', startPrecision: 'day', title: 'July 2020' }),
			item({ startSort: '2021-00-00', startPrecision: 'year', title: 'Year 2021' })
		];

		const groups = groupByYearMonth(items);

		expect(groups.map((g) => g.year)).toEqual([2020, 2021]);
		expect(groups[0].id).toBe('y-2020');
		expect(groups[0].yearItems.map((i) => i.title)).toEqual(['Year 2020']);
		expect(groups[0].months.map((m) => m.month)).toEqual([3, 7]);
		expect(groups[0].months[0].items.map((i) => i.title)).toEqual(['March 2020', 'Mid March 2020']);
		expect(groups[1].yearItems.map((i) => i.title)).toEqual(['Year 2021']);
		expect(groups[1].months).toEqual([]);
	});

	it('returns [] for no items', () => {
		expect(groupByYearMonth([])).toEqual([]);
	});
});

describe('assignPhaseLanes', () => {
	it('assigns non-overlapping phases to lane 0', () => {
		const phases = [
			item({
				type: 'phase',
				startSort: '2018-01-01',
				startPrecision: 'day',
				endSort: '2018-06-01',
				endPrecision: 'day'
			}),
			item({
				type: 'phase',
				startSort: '2019-01-01',
				startPrecision: 'day',
				endSort: '2019-06-01',
				endPrecision: 'day'
			})
		];

		const lanes = assignPhaseLanes(phases, '2026-01-01');

		expect(lanes.map((l) => l.lane)).toEqual([0, 0]);
	});

	it('gives overlapping phases separate lanes up to MAX_PHASE_LANES, then shares the last lane', () => {
		const phases = [
			item({
				id: 1,
				type: 'phase',
				startSort: '2020-01-01',
				startPrecision: 'day',
				endSort: '2020-12-31',
				endPrecision: 'day'
			}),
			item({
				id: 2,
				type: 'phase',
				startSort: '2020-02-01',
				startPrecision: 'day',
				endSort: '2020-12-31',
				endPrecision: 'day'
			}),
			item({
				id: 3,
				type: 'phase',
				startSort: '2020-03-01',
				startPrecision: 'day',
				endSort: '2020-12-31',
				endPrecision: 'day'
			}),
			item({
				id: 4,
				type: 'phase',
				startSort: '2020-04-01',
				startPrecision: 'day',
				endSort: '2020-12-31',
				endPrecision: 'day'
			})
		];

		const lanes = assignPhaseLanes(phases, '2026-01-01');

		expect(lanes.map((l) => l.lane)).toEqual([0, 1, 2, 2]);
	});

	it('extends an ongoing phase to today (EC-1)', () => {
		const phases = [
			item({
				type: 'phase',
				startSort: '2020-01-01',
				startPrecision: 'day',
				endSort: null,
				endPrecision: null,
				ongoing: true
			})
		];

		const lanes = assignPhaseLanes(phases, '2026-09-24');

		expect(lanes[0].toDay).toBe('2026-09-24');
	});

	it('sorts phases by start date before assigning lanes, regardless of input order', () => {
		const phases = [
			item({
				id: 2,
				type: 'phase',
				startSort: '2021-01-01',
				startPrecision: 'day',
				endSort: '2021-06-01',
				endPrecision: 'day'
			}),
			item({
				id: 1,
				type: 'phase',
				startSort: '2020-01-01',
				startPrecision: 'day',
				endSort: '2020-06-01',
				endPrecision: 'day'
			})
		];

		const lanes = assignPhaseLanes(phases, '2026-01-01');

		expect(lanes.map((l) => l.item.id)).toEqual([1, 2]);
		expect(lanes.map((l) => l.lane)).toEqual([0, 0]);
	});

	it('gives a closed phase without end its whole start period, like the horizontal view', () => {
		const phases = [item({ type: 'phase', startSort: '2021-02-00', startPrecision: 'month' })];

		const [lane] = assignPhaseLanes(phases, '2026-01-01');

		expect(lane.fromDay).toBe('2021-02-01');
		expect(lane.toDay).toBe('2021-02-28');
	});
});

describe('sectionRange', () => {
	it('spans the whole year when month is null', () => {
		expect(sectionRange(2020, null)).toEqual({ fromDay: '2020-01-01', toDay: '2020-12-31' });
	});

	it('spans the calendar month, leap year aware', () => {
		expect(sectionRange(2024, 2)).toEqual({ fromDay: '2024-02-01', toDay: '2024-02-29' });
	});
});

describe('buildSections + todayMarkerIndex', () => {
	it('flattens groups into year/month sections and splits histoire into its own list', () => {
		const items = [
			item({
				startSort: '2020-03-00',
				startPrecision: 'month',
				type: 'souvenir',
				title: 'Souvenir'
			}),
			item({ startSort: '2020-03-05', startPrecision: 'day', type: 'histoire', title: 'Histoire' })
		];

		const sections = buildSections(groupByYearMonth(items));

		expect(sections.map((s) => s.id)).toEqual(['y-2020', 'y-2020-m-03']);
		expect(sections[1].mainItems.map((i) => i.title)).toEqual(['Souvenir']);
		expect(sections[1].histoireItems.map((i) => i.title)).toEqual(['Histoire']);
	});

	it('places the marker after all sections that already started on/before today (common case)', () => {
		const items = [item({ startSort: '2020-03-00', startPrecision: 'month' })];
		const sections = buildSections(groupByYearMonth(items));

		expect(todayMarkerIndex(sections, '2026-09-24')).toBe(sections.length);
	});

	it('places the marker before a section that starts after today', () => {
		const items = [
			item({ startSort: '2020-03-00', startPrecision: 'month' }),
			item({ startSort: '2099-01-00', startPrecision: 'month' })
		];
		const sections = buildSections(groupByYearMonth(items));

		expect(todayMarkerIndex(sections, '2026-09-24')).toBe(2);
	});
});

describe('activeLanes', () => {
	it('returns lanes overlapping the given range, ascending', () => {
		const phases = [
			item({
				id: 1,
				type: 'phase',
				startSort: '2020-01-01',
				startPrecision: 'day',
				endSort: '2020-12-31',
				endPrecision: 'day'
			}),
			item({
				id: 2,
				type: 'phase',
				startSort: '2020-06-01',
				startPrecision: 'day',
				endSort: '2020-12-31',
				endPrecision: 'day'
			})
		];
		const lanes = assignPhaseLanes(phases, '2026-01-01');

		expect(activeLanes(lanes, '2020-02-01', '2020-02-28')).toEqual([0]);
		expect(activeLanes(lanes, '2020-07-01', '2020-07-31')).toEqual([0, 1]);
		expect(activeLanes(lanes, '2021-01-01', '2021-01-31')).toEqual([]);
	});
});

describe('formatItemDateRange', () => {
	it('formats a plain day-precision date', () => {
		expect(formatItemDateRange(item({ startSort: '2020-03-15', startPrecision: 'day' }))).toBe(
			'15 mars 2020'
		);
	});

	it('formats a closed range', () => {
		expect(
			formatItemDateRange(
				item({
					type: 'phase',
					startSort: '2018-00-00',
					startPrecision: 'year',
					endSort: '2020-00-00',
					endPrecision: 'year'
				})
			)
		).toBe('2018 – 2020');
	});

	it('formats an ongoing item with "en cours"', () => {
		expect(
			formatItemDateRange(
				item({ type: 'phase', startSort: '2022-00-00', startPrecision: 'year', ongoing: true })
			)
		).toBe('2022 – en cours');
	});
});

describe('itemHref', () => {
	it('links entries to their detail page', () => {
		expect(itemHref(item({ kind: 'entry', id: 42 }))).toBe('/entries/42');
	});

	it('links occurrences to their series occurrence page', () => {
		expect(
			itemHref(item({ kind: 'occurrence', id: 7, seriesId: 7, occurrenceDate: '2021-05-01' }))
		).toBe('/entries/7/occurrences/2021-05-01');
	});
});

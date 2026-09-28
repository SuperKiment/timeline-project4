import { describe, expect, it } from 'vitest';
import {
	MAX_PX_PER_DAY,
	MIN_PX_PER_DAY,
	clampPxPerDay,
	granularityFor,
	itemRange,
	makeScale,
	phaseLanes
} from './scale';
import type { TimelineItem } from './types';

function item(overrides: Partial<TimelineItem>): TimelineItem {
	return {
		kind: 'entry',
		key: overrides.key ?? `e:${overrides.id ?? 1}`,
		id: overrides.id ?? 1,
		type: overrides.type ?? 'souvenir',
		title: overrides.title ?? 'Titre',
		startSort: overrides.startSort ?? '2020-01-01',
		startPrecision: overrides.startPrecision ?? 'day',
		endSort: overrides.endSort ?? null,
		endPrecision: overrides.endPrecision ?? null,
		ongoing: overrides.ongoing ?? false,
		thumbUrl: overrides.thumbUrl ?? null,
		location: overrides.location ?? null,
		...overrides
	};
}

describe('clampPxPerDay', () => {
	it('clamps below the year level up to MIN_PX_PER_DAY', () => {
		expect(clampPxPerDay(0)).toBe(MIN_PX_PER_DAY);
		expect(clampPxPerDay(-5)).toBe(MIN_PX_PER_DAY);
	});

	it('clamps above the month level down to MAX_PX_PER_DAY', () => {
		expect(clampPxPerDay(100)).toBe(MAX_PX_PER_DAY);
	});

	it('keeps values already inside the range', () => {
		expect(clampPxPerDay(4)).toBe(4);
	});
});

describe('granularityFor', () => {
	it('picks year granularity when zoomed out', () => {
		expect(granularityFor(MIN_PX_PER_DAY)).toBe('year');
	});

	it('picks month granularity when zoomed in', () => {
		expect(granularityFor(MAX_PX_PER_DAY)).toBe('month');
	});
});

describe('makeScale x()', () => {
	it('is monotonic non-decreasing across an ordered sequence of days', () => {
		const scale = makeScale('2020-01-01', '2022-12-31', 2);
		const days = [
			'2020-01-01',
			'2020-01-15',
			'2020-06-01',
			'2021-01-01',
			'2021-12-31',
			'2022-12-31'
		];
		for (let i = 1; i < days.length; i++) {
			expect(scale.x(days[i])).toBeGreaterThanOrEqual(scale.x(days[i - 1]));
		}
	});

	it('places minDay at 0 and scales by the clamped pxPerDay', () => {
		const scale = makeScale('2020-01-01', '2020-01-11', 3);
		expect(scale.x('2020-01-01')).toBe(0);
		expect(scale.x('2020-01-11')).toBe(30); // 10 days * 3px
	});

	it('clamps an out-of-range pxPerDay before computing totalWidth', () => {
		const scale = makeScale('2020-01-01', '2020-01-11', 1000);
		expect(scale.pxPerDay).toBe(MAX_PX_PER_DAY);
		expect(scale.totalWidth).toBe(10 * MAX_PX_PER_DAY);
	});
});

describe('scale.ticks', () => {
	it('produces one tick per year, labelled with the plain year', () => {
		const scale = makeScale('2020-06-01', '2022-03-01', 1);
		const ticks = scale.ticks('year');
		expect(ticks.map((t) => t.label)).toEqual(['2020', '2021', '2022']);
		expect(ticks[0].day).toBe('2020-01-01');
	});

	it('produces one tick per month with French month names', () => {
		const scale = makeScale('2020-01-01', '2020-03-31', 8);
		const ticks = scale.ticks('month');
		expect(ticks.map((t) => t.label)).toEqual(['janvier 2020', 'février 2020', 'mars 2020']);
		expect(ticks.map((t) => t.day)).toEqual(['2020-01-01', '2020-02-01', '2020-03-01']);
	});
});

describe('itemRange', () => {
	it('spans the whole month for a month-precision item with no end', () => {
		const [from, to] = itemRange(
			item({ startSort: '2020-03-00', startPrecision: 'month' }),
			'2020-06-01'
		);
		expect(from).toBe('2020-03-01');
		expect(to).toBe('2020-03-31');
	});

	it('is a single day for a day-precision item with no end', () => {
		const [from, to] = itemRange(item({ startSort: '2020-03-05' }), '2020-06-01');
		expect(from).toBe('2020-03-05');
		expect(to).toBe('2020-03-05');
	});

	it('uses lastDay(end) when the item has an explicit end', () => {
		const [from, to] = itemRange(
			item({
				type: 'phase',
				startSort: '2020-01-01',
				endSort: '2020-02-00',
				endPrecision: 'month'
			}),
			'2020-06-01'
		);
		expect(from).toBe('2020-01-01');
		expect(to).toBe('2020-02-29'); // leap year
	});

	it('extends an ongoing item to today', () => {
		const [from, to] = itemRange(
			item({ type: 'phase', startSort: '2020-01-01', ongoing: true }),
			'2020-06-15'
		);
		expect(from).toBe('2020-01-01');
		expect(to).toBe('2020-06-15');
	});
});

describe('phaseLanes', () => {
	it('keeps non-overlapping phases on the same lane', () => {
		const a = item({ id: 1, type: 'phase', startSort: '2020-01-01', endSort: '2020-01-31' });
		const b = item({ id: 2, type: 'phase', startSort: '2020-02-01', endSort: '2020-02-28' });
		const laned = phaseLanes([a, b], '2020-12-31');
		expect(laned.find((l) => l.item.id === 1)?.lane).toBe(0);
		expect(laned.find((l) => l.item.id === 2)?.lane).toBe(0);
	});

	it('assigns different lanes to overlapping phases', () => {
		const a = item({ id: 1, type: 'phase', startSort: '2020-01-01', endSort: '2020-03-31' });
		const b = item({ id: 2, type: 'phase', startSort: '2020-02-01', endSort: '2020-04-30' });
		const laned = phaseLanes([a, b], '2020-12-31');
		const laneA = laned.find((l) => l.item.id === 1)?.lane;
		const laneB = laned.find((l) => l.item.id === 2)?.lane;
		expect(laneA).not.toBe(laneB);
	});

	it('makes extra overlapping phases beyond maxLanes share the last lane', () => {
		const phases = [1, 2, 3, 4].map((id) =>
			item({ id, type: 'phase', startSort: '2020-01-01', endSort: '2020-12-31' })
		);
		const laned = phaseLanes(phases, '2020-12-31', 3);
		const lanes = laned.map((l) => l.lane);
		expect(Math.max(...lanes)).toBe(2);
		expect(lanes.filter((l) => l === 2).length).toBe(2); // 3rd and 4th share lane 2
	});
});

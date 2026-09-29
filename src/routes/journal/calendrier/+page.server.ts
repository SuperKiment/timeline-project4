import { requireUser } from '$lib/server/auth/session';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { listCalendar } from '$lib/server/journal/service';
import { todayIn } from '$lib/server/time';
import {
	buildMonthGrid,
	formatMonthParam,
	monthLabel,
	monthOfDay,
	monthRange,
	parseMonthParam,
	shiftMonth
} from '$lib/journal/calendar';
import { FRENCH_MONTHS } from '$lib/dates/fuzzy';
import type { PageServerLoad } from './$types';

export interface CalendarCell {
	day: string;
	dayNumber: number;
	isToday: boolean;
	authors: { userId: number; displayName: string; initial: string }[];
}

/**
 * Month is read from `?mois=YYYY-MM`. A missing OR invalid value falls back
 * to the current month in the configured timezone (no error page).
 */
export const load: PageServerLoad = ({ locals, url }) => {
	requireUser(locals);

	const today = todayIn(getConfig().tz);
	const ym = parseMonthParam(url.searchParams.get('mois')) ?? monthOfDay(today);
	const { from, to } = monthRange(ym);

	const authorsByDay = new Map(listCalendar(getDb(), from, to).map((d) => [d.day, d.authors]));

	const weeks = buildMonthGrid(ym).map((week) =>
		week.map((day): CalendarCell | null => {
			if (!day) return null;
			const authors = (authorsByDay.get(day) ?? []).map((a) => ({
				...a,
				initial: (Array.from(a.displayName.trim())[0] ?? '?').toUpperCase()
			}));
			return { day, dayNumber: Number(day.slice(8, 10)), isToday: day === today, authors };
		})
	);

	return {
		month: formatMonthParam(ym),
		label: monthLabel(ym),
		prevMonth: formatMonthParam(shiftMonth(ym, -1)),
		nextMonth: formatMonthParam(shiftMonth(ym, 1)),
		monthName: FRENCH_MONTHS[ym.month - 1],
		weeks
	};
};

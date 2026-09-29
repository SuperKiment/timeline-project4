import { requireUser } from '$lib/server/auth/session';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { onThisDay } from '$lib/server/onthisday/service';
import { todayIn } from '$lib/server/time';
import { formatDayMonthFr } from '$lib/dates/fuzzy';
import { yearsAgoLabel } from '$lib/dates/format';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireUser(locals);

	const today = todayIn(getConfig().tz);
	const currentYear = Number(today.slice(0, 4));
	const years = onThisDay(getDb(), today).map(({ year, items }) => ({
		year,
		label: `${yearsAgoLabel(currentYear - year)} — ${year}`,
		items
	}));

	return { dayLabel: formatDayMonthFr(today), years };
};

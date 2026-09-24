import { sql } from 'drizzle-orm';
import { toSortKey, type FuzzyDate } from '../../dates/fuzzy';
import type { Db } from '../db/index';
import { entries } from '../db/schema';

/**
 * One landmark event of the built-in "histoire" (world events) timeline.
 * `seedKey` is stable across releases so `seedHistoire` stays idempotent even
 * if titles/descriptions are later tweaked.
 */
export interface HistoireSeedItem {
	seedKey: string;
	title: string;
	description: string;
	start: FuzzyDate;
	end?: FuzzyDate | null;
}

function day(year: number, month: number, dayOfMonth: number): FuzzyDate {
	return { year, month, day: dayOfMonth, precision: 'day' };
}

function yearOnly(year: number): FuzzyDate {
	return { year, precision: 'year' };
}

/**
 * 18 stable, French-described world events used to pre-populate the
 * "histoire" timeline (FR-8). Dates are day-precision unless noted.
 */
export const HISTOIRE_ITEMS: HistoireSeedItem[] = [
	{
		seedKey: 'attentats-11-septembre-2001',
		title: 'Attentats du 11 septembre 2001',
		description:
			"Quatre avions de ligne détournés s'écrasent aux États-Unis, dont deux sur les tours du World Trade Center à New York.",
		start: day(2001, 9, 11)
	},
	{
		seedKey: 'crise-financiere-2008',
		title: 'Crise financière de 2008',
		description:
			'La faillite de la banque Lehman Brothers déclenche une crise financière et économique mondiale.',
		start: day(2008, 9, 15)
	},
	{
		seedKey: 'attentats-paris-2015',
		title: 'Attentats du 13 novembre 2015 à Paris',
		description:
			'Une série d’attaques terroristes coordonnées frappe Paris et Saint-Denis, notamment au Bataclan.',
		start: day(2015, 11, 13)
	},
	{
		seedKey: 'brexit-2016',
		title: 'Référendum sur le Brexit',
		description: "Le Royaume-Uni vote en faveur de sa sortie de l'Union européenne.",
		start: day(2016, 6, 23)
	},
	{
		seedKey: 'incendie-notre-dame-2019',
		title: 'Incendie de Notre-Dame de Paris',
		description:
			'Un incendie ravage la charpente et la flèche de la cathédrale Notre-Dame de Paris.',
		start: day(2019, 4, 15)
	},
	{
		seedKey: 'covid-19-pandemie',
		title: 'Pandémie de Covid-19',
		description: "L'Organisation mondiale de la santé déclare une pandémie mondiale de Covid-19.",
		start: day(2020, 3, 11),
		end: day(2023, 5, 5)
	},
	{
		seedKey: 'confinement-1',
		title: 'Premier confinement en France',
		description:
			"La France instaure un premier confinement national pour freiner l'épidémie de Covid-19.",
		start: day(2020, 3, 17),
		end: day(2020, 5, 11)
	},
	{
		seedKey: 'confinement-2',
		title: 'Deuxième confinement en France',
		description:
			"Un deuxième confinement national est instauré face à la reprise de l'épidémie de Covid-19.",
		start: day(2020, 10, 30),
		end: day(2020, 12, 15)
	},
	{
		seedKey: 'confinement-3',
		title: 'Troisième confinement en France',
		description:
			'Un troisième confinement national est instauré, accompagné d’un couvre-feu élargi.',
		start: day(2021, 4, 3),
		end: day(2021, 5, 3)
	},
	{
		seedKey: 'guerre-ukraine',
		title: "Invasion russe de l'Ukraine",
		description: "La Russie lance une invasion à grande échelle de l'Ukraine.",
		start: day(2022, 2, 24),
		end: null
	},
	{
		seedKey: 'mort-elizabeth-ii',
		title: 'Mort d’Élisabeth II',
		description:
			'La reine Élisabeth II du Royaume-Uni meurt au château de Balmoral, après 70 ans de règne.',
		start: day(2022, 9, 8)
	},
	{
		seedKey: 'coupe-du-monde-2018',
		title: 'La France championne du monde de football',
		description: "L'équipe de France remporte la Coupe du monde de football en Russie.",
		start: day(2018, 7, 15)
	},
	{
		seedKey: 'reouverture-notre-dame',
		title: 'Réouverture de Notre-Dame de Paris',
		description: 'La cathédrale Notre-Dame de Paris rouvre ses portes après sa restauration.',
		start: day(2024, 12, 7)
	},
	{
		seedKey: 'jo-paris-2024',
		title: 'Jeux olympiques de Paris 2024',
		description: "Paris accueille les Jeux olympiques d'été.",
		start: day(2024, 7, 26),
		end: day(2024, 8, 11)
	},
	{
		seedKey: 'paralympiques-2024',
		title: 'Jeux paralympiques de Paris 2024',
		description: 'Paris accueille les Jeux paralympiques d’été.',
		start: day(2024, 8, 28),
		end: day(2024, 9, 8)
	},
	{
		seedKey: 'chatgpt',
		title: 'Lancement de ChatGPT',
		description:
			"OpenAI met en ligne ChatGPT, popularisant les agents conversationnels d'intelligence artificielle.",
		start: day(2022, 11, 30)
	},
	{
		seedKey: 'gilets-jaunes',
		title: 'Mouvement des Gilets jaunes',
		description:
			'Un mouvement de contestation sociale débute en France autour de la fiscalité et du pouvoir d’achat.',
		start: day(2018, 11, 17),
		end: yearOnly(2019)
	},
	{
		seedKey: 'election-presidentielle-2022',
		title: "Réélection d'Emmanuel Macron",
		description: 'Emmanuel Macron est réélu président de la République française.',
		start: day(2022, 4, 24)
	}
];

/**
 * Inserts the built-in "histoire" events (FR-8), skipping any `seedKey`
 * already present (idempotent — AC-11, EC-17: a purged seed row may only be
 * re-added, never duplicated). Returns the resulting count of (non-deleted)
 * histoire entries so callers can report it.
 */
export function seedHistoire(db: Db, now: number = Date.now()): number {
	for (const item of HISTOIRE_ITEMS) {
		db.insert(entries)
			.values({
				type: 'histoire',
				title: item.title,
				description: item.description,
				startSort: toSortKey(item.start),
				startPrecision: item.start.precision,
				endSort: item.end ? toSortKey(item.end) : null,
				endPrecision: item.end ? item.end.precision : null,
				seedKey: item.seedKey,
				createdBy: null,
				createdAt: now,
				updatedBy: null,
				updatedAt: now
			})
			.onConflictDoNothing({ target: entries.seedKey })
			.run();
	}

	const row = db.get<{ count: number }>(
		sql`select count(*) as count from entries where type = 'histoire' and deleted_at is null`
	);
	return row.count;
}

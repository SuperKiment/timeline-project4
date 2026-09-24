/**
 * Journal moods: a fixed palette of emoji, each with a French label.
 * Pure, client-safe (no server imports) — usable from Svelte components too.
 */

export const MOODS = ['😄', '🙂', '😐', '😔', '😢', '😠', '😴', '🥰', '🤒', '🤩'] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_LABELS: Record<Mood, string> = {
	'😄': 'Joyeux',
	'🙂': 'Content',
	'😐': 'Neutre',
	'😔': 'Triste',
	'😢': 'Bouleversé',
	'😠': 'En colère',
	'😴': 'Fatigué',
	'🥰': 'Amoureux',
	'🤒': 'Malade',
	'🤩': 'Enthousiaste'
};

/** Whether `mood` is one of the fixed palette values. */
export function isValidMood(mood: string): mood is Mood {
	return (MOODS as readonly string[]).includes(mood);
}

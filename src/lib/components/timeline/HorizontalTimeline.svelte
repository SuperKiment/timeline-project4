<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		clampPxPerDay,
		granularityFor,
		itemRange,
		makeScale,
		phaseLanes,
		MIN_PX_PER_DAY
	} from '../../timeline/scale';
	import { diffDays } from '../../dates/fuzzy';
	import { formatItemDateRange, itemHref } from '../../timeline/layout';
	import type { TimelineItem } from '../../timeline/types';

	let { items, today }: { items: TimelineItem[]; today: string } = $props();

	/** Markers within this many days of the visible viewport are still rendered (avoids pop-in). */
	const DAY_BUFFER = 45;
	const LANE_HEIGHT = 28;
	/** Wheel zoom is exponential in `deltaY` so both plain mouse wheel notches and
	 *  trackpad ctrl+wheel pinch gestures (smaller, more frequent deltas) feel smooth. */
	const WHEEL_ZOOM_COEFFICIENT = 0.0025;
	const BUTTON_ZOOM_FACTOR = 1.3;

	let scrollEl: HTMLDivElement | undefined = $state();
	let viewportWidth = $state(0);
	let scrollLeft = $state(0);
	let pxPerDay = $state(MIN_PX_PER_DAY);

	const phaseItems = $derived(items.filter((item) => item.type === 'phase'));
	const histoireItems = $derived(items.filter((item) => item.type === 'histoire'));
	const mainItems = $derived(
		items.filter((item) => item.type !== 'phase' && item.type !== 'histoire')
	);

	// Full span covered by the frise: every item's range plus today, so the
	// "today" marker and initial scroll position are always reachable.
	const bounds = $derived.by(() => {
		let min = today;
		let max = today;
		for (const item of items) {
			const [from, to] = itemRange(item, today);
			if (from < min) min = from;
			if (to > max) max = to;
		}
		return { min, max };
	});

	const scale = $derived(makeScale(bounds.min, bounds.max, pxPerDay));
	const granularity = $derived(granularityFor(scale.pxPerDay));
	const tickList = $derived(scale.ticks(granularity));
	const lanedPhases = $derived(phaseLanes(phaseItems, today));
	const phaseLaneCount = $derived(Math.max(1, ...lanedPhases.map((laned) => laned.lane + 1)));

	interface Placed {
		item: TimelineItem;
		/** First and last day of the item's range, in days since `bounds.min`. */
		from: number;
		to: number;
	}

	// Ranges are parsed once per items change; zooming and scrolling then only
	// multiply these offsets (`scale.x()` would re-parse the dates every time).
	function place(item: TimelineItem): Placed {
		const [from, to] = itemRange(item, today);
		return { item, from: diffDays(bounds.min, from), to: diffDays(bounds.min, to) };
	}

	const placedMain = $derived(mainItems.map(place));
	const placedHistoire = $derived(histoireItems.map(place));
	const placedPhases = $derived(lanedPhases.map(({ item, lane }) => ({ ...place(item), lane })));

	/** Same as `scale.x()` for a day offset from `place()`. */
	function px(days: number): number {
		return days * scale.pxPerDay;
	}

	const viewStart = $derived(scrollLeft - DAY_BUFFER * scale.pxPerDay);
	const viewEnd = $derived(scrollLeft + viewportWidth + DAY_BUFFER * scale.pxPerDay);

	function inView({ from, to }: Placed): boolean {
		return px(to) >= viewStart && px(from) <= viewEnd;
	}

	const visibleMain = $derived(placedMain.filter(inView));
	const visibleHistoire = $derived(placedHistoire.filter(inView));
	const visiblePhases = $derived(placedPhases.filter(inView));

	async function zoomBy(factor: number) {
		const previous = pxPerDay;
		pxPerDay = clampPxPerDay(pxPerDay * factor);
		if (!scrollEl || pxPerDay === previous) return;
		// Keep the day under the viewport centre in place while zooming.
		const centre = scrollEl.scrollLeft + scrollEl.clientWidth / 2;
		const ratio = pxPerDay / previous;
		await tick();
		scrollEl.scrollLeft = Math.max(0, centre * ratio - scrollEl.clientWidth / 2);
		scrollLeft = scrollEl.scrollLeft;
	}

	function handleWheel(event: WheelEvent) {
		// Both a plain wheel and a trackpad ctrl+wheel (pinch) zoom the frise;
		// panning is done by dragging the native horizontal scrollbar instead.
		event.preventDefault();
		zoomBy(Math.exp(-event.deltaY * WHEEL_ZOOM_COEFFICIENT));
	}

	// At most one viewport update per frame, however many scroll events fire.
	let scrollFrame = 0;

	function handleScroll() {
		if (scrollFrame) return;
		scrollFrame = requestAnimationFrame(() => {
			scrollFrame = 0;
			if (scrollEl) scrollLeft = scrollEl.scrollLeft;
		});
	}

	function itemLabel(item: TimelineItem): string {
		return `${item.title} — ${formatItemDateRange(item)}`;
	}

	onMount(() => {
		if (!scrollEl) return;
		// Deferred to the next frame so `scrollEl.clientWidth` reflects the
		// final layout (the container may still be at 0 width during mount).
		requestAnimationFrame(() => {
			if (!scrollEl) return;
			const width = scrollEl.clientWidth;
			const todayX = scale.x(today);
			scrollEl.scrollLeft = Math.max(0, todayX - width / 2);
			scrollLeft = scrollEl.scrollLeft;
		});
		return () => cancelAnimationFrame(scrollFrame);
	});
</script>

<div class="horizontal-timeline pane">
	<div class="zoom-controls">
		<button
			type="button"
			class="glass"
			aria-label="Dézoomer"
			onclick={() => zoomBy(1 / BUTTON_ZOOM_FACTOR)}
		>
			−
		</button>
		<button
			type="button"
			class="glass"
			aria-label="Zoomer"
			onclick={() => zoomBy(BUTTON_ZOOM_FACTOR)}>+</button
		>
	</div>

	<div
		class="scroll-area"
		bind:this={scrollEl}
		bind:clientWidth={viewportWidth}
		onscroll={handleScroll}
		onwheel={handleWheel}
	>
		<div class="frise" style="width: {scale.totalWidth}px;">
			<div class="today-line" style="left: {scale.x(today)}px;" aria-hidden="true"></div>

			<div class="ruler">
				{#each tickList as tick (tick.day)}
					<div class="tick" style="left: {scale.x(tick.day)}px;">
						<span class="tick-label">{tick.label}</span>
					</div>
				{/each}
			</div>

			<div class="track phase-track" style="height: {phaseLaneCount * LANE_HEIGHT}px;">
				{#each visiblePhases as { item, lane, from, to } (item.key)}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- itemHref() already returns a resolve()d path -->
					<a
						href={itemHref(item)}
						class="phase-band"
						style="left: {px(from)}px; width: {Math.max(4, px(to) - px(from))}px; top: {lane *
							LANE_HEIGHT}px; height: {LANE_HEIGHT}px;"
						aria-label={itemLabel(item)}
					>
						<span class="phase-title">{item.title}</span>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/each}
			</div>

			<div class="track main-track">
				{#each visibleMain as { item, from, to } (item.key)}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- itemHref() already returns a resolve()d path -->
					<a
						href={itemHref(item)}
						class="marker"
						class:important={item.type === 'important'}
						style="left: {px(from)}px; width: {Math.max(2, px(to) - px(from))}px;"
						aria-label={itemLabel(item)}
					>
						<span class="marker-dot"></span>
						<span class="marker-title">{item.title}</span>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/each}
			</div>

			<div class="track histoire-track">
				{#each visibleHistoire as { item, from, to } (item.key)}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- itemHref() already returns a resolve()d path -->
					<a
						href={itemHref(item)}
						class="marker histoire"
						style="left: {px(from)}px; width: {Math.max(2, px(to) - px(from))}px;"
						aria-label={itemLabel(item)}
					>
						<span class="marker-dot"></span>
						<span class="marker-title">{item.title}</span>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.horizontal-timeline {
		position: relative;
		width: 100%;
		padding: 0;
		overflow: hidden;
	}

	.zoom-controls {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 2;
		display: flex;
		gap: 0.25rem;
	}

	.zoom-controls button {
		width: 44px;
		padding: 0;
		border-radius: var(--radius-pill);
		font-size: 1.25rem;
		line-height: 1;
	}

	.scroll-area {
		overflow-x: auto;
		overflow-y: hidden;
		width: 100%;
		touch-action: pan-x;
	}

	.frise {
		position: relative;
		min-width: 100%;
	}

	.ruler {
		position: relative;
		height: 28px;
		border-bottom: 1px solid var(--hairline);
	}

	.tick {
		position: absolute;
		top: 0;
		bottom: 0;
		border-left: 1px solid var(--hairline);
		padding-left: 4px;
	}

	.tick-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.today-line {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--color-accent);
		pointer-events: none;
		z-index: 1;
	}

	.track {
		position: relative;
	}

	.phase-track {
		border-bottom: 1px solid var(--hairline);
	}

	.phase-band {
		position: absolute;
		display: flex;
		align-items: center;
		border-radius: var(--radius-pill);
		background: var(--color-accent-soft);
		color: var(--color-text);
		padding: 0 0.625rem;
		overflow: hidden;
		text-decoration: none;
		white-space: nowrap;
	}

	.phase-title {
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.main-track,
	.histoire-track {
		height: 44px;
		border-bottom: 1px solid var(--hairline);
	}

	.histoire-track {
		border-bottom: none;
		background: var(--hairline);
	}

	.marker {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 8px;
		padding: 0 0.25rem;
		color: var(--color-text);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
	}

	.marker-dot {
		flex: 0 0 auto;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-accent);
	}

	.marker.important .marker-dot {
		background: var(--color-important);
	}

	.marker.histoire {
		color: var(--color-text-muted);
	}

	.marker.histoire .marker-dot {
		background: var(--color-text-muted);
	}

	.marker-title {
		font-size: 0.8125rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>

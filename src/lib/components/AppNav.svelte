<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	const links = [
		{
			href: '/',
			label: 'Timeline',
			icon: ['M12 3v18', 'M12 8h6', 'M12 15h-6', 'M12 8m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0']
		},
		{
			href: '/journal',
			label: 'Journal',
			icon: [
				'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z',
				'M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3',
				'M9 8h6'
			]
		},
		{
			href: '/ce-jour-la',
			label: 'Ce jour-là',
			icon: [
				'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
				'M8 3v4M16 3v4M4 10h16',
				'M12 18s-3-1.8-3-3.8a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1c0 2-3 3.8-3 3.8z'
			]
		},
		{
			href: '/recherche',
			label: 'Recherche',
			icon: ['M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z', 'M16 16l4.5 4.5']
		},
		{
			href: '/corbeille',
			label: 'Corbeille',
			icon: ['M4 7h16', 'M9 7V4.5h6V7', 'M6 7l1 13h10l1-13', 'M10 11v6M14 11v6']
		},
		{
			href: '/parametres',
			label: 'Paramètres',
			icon: [
				'M4 7h9M17 7h3M4 17h3M11 17h9',
				'M15 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
				'M9 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0'
			]
		}
	] as const;

	/** `/` only matches exactly; other tabs also match their sub-routes. */
	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
	}
</script>

<nav class="app-nav" aria-label="Navigation principale">
	<ul>
		{#each links as link (link.href)}
			<li>
				<a href={resolve(link.href)} aria-current={isActive(link.href) ? 'page' : undefined}>
					<svg
						viewBox="0 0 24 24"
						width="22"
						height="22"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						focusable="false"
					>
						{#each link.icon as d (d)}
							<path {d} />
						{/each}
					</svg>
					<span>{link.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.app-nav {
		position: fixed;
		left: calc(12px + env(safe-area-inset-left, 0px));
		right: calc(12px + env(safe-area-inset-right, 0px));
		bottom: calc(12px + env(safe-area-inset-bottom, 0px));
		z-index: 50;
		height: 64px;
		padding: 0 6px;
		border-radius: var(--radius-xl);
		border: 1px solid var(--glass-border);
		background: var(--glass-bg);
		-webkit-backdrop-filter: var(--blur-nav);
		backdrop-filter: var(--blur-nav);
		box-shadow: var(--shadow-float);
	}

	ul {
		display: flex;
		align-items: center;
		gap: 0;
		height: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		flex: 1 1 0;
		min-width: 0;
	}

	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 52px;
		margin: 0 1px;
		padding: 4px 2px;
		border-radius: var(--radius-lg);
		font-size: 0.625rem;
		letter-spacing: -0.01em;
		line-height: 1.2;
		text-align: center;
		text-decoration: none;
		color: var(--color-text-muted);
		transition:
			background-color 150ms ease,
			color 150ms ease;
	}

	a span {
		white-space: nowrap;
	}

	svg {
		flex: none;
	}

	a[aria-current='page'] {
		color: var(--color-accent);
		font-weight: 600;
		background: var(--color-accent-soft);
	}

	@media (prefers-reduced-motion: reduce) {
		a {
			transition: none;
		}
	}

	@media (min-width: 1024px) {
		.app-nav {
			position: sticky;
			top: calc(12px + env(safe-area-inset-top, 0px));
			left: auto;
			right: auto;
			bottom: auto;
			width: fit-content;
			height: auto;
			margin: 12px auto 0;
			padding: 4px;
		}

		ul {
			gap: 2px;
		}

		li {
			flex: 0 0 auto;
		}

		a {
			flex-direction: row;
			min-height: 44px;
			min-width: 44px;
			margin: 0;
			padding: 0 1rem;
			border-radius: var(--radius-pill);
			font-size: 0.9375rem;
			letter-spacing: normal;
		}

		svg {
			display: none;
		}

		a[aria-current='page'] {
			color: var(--color-text);
			background: var(--surface-strong);
		}
	}
</style>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	const links = [
		{ href: '/', label: 'Timeline' },
		{ href: '/journal', label: 'Journal' },
		{ href: '/ce-jour-la', label: 'Ce jour-là' },
		{ href: '/recherche', label: 'Recherche' },
		{ href: '/corbeille', label: 'Corbeille' },
		{ href: '/parametres', label: 'Paramètres' }
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
				<a href={resolve(link.href)} aria-current={isActive(link.href) ? 'page' : undefined}
					>{link.label}</a
				>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.app-nav {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 50;
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}

	ul {
		display: flex;
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
		align-items: center;
		justify-content: center;
		min-height: 56px;
		padding: 0 0.25rem;
		font-size: 0.7rem;
		text-align: center;
		text-decoration: none;
		color: var(--color-text-muted);
		border-top: 3px solid transparent;
	}

	a[aria-current='page'] {
		color: var(--color-accent);
		font-weight: 600;
		border-top-color: var(--color-accent);
	}

	@media (min-width: 1024px) {
		.app-nav {
			position: sticky;
			inset: 0 0 auto 0;
			border-top: none;
			border-bottom: 1px solid var(--color-border);
			padding-bottom: 0;
		}

		ul {
			max-width: 72rem;
			margin: 0 auto;
			padding: 0 1rem;
			gap: 0.25rem;
		}

		li {
			flex: 0 0 auto;
		}

		a {
			min-height: 48px;
			padding: 0 1rem;
			font-size: 1rem;
			border-top: none;
			border-bottom: 3px solid transparent;
		}

		a[aria-current='page'] {
			border-bottom-color: var(--color-accent);
		}
	}
</style>

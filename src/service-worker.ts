/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_PREFIX = 'timeline-static-';
const CACHE_NAME = `${CACHE_PREFIX}${version}`;

// Only immutable app shell assets are cached. Pages, /api and /media carry
// private data and always go to the network.
const ASSETS = new Set<string>([...build, ...files]);

/** Self-contained page from `static/`, hence precached with the assets above. */
const OFFLINE_PAGE = '/offline.html';

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll([...ASSETS]))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (ASSETS.has(url.pathname)) {
		event.respondWith(
			caches.open(CACHE_NAME).then(async (cache) => {
				const cached = await cache.match(url.pathname);
				return cached ?? fetch(request);
			})
		);
	} else if (request.mode === 'navigate' && !isApiOrMedia(url.pathname)) {
		// Pages stay network-only; when the server can't be reached, show the generic offline page.
		event.respondWith(
			fetch(request).catch(
				async () =>
					(await caches.match(OFFLINE_PAGE, { cacheName: CACHE_NAME })) ?? Response.error()
			)
		);
	}
});

function isApiOrMedia(pathname: string): boolean {
	return pathname.startsWith('/api/') || pathname.startsWith('/media/');
}

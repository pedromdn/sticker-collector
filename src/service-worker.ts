/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Precaches the app shell (hashed JS/CSS bundle + static files) so repeat
// loads are instant and the app still opens on a bad connection. Pages,
// auth, and /api/* are never touched here — every one of them reflects
// live, per-user state (the shared collection, signed image URLs, session)
// that must never be served stale from a cache.

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = `shell-${version}`;
const ASSET_PATHS = new Set([...build, ...files]);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll([...ASSET_PATHS]))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;
	if (!ASSET_PATHS.has(url.pathname)) return;

	event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});

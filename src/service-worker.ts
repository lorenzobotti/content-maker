/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

// Precache the whole app so it installs and runs fully offline.
// Every browser that can install a PWA uses .woff2, so the legacy .woff copies are skipped.
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `cache-${version}`;
const SHELL = '/';
const ASSETS = [SHELL, ...build, ...files].filter((path) => !path.endsWith('.woff'));

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	// SPA navigations: network first so new deploys show up, cached shell when offline.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => (await caches.match(SHELL)) ?? Response.error())
		);
		return;
	}

	event.respondWith(
		caches.match(request).then(async (cached) => {
			if (cached) return cached;
			const response = await fetch(request);
			if (response.ok && url.pathname.startsWith('/_app/immutable/')) {
				const cache = await caches.open(CACHE);
				cache.put(request, response.clone());
			}
			return response;
		})
	);
});

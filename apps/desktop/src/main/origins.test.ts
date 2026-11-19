import assert from 'node:assert/strict';
import { suite, test } from 'node:test';

import {
	APP_ORIGIN,
	DEVTOOLS_ORIGIN,
	isAllowedExternalUrl,
	isFromOrigins,
	originOf,
	pageOrigins,
	requestOrigins,
} from './origins.js';

const devServerUrl = 'http://localhost:5173';

suite('originOf', () => {
	test('keeps the scheme, host and port', () => {
		assert.equal(originOf('app://renderer/index.html'), APP_ORIGIN);
		assert.equal(originOf('http://localhost:5173/src/main.tsx'), 'http://localhost:5173');
	});

	test('returns null for a URL with no host, or no URL at all', () => {
		assert.equal(originOf('data:text/html,hi'), null);
		assert.equal(originOf('about:blank'), null);
		assert.equal(originOf('not a url'), null);
	});
});

suite('pageOrigins and requestOrigins', () => {
	test('allow only the app scheme in a packaged build', () => {
		assert.deepEqual(pageOrigins(), [APP_ORIGIN]);
		assert.deepEqual(requestOrigins(), [APP_ORIGIN]);
	});

	test("add Vite's server in development, and its WebSocket and DevTools for requests only", () => {
		assert.deepEqual(pageOrigins(devServerUrl), [APP_ORIGIN, 'http://localhost:5173']);
		assert.deepEqual(requestOrigins(devServerUrl), [
			APP_ORIGIN,
			'http://localhost:5173',
			'ws://localhost:5173',
			DEVTOOLS_ORIGIN,
		]);
	});

	test('leave DevTools out of a packaged build', () => {
		assert.equal(isFromOrigins('devtools://devtools/bundled/devtools_app.html', requestOrigins()), false);
	});
});

suite('isFromOrigins', () => {
	const origins = requestOrigins();

	test('allows the app scheme', () => {
		assert.ok(isFromOrigins('app://renderer/assets/index.js', origins));
	});

	test('refuses everything else', () => {
		for (const url of [
			'https://example.org/',
			'http://localhost:5173/',
			'app://other/index.html',
			'file:///etc/passwd',
			'data:text/html,hi',
			'app://renderer.example.org/index.html',
		]) {
			assert.equal(isFromOrigins(url, origins), false, url);
		}
	});

	test("refuses a different port on Vite's host in development", () => {
		assert.equal(isFromOrigins('http://localhost:5174/', requestOrigins(devServerUrl)), false);
	});
});

suite('isAllowedExternalUrl', () => {
	test('opens nothing while the allowlist is empty', () => {
		assert.equal(isAllowedExternalUrl('https://example.org/'), false);
	});

	test('opens only https addresses on the allowlist', () => {
		const allowlist = ['https://docs.example.org'];
		assert.ok(isAllowedExternalUrl('https://docs.example.org/guide', allowlist));
		assert.equal(isAllowedExternalUrl('http://docs.example.org/guide', ['http://docs.example.org']), false);
		assert.equal(isAllowedExternalUrl('https://docs.example.org.evil.test/', allowlist), false);
	});
});

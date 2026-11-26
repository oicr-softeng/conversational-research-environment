import assert from 'node:assert/strict';
import { suite, test } from 'node:test';

import { assertHttpScheme, toSdkFetch, UnsupportedSchemeError } from './fetch.js';
import { type Fetch } from './types.js';

/** A `Fetch` that records each call and answers with an empty 200. */
const recording = () => {
	const calls: { input: unknown; init: RequestInit | undefined }[] = [];
	const fetch: Fetch = async (input, init) => {
		calls.push({ input, init });
		return new Response(null, { status: 200 });
	};
	return { calls, fetch };
};

suite('toSdkFetch', () => {
	test('passes a string address to the given fetch unchanged', async () => {
		const { calls, fetch } = recording();

		await toSdkFetch(fetch)('http://127.0.0.1:3000/mcp?probe=1');

		assert.deepEqual(
			calls.map(({ input }) => input),
			['http://127.0.0.1:3000/mcp?probe=1'],
		);
	});

	test('passes a URL to the given fetch as its string form', async () => {
		const { calls, fetch } = recording();

		await toSdkFetch(fetch)(new URL('https://mcp.example.test/.well-known/oauth-protected-resource/mcp?a=1'));

		assert.equal(typeof calls[0]?.input, 'string');
		assert.equal(calls[0]?.input, 'https://mcp.example.test/.well-known/oauth-protected-resource/mcp?a=1');
	});

	test('passes the request options through, and returns the given fetch’s response', async () => {
		const response = new Response('ok');
		const init: RequestInit = { method: 'POST', redirect: 'manual', body: '{}' };
		const seen: (RequestInit | undefined)[] = [];
		const fetch: Fetch = async (_input, given) => {
			seen.push(given);
			return response;
		};

		const returned = await toSdkFetch(fetch)('https://mcp.example.test/mcp', init);

		assert.equal(seen[0], init);
		assert.equal(returned, response);
	});

	test('refuses every scheme but http and https, without calling the given fetch', async () => {
		const { calls, fetch } = recording();
		const sdkFetch = toSdkFetch(fetch);
		const refused: [string, string][] = [
			['file:///etc/hosts', 'file:'],
			['FILE:///etc/hosts', 'file:'],
			['data:text/plain,hello', 'data:'],
			['app://renderer/index.html', 'app:'],
			['javascript:void(0)', 'javascript:'],
		];

		for (const [address, scheme] of refused) {
			await assert.rejects(
				sdkFetch(address),
				(error: unknown) =>
					error instanceof UnsupportedSchemeError &&
					error instanceof TypeError &&
					error.scheme === scheme &&
					!error.message.includes('/etc/hosts') &&
					!error.message.includes('renderer'),
				address,
			);
		}
		assert.equal(calls.length, 0);
	});

	test('passes a rejection of any other type through unchanged', async () => {
		const bug = new RangeError('a bug in the given fetch');
		const failure = new TypeError('fetch failed');

		await assert.rejects(
			toSdkFetch(async () => Promise.reject(bug))('https://mcp.example.test/mcp'),
			(error: unknown) => error === bug,
		);
		await assert.rejects(
			toSdkFetch(async () => Promise.reject(failure))('https://mcp.example.test/mcp'),
			(error: unknown) => error === failure,
		);
	});
});

suite('assertHttpScheme', () => {
	test('allows http and https', () => {
		assert.doesNotThrow(() => assertHttpScheme(new URL('http://127.0.0.1/mcp')));
		assert.doesNotThrow(() => assertHttpScheme(new URL('HTTPS://mcp.example.test/mcp')));
	});

	test('refuses any other scheme, naming only the scheme', () => {
		assert.throws(
			() => assertHttpScheme(new URL('file:///home/someone/secret.txt')),
			(error: unknown) =>
				error instanceof UnsupportedSchemeError &&
				error.scheme === 'file:' &&
				/^Refusing to fetch a file: address: only http: and https: are allowed$/.test(error.message),
		);
	});
});

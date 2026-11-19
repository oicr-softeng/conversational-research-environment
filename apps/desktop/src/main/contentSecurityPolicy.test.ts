import assert from 'node:assert/strict';
import { suite, test } from 'node:test';

import { developmentPolicy, PACKAGED_POLICY } from './contentSecurityPolicy.js';

const directives = (policy: string) =>
	new Map(
		policy.split('; ').map((directive) => {
			const [name = '', ...sources] = directive.split(' ');
			return [name, sources];
		}),
	);

suite('PACKAGED_POLICY', () => {
	test('allows only the page’s own origin, with nothing remote or inline', () => {
		const policy = directives(PACKAGED_POLICY);
		assert.deepEqual(policy.get('default-src'), ["'self'"]);
		assert.deepEqual(
			[...policy.keys()].filter((name) => name !== 'default-src' && name.endsWith('-src')),
			['object-src'],
		);
		assert.doesNotMatch(PACKAGED_POLICY, /unsafe|https?:|ws:|\*/);
	});

	test('blocks plugins, base changes, form posts and framing', () => {
		const policy = directives(PACKAGED_POLICY);
		assert.deepEqual(policy.get('object-src'), ["'none'"]);
		assert.deepEqual(policy.get('base-uri'), ["'none'"]);
		assert.deepEqual(policy.get('form-action'), ["'none'"]);
		assert.deepEqual(policy.get('frame-ancestors'), ["'none'"]);
	});
});

suite('developmentPolicy', () => {
	test("adds only Vite's server and its WebSocket", () => {
		const policy = developmentPolicy('http://localhost:5173/');
		const remote = policy.match(/\b(?:https?|wss?):\/\/[^\s;]+/g);
		assert.deepEqual([...new Set(remote)].sort(), ['http://localhost:5173', 'ws://localhost:5173']);
		assert.deepEqual(directives(policy).get('connect-src'), [
			"'self'",
			'http://localhost:5173',
			'ws://localhost:5173',
		]);
	});

	test('refuses a development server that is not http(s)', () => {
		assert.throws(() => developmentPolicy('app://renderer/'));
	});
});

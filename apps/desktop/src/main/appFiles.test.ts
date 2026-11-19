import assert from 'node:assert/strict';
import path from 'node:path';
import { suite, test } from 'node:test';

import { contentTypeOf, resolveAppFile } from './appFiles.js';

const root = path.resolve('/app/renderer/main_window');

suite('resolveAppFile', () => {
	test('maps a path on the app scheme to a file under the root', () => {
		assert.equal(resolveAppFile('app://renderer/assets/index.js', root), path.join(root, 'assets/index.js'));
	});

	test('maps the root path to index.html', () => {
		assert.equal(resolveAppFile('app://renderer/', root), path.join(root, 'index.html'));
	});

	test('ignores the query and fragment', () => {
		assert.equal(resolveAppFile('app://renderer/index.html?x=1#y', root), path.join(root, 'index.html'));
	});

	test('refuses another scheme or host', () => {
		assert.equal(resolveAppFile('file:///app/renderer/main_window/index.html', root), null);
		assert.equal(resolveAppFile('https://renderer/index.html', root), null);
		assert.equal(resolveAppFile('app://other/index.html', root), null);
	});

	test('never resolves a path outside the root', () => {
		for (const url of [
			'app://renderer/../main/main.cjs',
			'app://renderer/%2e%2e/main/main.cjs',
			'app://renderer/assets/%2e%2e/%2e%2e/secret',
			'app://renderer/..%2fmain%2fmain.cjs',
			'app://renderer/%2Fetc%2Fpasswd',
			'app://renderer/assets/..%2f..%2f..%2fmain_window2/index.html',
			'app://renderer/..%2fmain_window2%2findex.html',
		]) {
			const file = resolveAppFile(url, root);
			assert.ok(file === null || file.startsWith(root + path.sep), `${url} resolved to ${file}`);
		}
	});

	test('keeps dot segments the URL parser clamps at the root inside it', () => {
		assert.equal(resolveAppFile('app://renderer/../main/main.cjs', root), path.join(root, 'main/main.cjs'));
		assert.equal(resolveAppFile('app://renderer/%2e%2e/main/main.cjs', root), path.join(root, 'main/main.cjs'));
	});

	test('keeps an encoded leading slash inside the root', () => {
		assert.equal(resolveAppFile('app://renderer/%2Fetc%2Fpasswd', root), path.join(root, 'etc/passwd'));
	});

	test('refuses encoded separators that climb out of the root', () => {
		assert.equal(resolveAppFile('app://renderer/..%2fmain%2fmain.cjs', root), null);
		// A sibling directory whose name starts with the root's
		assert.equal(resolveAppFile('app://renderer/..%2fmain_window2%2findex.html', root), null);
	});

	test('refuses a NUL byte, and malformed escapes', () => {
		assert.equal(resolveAppFile('app://renderer/index.html%00.js', root), null);
		assert.equal(resolveAppFile('app://renderer/%E0%A4%A', root), null);
		assert.equal(resolveAppFile('not a url', root), null);
	});
});

suite('contentTypeOf', () => {
	test('names the types the renderer build holds', () => {
		assert.equal(contentTypeOf('index.html'), 'text/html; charset=utf-8');
		assert.equal(contentTypeOf('assets/index-abc.JS'), 'text/javascript; charset=utf-8');
		assert.equal(contentTypeOf('assets/index-abc.css'), 'text/css; charset=utf-8');
	});

	test('falls back to a generic binary type', () => {
		assert.equal(contentTypeOf('data.bin'), 'application/octet-stream');
	});
});

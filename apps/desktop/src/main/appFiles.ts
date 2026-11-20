import path from 'node:path';

import { APP_HOST, APP_SCHEME } from './origins.js';

/**
 * Maps a request on the app's scheme to a file under `rootDir`, the renderer's build.
 * Returns `null` for any other scheme or host, and for any path that resolves outside `rootDir`.
 */
export const resolveAppFile = (requestUrl: string, rootDir: string): string | null => {
	let url: URL;
	try {
		url = new URL(requestUrl);
	} catch {
		return null;
	}
	if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
		return null;
	}

	let pathname: string;
	try {
		// Percent-encoded segments, such as `%2e%2e`, are decoded here, then checked below like any other path
		pathname = decodeURIComponent(url.pathname);
	} catch {
		return null;
	}
	if (pathname.includes('\0')) {
		return null;
	}

	const root = path.resolve(rootDir);
	const file = path.resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
	const fromRoot = path.relative(root, file);
	if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
		return null;
	}
	return file;
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.ico': 'image/x-icon',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
};

export const contentTypeOf = (file: string): string =>
	CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/**
 * The privileged scheme the packaged renderer is served from, in place of `file://`.
 * A standard scheme, so the page has an origin of its own for its content security policy and for `fetch`.
 */
export const APP_SCHEME = 'app';
export const APP_HOST = 'renderer';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;

/**
 * A URL's scheme and host, with any port.
 * `URL.origin` is `"null"` for a scheme Node does not know, such as the app's own, so this builds it instead.
 */
export const originOf = (url: string): string | null => {
	try {
		const parsed = new URL(url);
		return parsed.host ? `${parsed.protocol}//${parsed.host}` : null;
	} catch {
		return null;
	}
};

export const isFromOrigins = (url: string, origins: readonly string[]): boolean => {
	const origin = originOf(url);
	return origin !== null && origins.includes(origin);
};

/**
 * Where the renderer's page may come from: the app's scheme, and in development, Vite's server.
 */
export const pageOrigins = (devServerUrl?: string): readonly string[] => {
	const devOrigin = devServerUrl ? originOf(devServerUrl) : null;
	return devOrigin ? [APP_ORIGIN, devOrigin] : [APP_ORIGIN];
};

/** DevTools' own front end, which loads through the inspected page's session */
export const DEVTOOLS_ORIGIN = 'devtools://devtools';

/**
 * What the renderer's session may request: its page origins, and in development,
 * the WebSocket Vite's server uses for hot reload and DevTools' front end.
 */
export const requestOrigins = (devServerUrl?: string): readonly string[] => {
	const origins = pageOrigins(devServerUrl);
	const devOrigin = devServerUrl ? originOf(devServerUrl) : null;
	return devOrigin ? [...origins, devOrigin.replace(/^http/, 'ws'), DEVTOOLS_ORIGIN] : origins;
};

/**
 * Outside addresses the app may open in the person's browser, through `shell.openExternal`. None yet.
 * An entry is an `https:` origin, matched exactly.
 */
export const EXTERNAL_ORIGINS: readonly string[] = [];

export const isAllowedExternalUrl = (url: string, allowlist: readonly string[] = EXTERNAL_ORIGINS): boolean =>
	url.startsWith('https:') && isFromOrigins(url, allowlist);

import { readFile } from 'node:fs/promises';

import { session, type Session } from 'electron';

import { contentTypeOf, resolveAppFile } from './appFiles.js';
import { developmentPolicy, PACKAGED_POLICY } from './contentSecurityPolicy.js';
import { APP_SCHEME, isFromOrigins, originOf, requestOrigins } from './origins.js';

/**
 * The renderer's own session, apart from the default one.
 * Its request filter then constrains only the renderer, not the main process's own `net` requests.
 */
const RENDERER_PARTITION = 'persist:renderer';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * Creates the renderer's session, serving `rendererRoot` on the app's scheme and allowing it nothing else.
 * Call after `app` is ready.
 */
export const createRendererSession = ({
	devServerUrl,
	rendererRoot,
}: {
	devServerUrl?: string;
	rendererRoot: string;
}): Session => {
	const rendererSession = session.fromPartition(RENDERER_PARTITION);

	// The renderer's build, from the app's scheme rather than `file://`, with its policy in every response's headers
	rendererSession.protocol.handle(APP_SCHEME, async (request) => {
		const file = resolveAppFile(request.url, rendererRoot);
		if (!file) {
			return notFound();
		}
		try {
			const body = await readFile(file);
			return new Response(new Uint8Array(body), {
				headers: {
					'Content-Security-Policy': PACKAGED_POLICY,
					'Content-Type': contentTypeOf(file),
				},
			});
		} catch {
			return notFound();
		}
	});

	// A content security policy is declared by the document it constrains, so the session enforces the same limit
	const allowedOrigins = requestOrigins(devServerUrl);
	rendererSession.webRequest.onBeforeRequest((details, callback) => {
		callback({ cancel: !isFromOrigins(details.url, allowedOrigins) });
	});

	// In development, Vite's server sends the page, so the policy is added to its responses
	const devOrigin = devServerUrl ? originOf(devServerUrl) : null;
	if (devServerUrl && devOrigin) {
		const policy = developmentPolicy(devServerUrl);
		rendererSession.webRequest.onHeadersReceived({ urls: [`${devOrigin}/*`] }, (details, callback) => {
			callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] } });
		});
	}

	rendererSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
	rendererSession.setPermissionCheckHandler(() => false);
	rendererSession.setDevicePermissionHandler(() => false);

	return rendererSession;
};

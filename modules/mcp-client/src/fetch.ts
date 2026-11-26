// The one path between the SDK and the `fetch` a host supplies. The CRE's desktop app supplies Electron's
// `net.fetch`, since Node's `fetch` ignores the computer's proxy settings and trusted certificates.
//
// - Every address is checked, since Electron's `fetch` also reads `file:` and custom schemes, and the SDK fetches
//   addresses named by a server, such as its OAuth metadata.
// - `URL`s become strings, since Electron's `fetch` isn't typed to take a `URL`.
// - Rejections pass through unchanged. A host's `fetch` reports a network failure as a `TypeError` itself (see
//   `Fetch`).
//
// Decision and evidence: `.dev/docs/mcp-host/fetch-option.md`.
import { type FetchLike } from '@modelcontextprotocol/client';

import { type Fetch } from './types.js';

const HTTP_SCHEMES: readonly string[] = ['http:', 'https:'];

/**
 * An address with a scheme other than `http:` or `https:`, refused before anything is fetched.
 *
 * @remarks
 * A `TypeError` subclass, as a failed `fetch` is. Its message names the scheme alone, never the address, which may
 * carry a credential or a local path.
 */
export class UnsupportedSchemeError extends TypeError {
	/** The refused scheme, with its colon, such as `file:`. */
	readonly scheme: string;

	/** @param scheme - The refused scheme, with its colon. */
	constructor(scheme: string) {
		super(`Refusing to fetch a ${scheme} address: only http: and https: are allowed`);
		this.name = 'UnsupportedSchemeError';
		this.scheme = scheme;
	}
}

/**
 * Refuses an address whose scheme is not `http:` or `https:`.
 *
 * @param url - The address about to be fetched.
 * @throws {@link UnsupportedSchemeError} for any other scheme.
 */
export const assertHttpScheme = (url: URL): void => {
	if (!HTTP_SCHEMES.includes(url.protocol)) {
		throw new UnsupportedSchemeError(url.protocol);
	}
};

/**
 * Wraps a {@link Fetch} for the SDK, which passes `URL`s as well as strings, and fetches addresses named by a server,
 * such as its OAuth metadata. {@link assertHttpScheme} checks every address before `fetch` is called. Rejections
 * pass through unchanged.
 *
 * @param fetch - The function every request goes through.
 * @returns A `fetch` in the SDK's own type.
 */
export const toSdkFetch =
	(fetch: Fetch): FetchLike =>
	async (input, init) => {
		const address = typeof input === 'string' ? input : input.href;
		assertHttpScheme(new URL(address));
		return fetch(address, init);
	};

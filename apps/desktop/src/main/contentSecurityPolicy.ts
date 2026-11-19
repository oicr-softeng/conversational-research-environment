import { originOf } from './origins.js';

const RESTRICTIONS = ["object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"];

/**
 * The packaged renderer's policy: nothing remote, served in the response's headers, where the page cannot remove it.
 */
export const PACKAGED_POLICY = ["default-src 'self'", ...RESTRICTIONS].join('; ');

/**
 * In development, the page comes from Vite's server, which also needs:
 * - its WebSocket, for hot reload
 * - inline scripts and styles, for React's refresh preamble and Vite's injected styles
 */
export const developmentPolicy = (devServerUrl: string): string => {
	const origin = originOf(devServerUrl);
	if (!origin?.startsWith('http')) {
		throw new Error(`Not an http(s) development server: ${devServerUrl}`);
	}
	const socket = origin.replace(/^http/, 'ws');
	return [
		`default-src 'self' ${origin}`,
		`script-src 'self' ${origin} 'unsafe-inline'`,
		`style-src 'self' ${origin} 'unsafe-inline'`,
		`connect-src 'self' ${origin} ${socket}`,
		...RESTRICTIONS,
	].join('; ');
};

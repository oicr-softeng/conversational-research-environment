import path from 'node:path';

import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

/**
 * `-` signs ad-hoc, until a Developer ID certificate exists.
 * A Developer ID build replaces it with that certificate's identity, which also drops `disable-library-validation`.
 */
const signingIdentity = '-';
const isAdHoc = signingIdentity === '-';

/**
 * Every binary is given these entitlements explicitly.
 * Without them, `@electron/osx-sign` applies its own defaults, which include camera, microphone, Bluetooth, USB,
 * printing, location and photo-library entitlements (`.dev/docs/mcp-host-packaging-spikes.md` § 3).
 */
const entitlements = path.join(import.meta.dirname, 'entitlements', isAdHoc ? 'ad-hoc.plist' : 'developer-id.plist');

const config: ForgeConfig = {
	packagerConfig: {
		asar: true,
		osxSign: {
			identity: signingIdentity,
			identityValidation: !isAdHoc,
			optionsForFile: () => ({ entitlements, hardenedRuntime: true }),
			// `@electron/packager` sets this to `true` when it is left out, and a signing failure then only warns
			continueOnError: false,
		},
	},
	rebuildConfig: {},
	makers: [
		// Squirrel.Mac updates from the ZIP
		new MakerZIP({}, ['darwin']),
		new MakerDMG({}, ['darwin']),
	],
	plugins: [
		new VitePlugin({
			build: [
				{
					entry: 'src/main/main.ts',
					config: 'vite.main.config.mts',
					target: 'main',
				},
				{
					entry: 'src/preload/preload.ts',
					config: 'vite.preload.config.mts',
					target: 'preload',
				},
			],
			renderer: [
				{
					name: 'main_window',
					config: 'vite.renderer.config.mts',
				},
			],
		}),
		// Fuses are set at package time, before the app is signed
		new FusesPlugin({
			version: FuseVersion.V1,
			[FuseV1Options.RunAsNode]: false,
			[FuseV1Options.EnableCookieEncryption]: true,
			[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
			[FuseV1Options.EnableNodeCliInspectArguments]: false,
			[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
			[FuseV1Options.OnlyLoadAppFromAsar]: true,
		}),
	],
};

export default config;

import globals from 'globals';

import baseConfig from '../../eslint.config.js';

const desktopConfigs = [
	...baseConfig,
	{
		ignores: ['.vite/**', 'out/**'],
	},
	{
		// Forge and Vite configurations
		files: ['**/*.mts'],
	},
	{
		languageOptions: {
			parserOptions: {
				// The root's `tsconfig.eslint.json` extends Node's base, with no DOM library or JSX setting
				project: ['./tsconfig.json'],
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		// Every IPC handler goes through `createIpcHandle`, which checks each message's sender first
		files: ['src/main/**'],
		ignores: ['src/main/ipc.ts'],
		rules: {
			'no-restricted-properties': [
				'error',
				...['handle', 'handleOnce', 'on', 'once', 'addListener'].map((property) => ({
					object: 'ipcMain',
					property,
					message: "Register IPC handlers through `createIpcHandle` in './ipc.js', which checks the sender.",
				})),
			],
		},
	},
	{
		// The renderer is sandboxed, so it has no Node globals such as `process` or `Buffer`
		files: ['src/renderer/**'],
		languageOptions: {
			globals: {
				...Object.fromEntries(Object.keys(globals.node).map((name) => [name, 'off'])),
				...globals.browser,
			},
		},
	},
];

export default desktopConfigs;

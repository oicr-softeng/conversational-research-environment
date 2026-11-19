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

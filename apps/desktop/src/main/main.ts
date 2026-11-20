import path from 'node:path';

import { app, BrowserWindow, protocol, shell, type Session } from 'electron';

import { APP_ENTRY_URL, APP_SCHEME, isAllowedExternalUrl, isFromOrigins, pageOrigins } from './origins.js';
import { createRendererSession } from './rendererSession.js';

/** Set by Forge's Vite plugin in development only */
const devServerUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL || undefined;
const isDevelopment = devServerUrl !== undefined;
const allowedPageOrigins = pageOrigins(devServerUrl);

let mainWindow: BrowserWindow | null = null;

const createWindow = (rendererSession: Session) => {
	const window = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			session: rendererSession,
			// Electron's defaults, set here so that a change to any of them shows in review
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	window.webContents.on('will-navigate', (event) => {
		if (!isFromOrigins(event.url, allowedPageOrigins)) {
			event.preventDefault();
		}
	});
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (isAllowedExternalUrl(url)) {
			void shell.openExternal(url);
		}
		return { action: 'deny' };
	});

	void window.loadURL(devServerUrl ?? APP_ENTRY_URL);
	if (isDevelopment) {
		window.webContents.openDevTools();
	}

	window.on('closed', () => {
		mainWindow = null;
	});
	mainWindow = window;
};

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	// Before `ready`, as Electron requires
	protocol.registerSchemesAsPrivileged([
		{ scheme: APP_SCHEME, privileges: { secure: true, standard: true, supportFetchAPI: true } },
	]);

	app.on('second-instance', () => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) {
				mainWindow.restore();
			}
			mainWindow.focus();
		}
	});

	void app.whenReady().then(() => {
		const rendererSession = createRendererSession({
			devServerUrl,
			rendererRoot: path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`),
		});
		createWindow(rendererSession);

		// On macOS, an app stays open with no windows, and clicking its Dock icon opens one again
		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				createWindow(rendererSession);
			}
		});
	});

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') {
			app.quit();
		}
	});
}

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';

import type { IpcMainInvokeEvent } from 'electron';

import { createIpcHandle, isTrustedSender, UntrustedSenderError } from './ipc.js';
import { pageOrigins } from './origins.js';

const origins = pageOrigins();
const mainFrame = { detached: false, frameToken: 'main', processId: 4, url: 'app://renderer/index.html' };

suite('isTrustedSender', () => {
	test("accepts the main window's top frame on the app scheme", () => {
		assert.ok(isTrustedSender({ ...mainFrame }, mainFrame, origins));
	});

	test('refuses a null sender, or no main window', () => {
		assert.equal(isTrustedSender(null, mainFrame, origins), false);
		assert.equal(isTrustedSender({ ...mainFrame }, null, origins), false);
		assert.equal(isTrustedSender({ ...mainFrame }, undefined, origins), false);
	});

	test('refuses another frame, in the same process or another', () => {
		assert.equal(isTrustedSender({ ...mainFrame, frameToken: 'child' }, mainFrame, origins), false);
		assert.equal(isTrustedSender({ ...mainFrame, processId: 5 }, mainFrame, origins), false);
	});

	test('refuses the main frame once it shows another origin, or is detached', () => {
		assert.equal(isTrustedSender({ ...mainFrame, url: 'https://example.org/' }, mainFrame, origins), false);
		assert.equal(isTrustedSender({ ...mainFrame, detached: true }, mainFrame, origins), false);
	});
});

suite('createIpcHandle', () => {
	const register = () => {
		const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
		const handle = createIpcHandle({
			getMainFrame: () => mainFrame,
			ipcMain: { handle: (channel, listener) => void handlers.set(channel, listener) },
			origins,
		});
		return { handle, handlers };
	};
	const eventFrom = (senderFrame: unknown) => ({ senderFrame }) as IpcMainInvokeEvent;

	test("runs the handler for the main window's page", async () => {
		const { handle, handlers } = register();
		handle('add', (_event, a: number, b: number) => a + b);
		assert.equal(await handlers.get('add')?.(eventFrom({ ...mainFrame }), 2, 3), 5);
	});

	test('throws before the handler runs for any other sender', () => {
		const { handle, handlers } = register();
		let ran = false;
		handle('touch', () => {
			ran = true;
		});
		assert.throws(() => handlers.get('touch')?.(eventFrom(null)), UntrustedSenderError);
		assert.throws(
			() => handlers.get('touch')?.(eventFrom({ ...mainFrame, frameToken: 'child' })),
			UntrustedSenderError,
		);
		assert.equal(ran, false);
	});
});

import type { IpcMain, IpcMainInvokeEvent, WebFrameMain } from 'electron';

import { isFromOrigins } from './origins.js';

type Frame = Pick<WebFrameMain, 'detached' | 'frameToken' | 'processId' | 'url'>;

/**
 * Whether an IPC message comes from the main window's top frame, showing a page from one of `origins`.
 * A `null` sender, as when the frame has navigated away or been destroyed, is refused too.
 */
export const isTrustedSender = (
	sender: Frame | null,
	mainFrame: Frame | null | undefined,
	origins: readonly string[],
): boolean =>
	sender !== null &&
	mainFrame !== null &&
	mainFrame !== undefined &&
	!sender.detached &&
	sender.processId === mainFrame.processId &&
	sender.frameToken === mainFrame.frameToken &&
	isFromOrigins(sender.url, origins);

export class UntrustedSenderError extends Error {
	constructor(channel: string) {
		super(`Refused an IPC message on "${channel}" from a sender other than the main window's page`);
		this.name = 'UntrustedSenderError';
	}
}

export type IpcHandler<Args extends unknown[], Result> = (
	event: IpcMainInvokeEvent,
	...args: Args
) => Result | Promise<Result>;

/**
 * Returns the one way this app registers an `ipcMain.handle` handler: every message's sender is checked first.
 */
export const createIpcHandle =
	({
		getMainFrame,
		ipcMain,
		origins,
	}: {
		getMainFrame: () => Frame | null | undefined;
		ipcMain: Pick<IpcMain, 'handle'>;
		origins: readonly string[];
	}) =>
	<Args extends unknown[], Result>(channel: string, handler: IpcHandler<Args, Result>): void => {
		ipcMain.handle(channel, (event, ...args) => {
			if (!isTrustedSender(event.senderFrame, getMainFrame(), origins)) {
				throw new UntrustedSenderError(channel);
			}
			return handler(event, ...(args as Args));
		});
	};

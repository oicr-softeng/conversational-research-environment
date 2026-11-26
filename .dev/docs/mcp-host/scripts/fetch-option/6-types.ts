// Experiment 6: does Electron's net.fetch fit the proposed string-only type, and the SDK's FetchLike?
// Expected: lines assigning Electron's functions to FetchLike fail to type-check; every other line passes.
import { net, type Session } from 'electron';
import type { FetchLike } from '@modelcontextprotocol/client';

type StringOnlyFetch = (input: string, init?: RequestInit) => Promise<Response>;

export const a: StringOnlyFetch = net.fetch;
export const b: StringOnlyFetch = (null as unknown as Session).fetch;
export const c: FetchLike = net.fetch;
export const d: FetchLike = (null as unknown as Session).fetch;
export const e: StringOnlyFetch = fetch;
export const f: FetchLike = fetch;

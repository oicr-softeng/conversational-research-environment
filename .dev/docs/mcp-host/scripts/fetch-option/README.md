# Experiments for the `fetch` option

The scripts behind [`fetch-option.md`](../../fetch-option.md) § 11, which records what each found. Each runs against test servers it starts on `127.0.0.1`, changes no system setting, and prints its results as JSON to standard output. Nothing they print is kept.

| Script                                             | Experiment                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `1-5-redirects-streams-aborts-sessions-errors.cjs` | 1 to 5: redirects and `URL` input, streaming, aborts, a new session's proxy and loopback, and the error for a refused connection     |
| `1-node-follow-baseline.cjs`                       | 1: Node's `fetch` following a redirect across origins with `Authorization`, for comparison                                           |
| `6-types.ts` and `tsconfig.json`                   | 6: type-checking Electron's `fetch` functions against the string-only type and the SDK's `FetchLike`                                 |
| `7-certificates.cjs`                               | 7: `tls.getCACertificates` counts, and Node's `fetch` through an `undici` dispatcher. Prints counts only, never certificate contents |
| `8-proxy-sign-in.cjs`                              | 8: a proxy answering 407, and a server answering 401 with Basic and with `Bearer`                                                    |
| `9-headers.cjs`                                    | 9: the headers each Electron call sends, and removing an `Origin`                                                                    |
| `10-pac.cjs`                                       | 10: a locally served PAC file on a dedicated session, and option D's `ProxyAgent`                                                    |

## Running them

From the repository's root, after `npm ci`. The Electron scripts need `ELECTRON_RUN_AS_NODE` unset, which an editor's terminal may set:

```sh
env -u ELECTRON_RUN_AS_NODE "$(node -p "require('electron')")" .dev/docs/mcp-host/scripts/fetch-option/9-headers.cjs
```

The Node baseline runs with Electron's own Node, so the version matches:

```sh
ELECTRON_RUN_AS_NODE=1 "$(node -p "require('electron')")" .dev/docs/mcp-host/scripts/fetch-option/1-node-follow-baseline.cjs
```

The type check exits with two errors, which are its expected result: Electron's two `fetch` functions don't fit the SDK's `FetchLike`.

```sh
npx tsc -p .dev/docs/mcp-host/scripts/fetch-option/tsconfig.json
```

Each Electron script uses a throwaway profile in the system's temporary directory. Scripts 7 and 10 load the `undici` package from the repository's `node_modules`, which build tooling brings in, not a dependency of the app. Its version must match `process.versions.undici` in Electron's Node, which script 7 prints.

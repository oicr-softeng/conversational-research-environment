# Conversational Research Environment: Desktop App

The CRE's Electron app, `@overture-stack/conversational-research-environment`, built with Electron Forge and Vite on [`@overture-stack/mcp-host-core`](../../modules/mcp-host-core/README.md).

Credentials stay in the main process. The renderer is a sandboxed React page with no network access of its own, so the main process makes every connection for it.

- Design: [MCP Host Plan](../../.dev/docs/mcp-host/mcp-host-plan.md) §2.4 and §2.5

## Requirements

- Node.js 24, with npm 11
- macOS, for `npm run make`

## Development

From the repository root:

```sh
npm ci                              # install
npm start -w apps/desktop           # run the app in development
npm test -w apps/desktop            # run the main process's tests
npm run typecheck -w apps/desktop
npm run lint -w apps/desktop
npm run package -w apps/desktop     # package the app into apps/desktop/out/
npm run make -w apps/desktop        # also build a ZIP and a DMG into apps/desktop/out/make/
```

A terminal inside an Electron-based editor, such as VS Code, can set `ELECTRON_RUN_AS_NODE=1`, which makes Electron run as plain Node. Prefix the commands with `env -u ELECTRON_RUN_AS_NODE` there.

To see host-core and `mcp-client` work against a live model and MCP server, run the [End-to-End Check](../../.dev/docs/mcp-host/README.md#end-to-end-check).

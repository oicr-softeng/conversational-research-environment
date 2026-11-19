# Development guide

## Repository structure

| Path                     | Holds                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/`          | `@overture-stack/conversational-research-environment`: the CRE's Electron app, with `src/main`, `src/preload` and `src/renderer` |
| `modules/mcp-client/`    | `@overture-stack/mcp-client`: one connection to one MCP server over Streamable HTTP, with the server's confirmation loop         |
| `modules/mcp-host-core/` | `@overture-stack/mcp-host-core`: the agent runtime, with the model provider, the tool-calling loop, approvals and events         |
| `scripts/`               | `e2e.ts`, a chat through both modules against a running Arranger, and the Ollama helpers it uses                                 |
| `.dev/`                  | Working documents: the roadmap, tracked tech debt, session logs, and design documents under `.dev/docs/`                         |

All three are private npm workspaces, so nothing here is published.

## Prerequisites

- Node.js 24 with npm 11. Checked with Node 24.21.0 and npm 11.19.

## Setup

Install from the lockfile, from the repository root:

```sh
npm ci
```

## Running the project

Start the app in development, from the repository root:

```sh
npm start -w apps/desktop
```

`npm run package -w apps/desktop` packages it, signed ad-hoc, into `apps/desktop/out/`. `npm run make -w apps/desktop` also builds a ZIP and a DMG from the package, into `apps/desktop/out/make/`.

A shell started by an Electron-based program, such as an editor extension's terminal, can inherit `ELECTRON_RUN_AS_NODE=1`, which makes Electron run as plain Node. Prefix any of these commands with `env -u ELECTRON_RUN_AS_NODE` there.

The app is a shell so far. To watch both modules work together against a live model and MCP server, run the [End-to-End Check](.dev/docs/mcp-host/README.md#end-to-end-check). It needs a running Arranger with its MCP server, and Ollama.

## Running tests

Run each from the repository root:

| Command             | Covers                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run build`     | Builds both modules, `mcp-client` first, since host-core reads its `dist/`                                      |
| `npm run typecheck` | Builds, then type-checks the app, both modules and `scripts/`, so `e2e.ts` is checked against host-core's build |
| `npm test`          | Builds, then runs the tests of the app's main process and both modules                                          |
| `npm run lint`      | Lints the app, both modules and `scripts/` with ESLint                                                          |

`npx prettier --check apps modules scripts` checks formatting.

**Run all four before opening a pull request.** No CI runs them yet.

## Working documents

The `.dev/` directory contains living documents maintained alongside the codebase:

- `.dev/roadmap.md`: planned features and architectural direction; read at session start
- `.dev/tech-debt.md`: known issues, scope-adjacent problems, and deferred work
- `.dev/sessions/`: one file per contributor per day (`YYYY-MM-DDTHHMMSS.md`), brief log of what changed and why
- `.dev/docs/`: design documents, such as `.dev/docs/mcp-host/` for the MCP host's plan, architecture and end-to-end check
- `.dev/docs/atlas/` (the atlas): agent-generated reference material, roadmap depth if this project has opted into the roadmap split, lessons-learned write-ups; indexed at `.dev/docs/atlas/index.md`, kept separate from the design documents above so neither needs to conform to the other's shape

Read the `.dev/` files at the start of each session before beginning work. Read the relevant `.dev/docs/<service>/` guide before deploying or debugging a specific service. Update these at the end of any session that produces meaningful output.

## Troubleshooting

Common environment-specific gotchas, full detail lives in agentics' `template/conventions/agent-troubleshooting.md`:

- **Your agent doesn't see a file you're actively editing.** It reads the filesystem directly and can't see unsaved editor content: save the file first, or paste it directly into the conversation instead. See § "Troubleshooting: agent doesn't see a file you're actively editing."
- **Your agent's memory doesn't follow a project after a rename or a multi-root workspace setup.** Two different failure modes, each with its own fix. See § "Troubleshooting: agent won't load, or its memory doesn't follow a project, after a rename or multi-root adoption."

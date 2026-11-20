# Conversational Research Environment

The Conversational Research Environment (CRE) is a notebook-style desktop app that researchers run on their own machines. A researcher asks questions about research data in plain language. A model they choose answers by calling tools on MCP (Model Context Protocol) servers they configure, such as Arranger's.

This repository holds the app and the two modules it is built on:

| Path                                                       | What it is                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`apps/desktop`](apps/desktop/README.md)                   | The CRE's Electron app                                                                                                         |
| [`modules/mcp-host-core`](modules/mcp-host-core/README.md) | The agent runtime: it drives the model through a tool-calling loop, and hands each approval and server confirmation to the app |
| [`modules/mcp-client`](modules/mcp-client/README.md)       | One connection to one MCP server                                                                                               |

## Documentation

- [Development guide](DEVELOPMENT.md): setup, running the app, and the checks to run before opening a pull request
- [MCP host design](.dev/docs/mcp-host/README.md): the plan and architecture behind the app and both modules, and the End-to-End Check
- [Roadmap](.dev/roadmap.md) and [tech debt](.dev/tech-debt.md): what is planned next, and known issues

## Development Requirements

- [Node.js](https://nodejs.org/) 24, with npm 11
- macOS, to build the app's ZIP and DMG
- For the End-to-End Check only: a running Arranger with its MCP server, and [Ollama](https://ollama.com/)

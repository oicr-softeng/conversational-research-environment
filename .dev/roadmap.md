# Roadmap

No focus set yet.

## MCP host modules and desktop app

_Priority: not yet set. Phase 5's migration is done: the modules, design documents and tech debt moved from Arranger in [#1](https://github.com/oicr-softeng/conversational-research-environment/pull/1). Next: scaffolding `apps/desktop`, then packaging, signing, updates and platforms. Phase 3 (`chat`) and Phase 4 (`eval`) stay deferred._

`mcp-client` and `mcp-host-core` connect to MCP servers, run a model through a tool-calling loop, and put every server confirmation in front of a person. `apps/desktop`, the CRE's Electron app, is built on them.

**Recommended, pending the team:** no release claims support for controlled data until the plan's open security questions are settled and built.

[Detail: components, phases, decisions and open questions](docs/mcp-host/mcp-host-plan.md)

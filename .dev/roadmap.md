# Roadmap

No focus set yet.

## MCP host modules and desktop app

_Priority: not yet set. Phase 5's migration is done: the modules, design documents and tech debt moved from Arranger in [#1](https://github.com/oicr-softeng/conversational-research-environment/pull/1). `apps/desktop` is scaffolded, hardened and signed ad-hoc for macOS. Next: a `fetch` option on both modules, `mcp-client`'s hardening entries and trimming host-core's exported surface, all in [tech debt](tech-debt.md), then packaging, signing, updates and platforms. Phase 3 (`chat`) and Phase 4 (`eval`) stay deferred._

`mcp-client` and `mcp-host-core` connect to MCP servers, run a model through a tool-calling loop, and put every server confirmation in front of a person. `apps/desktop`, the CRE's Electron app, is built on them.

**Recommended, pending the team:** no release claims support for controlled data until the plan's open security questions are settled and built.

[Detail: components, phases, decisions and open questions](docs/mcp-host/mcp-host-plan.md)

## CI/CD

_Priority: not yet set. Not started: until it runs, the four root checks in [`DEVELOPMENT.md`](../DEVELOPMENT.md#running-tests) run locally before every pull request._

[Detail: what each pipeline needs](docs/atlas/roadmap/ci-cd.md)

## Release prerequisites

_Priority: not yet set. Not started, so builds are for development only._

Before any build reaches people outside development, the app needs a final product name in place of the interim "Conversational Research Environment", a bundle ID, and an Apple Developer ID to sign and notarize with. The Developer ID enrolment takes time of its own.

[Detail: why each blocks a release](docs/atlas/roadmap/release-prerequisites.md)

# Tech debt

## modules/mcp-client

### Output validation must bound its running time for a server's schema

**File:** `modules/mcp-client/src/outputValidation.ts`
**Severity:** blocks publishing `mcp-client` (MCP host plan §4.1), and must be fixed before the CRE desktop app ships, since users can add their own servers (plan §2.4)
**Kind:** hardening
**Issue:** A tool's `outputSchema` comes from the server, and validating `structuredContent` against it must finish within a bounded time whatever the schema says. The size and depth limits bound compiling, not validating.
**Fix:** Run validation under a time limit, for example in a worker, or configure Ajv's regular expressions with a linear-time engine. Report a validation that does not finish as `output_invalid`. Test that it ends within the limit.
**Standalone:** yes

### Responses from a server must have a size limit

**File:** `modules/mcp-client/src/fetch.ts` (`toSdkFetch`)
**Severity:** blocks publishing `mcp-client` (MCP host plan §4.1), and must be fixed before the CRE desktop app ships, since users can add their own servers (plan §2.4)
**Kind:** hardening
**Issue:** A response body must be bounded before the SDK parses it, for list results, call results and OAuth responses alike.
**Fix:** In `toSdkFetch`, which every request goes through, stop reading past a configured byte limit and report that as `transport_error`. Past the limit, abort the request through an `AbortController` joined to the caller's signal, not only cancel the body: under Electron's `net.fetch`, a cancelled body leaves the connection open ([`fetch-option.md`](docs/mcp-host/fetch-option.md#8-fixes-needed-under-every-option) §8). Cap each event of an event stream, not the stream's total, since a change-notification stream stays open for the client's life. Set the limit to allow an Arranger tool result of about 15 MiB. Test with an oversized `tools/list` and an oversized tool result, and that each ends the connection.
**Standalone:** yes

### An elicitation's `requestedSchema` must have a depth and size limit

**File:** `modules/mcp-client/src/confirmationLoop.ts` (`isFormQuestion`)
**Severity:** blocks publishing `mcp-client` (MCP host plan §4.1), and must be fixed before the CRE desktop app ships, since users can add their own servers (plan §2.4)
**Kind:** hardening
**Issue:** A form-mode elicitation's `requestedSchema` comes from the server, and `isFormQuestion` checks only that it is an object. Host-core passes it unchanged to the input resolver and in the `INPUT_REQUIRED` event. A deeply nested schema from a buggy or hostile server could exhaust a form renderer that recurses over it. A tool's `outputSchema`, the same kind of untrusted schema, is already refused past `MAX_OUTPUT_SCHEMA_DEPTH` and `MAX_OUTPUT_SCHEMA_BYTES` in `outputValidation.ts`.
**Fix:** Apply the same two limits to `requestedSchema` before the person is asked anything, and end the call as `input_failed` past either, as `formQuestions` does for a malformed request. Test with a schema past each limit.
**Standalone:** yes

### Export the `fetch` wrapper once the app calls the SDK's sign-in code itself

**File:** `modules/mcp-client/src/fetch.ts` (`toSdkFetch`)
**Severity:** low until the app calls the SDK's sign-in code outside a server connection
**Kind:** API surface
**Issue:** A connection sends every request through `toSdkFetch`, sign-in included, so each gets the scheme check and, once built, the size limit. SDK sign-in code called outside a connection, such as `auth()` from a sign-in button, `CrossAppAccessProvider` or the grant helpers, takes its own `fetch`, defaulting to the global one, so its requests get neither.
**Fix:** When the app first calls such code, export `toSdkFetch` from the index, and pass that code the app's network function wrapped by it.
**Standalone:** no; no current design calls such code

### `wireMs` overstates server time, which the evaluation harness would read it as

**File:** `modules/mcp-client/src/outcomes.ts` (`CallTiming`), `modules/mcp-client/src/confirmationLoop.ts`
**Severity:** low until the evaluation harness is built (MCP host plan, Phase 4)
**Kind:** measurement
**Issue:** `wireMs` is all of a call's time outside the resolver, including the 250 ms pause before each round without questions and the time `onRound` takes. Read as the harness's `serverLatency` (Arranger's [`.dev/docs/mcp-platform-testing.md`](https://github.com/overture-stack/arranger/blob/main/.dev/docs/mcp-platform-testing.md)), it overstates the server's time on any call with confirmation rounds.
**Fix:** Time each request leg separately and report their sum beside `wireMs`, or report the pauses and `onRound` time as their own fields so the harness can subtract them.
**Standalone:** no; decide with the harness's metric definitions when Phase 4 resumes

---

## modules/mcp-host-core

### Trim the exported surface before `mcp-host-core` is published

**File:** `modules/mcp-host-core/src/index.ts`
**Severity:** low until the module is published
**Kind:** API surface
**Issue:** The index exports helpers a consumer rarely needs, such as `TOOL_MESSAGES`, `reduceToolName`, `carriedLabel` and `MAX_ERROR_BODY_CHARS`, and every public vocabulary in `constants.ts`, from `EVENT_TYPES` to `LEFT_OUT_REASONS`. If the MCP host plan's question 3 settles on `apps/mcp-eval` with a published, pinned host-core, every export becomes API whose change needs a new major version.
**Fix:** Before the first publish, keep what `chat`, `eval` and the CRE main process actually import, and move the rest out of the index.
**Standalone:** no; decide with the plan's question 3, before host-core is first published

### Responses from the model endpoint must have a size limit

**File:** `modules/mcp-host-core/src/providers/openAiCompatible.ts` (`generate`, `#native`)
**Severity:** must be fixed before the CRE desktop app ships, since the person configures the model endpoint as they do a server (MCP host plan §2.4)
**Kind:** hardening
**Issue:** Each event of a streamed reply is bounded by `MAX_EVENT_BYTES`, but nothing bounds the rest of what the provider reads: a streamed reply as a whole, since `max_tokens` is a request an endpoint can ignore; a reply that isn't streamed, read with `response.json()`; an error body, read whole with `response.text()` before being cut to `MAX_ERROR_BODY_CHARS`; and Ollama's `/api/ps` and `/api/tags`, read with `response.json()`. `mcp-client`'s size limit covers only MCP servers.
**Fix:** Bound each read by bytes, and report a reply past the limit as a model error. Read at most `MAX_ERROR_BODY_CHARS` worth of an error body. Past any limit, abort the request through the provider's own `AbortController`, joined to the caller's signal: under Electron's `net.fetch`, only cancelling the body leaves the connection open ([`fetch-option.md`](docs/mcp-host/fetch-option.md#8-fixes-needed-under-every-option) §8). Apply the limit inside the provider, so it holds whatever `fetch` the app passes in. Test with an oversized streamed reply, an oversized whole reply and an oversized error body, and that each ends the connection.
**Standalone:** yes

### Servers are ordered by when they connected, not by their configuration

**File:** `modules/mcp-host-core/src/connections.ts` (`connect`, `all`), `src/host.ts` (`create`)
**Severity:** low
**Kind:** determinism
**Issue:** `create` connects every server in parallel, and each joins the connection map when its own connect resolves, so the registry, the model surface, `run_started` and `content_carried` list servers in the order they finished connecting. `buildRegistry`'s doc promises configuration order. Two hosts with the same configuration can offer the model its tools in different orders, which works against comparing transcripts across runs. It affects only conversations with more than one server, which now requires every server to be flagged `containsOnlyOpenData`. Reproduced with two in-process test servers, one behind a proxy that delays each request by 300 ms: whichever server was delayed came last in the tool list, `run_started` and `content_carried`, whatever its place in the configuration.
**Fix:** Keep the configuration's order, such as by reserving each key's slot in `options.servers` order before connecting, or by ordering `Connections.all()` by it.
**Standalone:** yes

### Re-reading a changed surface between turns never reconnects

**File:** `modules/mcp-host-core/src/connections.ts` (`refreshStale`, `refreshAll`)
**Severity:** low
**Kind:** behaviour
**Issue:** `refreshAll`, at the start of each run, reconnects once when a surface read throws `ReconnectRequiredError`. `refreshStale`, between turns, records the same error in `tools_changed` and keeps the server's previous tools until the next run re-reads it. Nothing records whether the difference is intended.
**Fix:** Decide whether a between-turn read should reconnect too; if so, give `refreshStale` the same single attempt, and otherwise say why in its doc.
**Standalone:** yes

### A policy's `deny` reaches the model as the user declining

**File:** `modules/mcp-host-core/src/toolMessages.ts` (`toolMessageFor`, `TOOL_MESSAGES.denied`)
**Severity:** low
**Kind:** model-facing wording
**Issue:** Every `denied` outcome gets "The user declined the call", whether `by` is `person`, `timeout`, `policy` or `policy_error`, so a call the policy denied without asking anyone tells the model a person refused it.
**Fix:** Give `denied` a fixed wording for each `by`, such as "The call was not permitted" for a policy, so the model is told what happened and transcripts still compare.
**Standalone:** yes

## apps/desktop

### Move the app's network function to option C when a trigger fires

**File:** `apps/desktop/src/main/`, the function that hands both modules Electron's `net.fetch`
**Severity:** low until a trigger fires
**Kind:** networking
**Issue:** Under option B, `net.fetch` on an in-memory session, a request fails on any redirect, same-origin ones included, and can't answer a proxy that asks for a username and password ([`fetch-option.md`](docs/mcp-host/fetch-option.md#3-what-electrons-network-stack-does) §3, findings 1 and 5).
**Fix:** Replace the function with option C, the app's own `fetch` on `net.request`, once one of [`fetch-option.md`](docs/mcp-host/fetch-option.md#10-decision) §10's triggers fires: a server redirects in a way the person can't avoid by typing a different address, the deployment's Keycloak redirects an address the SDK calls, or a target network's proxy asks for a username and password. Check the deployment's Keycloak before authenticated Arranger ships. The modules need no change.
**Standalone:** no; the function comes with connecting host-core to the app's main process (roadmap, "MCP host modules and desktop app")

## Dependencies

### `npm audit` baseline, established 2026-11-19

**Severity:** informational, since neither advisory reaches the shipped app
**Kind:** reference
**Issue:** `npm audit` reports two advisories, both in build tools, and none in the production tree:

| Scope                          | high | low | total |
| ------------------------------ | ---- | --- | ----- |
| Full tree                      | 4    | 1   | 5     |
| Production only (`--omit=dev`) | 0    | 0   | 0     |

- **`image-size`, high ([GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)), no fix available:** its ICNS parser can loop forever. It counts four times, once for each package in the chain from `@electron-forge/maker-dmg` through `electron-installer-dmg` and `appdmg`. The DMG maker runs it only at build time, on this repository's own icons.
- **`esbuild` 0.27.7 under `tsup`, low ([GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)):** it concerns esbuild's development server on Windows, which `tsup` builds never start. The affected range is 0.27.3 to 0.28.0.

**Fix:** For `esbuild`, either `npm audit fix`, which installs 0.27.2 within `tsup` 8.5.1's `^0.27.0`, or an upgrade to `tsup` 9, which asks for `^0.28.2`. For `image-size`, nothing until `appdmg` depends on a fixed version. Re-run `npm audit` and `npm audit --omit=dev` after either change, and update this baseline.
**Standalone:** yes

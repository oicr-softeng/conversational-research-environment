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

**File:** `modules/mcp-client/src/client.ts` (the transport)
**Severity:** blocks publishing `mcp-client` (MCP host plan §4.1), and must be fixed before the CRE desktop app ships, since users can add their own servers (plan §2.4)
**Kind:** hardening
**Issue:** A response body must be bounded before the SDK parses it, for list results and call results alike.
**Fix:** Give the transport a `fetch` (its `fetch` option) that stops reading past a configured byte limit, and report that as `transport_error`. Test with an oversized `tools/list` and an oversized tool result.
**Standalone:** yes

### An elicitation's `requestedSchema` must have a depth and size limit

**File:** `modules/mcp-client/src/confirmationLoop.ts` (`isFormQuestion`)
**Severity:** blocks publishing `mcp-client` (MCP host plan §4.1), and must be fixed before the CRE desktop app ships, since users can add their own servers (plan §2.4)
**Kind:** hardening
**Issue:** A form-mode elicitation's `requestedSchema` comes from the server, and `isFormQuestion` checks only that it is an object. Host-core passes it unchanged to the input resolver and in the `INPUT_REQUIRED` event. A deeply nested schema from a buggy or hostile server could exhaust a form renderer that recurses over it. A tool's `outputSchema`, the same kind of untrusted schema, is already refused past `MAX_OUTPUT_SCHEMA_DEPTH` and `MAX_OUTPUT_SCHEMA_BYTES` in `outputValidation.ts`.
**Fix:** Apply the same two limits to `requestedSchema` before the person is asked anything, and end the call as `input_failed` past either, as `formQuestions` does for a malformed request. Test with a schema past each limit.
**Standalone:** yes

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

# MCP Host: How the Desktop App Makes Its Network Requests

The Conversational Research Environment (CRE) desktop app's main process sends every request to the model and to MCP servers through Node's `fetch`. Node's `fetch` ignores the computer's proxy settings and its trusted certificates, so on a network that needs either, the app can't connect while the person's browser can. This document records the options weighed for fixing that, the evidence for each, and the decision.

**For:** developers of the desktop app and of `mcp-client` and `mcp-host-core`, implementing the fix or revisiting it when one of its triggers fires ([§10](#10-decision)).

**Status:** decisions 1 to 4 decided 2026-11-25; decision 5 recommended.

| Decision                              | Choice                                                                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. What the app hands the modules     | **B now, C when a need appears:** Electron's `net.fetch` on a dedicated in-memory session, wrapped by the app. Move to the app's own `fetch` on `net.request` when one of [§10](#10-decision)'s triggers fires |
| 2. How the model provider receives it | Its constructor, `OpenAiCompatibleOptions.fetch`                                                                                                                                                               |
| 3. How MCP connections receive it     | One `McpHostOptions.fetch` for the whole host, kept out of each server's `ServerConfig.connection`                                                                                                             |
| 4. The option's type                  | String-only, `(input: string, init?: RequestInit) => Promise<Response>`                                                                                                                                        |
| 5. How to check it works              | Recommended: shared scenarios, run against Node's `fetch` in module tests, against the app's function in `tsx --test` unit tests with Electron's API passed in, and in a script run under Electron             |

**Evidence.** Each claim is marked:

- **verified:** read in this repository's code, or in Electron's, Node's or the MCP SDK's source or documentation;
- **measured:** run, in the experiments of [§11](#11-experiments) or against Arranger's MCP server;
- **computed:** worked out from Arranger's code and data, not run;
- **inferred:** reasoned to, neither read nor run.

**Environment.** Measured on macOS, on 2026-11-25, with Electron 45.3.4 (Chromium 156.0.8078.100, Node 24.22.3) and `@modelcontextprotocol/client` 2.4.0, against test servers on `127.0.0.1`. The machine had no proxy configured, and no system setting was changed.

---

## 1. Terms

| Term                 | What it is                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `net.fetch`          | Electron's `fetch`, which sends requests through Chromium's network stack rather than Node's. Each session has its own, `session.fetch`                              |
| `net.request`        | The lower-level Electron call underneath `net.fetch`. It exposes events `net.fetch` ignores, such as a redirect or a proxy's request for credentials                 |
| Session              | Electron's container for a network configuration, cookies and cache. `session.fromPartition(name)` without the `persist:` prefix makes one that lives in memory only |
| PAC file             | A proxy auto-configuration script, which names a proxy, or `DIRECT`, for each address                                                                                |
| Ingress              | The proxy in front of a deployed service, which terminates TLS and routes requests to it. It can answer with a redirect itself, such as from `http` to `https`       |
| Shim                 | One of the MCP SDK's builds for a runtime, `node` or `browser`, chosen by the bundler through the SDK's package exports                                              |
| Fuses                | Electron switches flipped in a packaged app's binary, which can disable features such as `NODE_OPTIONS`                                                              |
| Manual redirect mode | `redirect: 'manual'`, which asks `fetch` to hand a redirect back to the caller rather than follow it. Both modules use it for every request                          |

---

## 2. The problem

### Which requests are affected

| Request                                                            | Sent by                                                      | Before the `fetch` option                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The conversation, to the model                                     | `OpenAiCompatibleProvider` in `mcp-host-core`                | The global `fetch`, in `generate` and `#native` ([openAiCompatible.ts](../../../modules/mcp-host-core/src/providers/openAiCompatible.ts)) |
| Tool calls and lists, to each MCP server                           | `McpClient` in `mcp-client`, through the MCP SDK's transport | The global `fetch`, since `mcp-client` gave the transport none ([client.ts](../../../modules/mcp-client/src/client.ts), `connect`)        |
| OAuth discovery, registration and token requests for an MCP server | The same SDK transport                                       | The same `fetch`                                                                                                                          |

All of it runs in Electron's main process, which is Node, and neither module lets its caller choose the `fetch`. **Verified.**

### Why that fails on institutional networks

Institutional networks often need one or both of these:

- **A proxy.** Outside requests go through a named server, usually set in the operating system's network settings or a PAC file. Some proxies ask for a username and password, or for the person's Windows or Kerberos sign-in.
- **A private certificate authority.** The institution installs its own root certificate, often so that a proxy can decrypt and inspect TLS traffic. A program that doesn't trust that root rejects every HTTPS connection.

Where each comes up, **inferred** from how such networks are commonly run:

| Network                                                                                                    | What it needs                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hospitals, health-research institutes, government                                                          | A mandatory proxy, set by a PAC file or automatic discovery through device management, often signed in with the person's Windows account                 |
| Organizations with a secure web gateway that inspects TLS                                                  | The gateway's root certificate. When the gateway's own client routes traffic, there is no proxy setting, so only the certificate problem shows           |
| Secure research environments, such as trusted research environments and data safe havens                   | A proxy that allows only listed destinations                                                                                                             |
| Any network with internal services, such as an on-premises model server or an internal Arranger deployment | The institution's certificate authority, which signed those services' certificates. Probably the most common case, since it fails with no proxy anywhere |
| Home networks, most university staff networks, `localhost`                                                 | Nothing                                                                                                                                                  |

Node's `fetch` in Electron's main process trusts only Node's 118 bundled certificates, not the system's (**measured**, experiment 7), and reads no system proxy setting (**inferred** from Node's documentation). Node's own remedies for proxies, `HTTPS_PROXY` with `NODE_USE_ENV_PROXY`, and for certificates, `NODE_EXTRA_CA_CERTS` and `--use-system-ca`, are set before launch, and none reads a PAC file, so they don't suit a desktop app's users. The exception is `tls.setDefaultCACertificates`, available at run time in Electron's Node 24.22.3 (**verified**), which only option D can use. `net.fetch` goes through Chromium's network stack, which uses both, as the browser does.

### What a fix must not break

Each holds under Node's `fetch`:

| Behaviour                                                                                                                             | Where                                                                                                                                                                                                                                                                                                              | Why it matters                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| The provider never follows a redirect, and reports its status and target                                                              | `redirect: 'manual'` on both of the provider's requests, and `redirectNote`, in [openAiCompatible.ts](../../../modules/mcp-host-core/src/providers/openAiCompatible.ts). A recorded decision ([architecture.md](../../../modules/mcp-host-core/docs/architecture.md#the-openai-compatible-provider), under Errors) | Following one would re-send the whole conversation elsewhere       |
| The SDK follows a redirect only within the same origin, or from `http` to `https` on the same host, and names the target of any other | The SDK's `fetchWithinOrigin` and `unfollowedRedirect`                                                                                                                                                                                                                                                             | Credentials never follow a redirect to another server              |
| Replies stream as they arrive                                                                                                         | The provider's `generate`, and the SDK's event-stream reader                                                                                                                                                                                                                                                       | The person sees the reply as it is written                         |
| Aborts, timeouts and network failures are told apart                                                                                  | The provider, and `mcp-client`'s [outcomes.ts:184-187](../../../modules/mcp-client/src/outcomes.ts)                                                                                                                                                                                                                | The person and the evaluation harness can see why a request failed |
| No cookies are kept and nothing is cached                                                                                             | Node's `fetch` has neither                                                                                                                                                                                                                                                                                         | Nothing persists outside the app's encrypted saved state           |
| Only `http:` and `https:` are reachable                                                                                               | Node's `fetch` refuses `file:`                                                                                                                                                                                                                                                                                     | A URL can't make the app read a local file                         |

---

## 3. What Electron's network stack does

Each finding below is numbered, and the rest of the document cites it by number.

1. **In manual redirect mode, a redirect makes `net.fetch` reject, with no response.**
    - Both modules use manual mode for every request: the provider in `generate` and `#native` ([openAiCompatible.ts](../../../modules/mcp-host-core/src/providers/openAiCompatible.ts)), and the SDK for every MCP, discovery, token and registration request (`@modelcontextprotocol/client` 2.4.0, `dist/src-CeKsbNLO.mjs:6854-6873` and `dist/public-CvV4ZHkX.mjs:992`, `:1267`, `:1442`). **Verified.**
    - `net.fetch` registers no redirect listener ([net-fetch.ts L87-L98](https://github.com/electron/electron/blob/v45.3.4/lib/browser/api/net-fetch.ts#L87-L98)), so the request is cancelled with `Error('Redirect was cancelled')` ([net-client-request.ts L493-L505](https://github.com/electron/electron/blob/v45.3.4/lib/common/api/net-client-request.ts#L493-L505)). **Verified**, and **measured** (experiment 1): a same-origin 307 answering a POST rejected this way, where Node's `fetch` returned the 307 with its `Location`.
    - Nothing becomes unsafe, since no redirect reaches another server. But same-origin redirects stop working, and the error no longer names the status or the target.
2. **On the default session, `net.fetch` sends and keeps cookies, and caches responses.** With no `Origin` header, a request goes out with `credentials: 'include'` and the default cache mode ([net-fetch.ts L83-L94](https://github.com/electron/electron/blob/v45.3.4/lib/browser/api/net-fetch.ts#L83-L94)). **Verified.** The default session persists to disk, so a server's cookie would outlive the conversation. **Inferred.**
3. **`net.fetch` reaches `file:` and custom schemes.** It is documented, and in the source ([net-fetch.ts L88](https://github.com/electron/electron/blob/v45.3.4/lib/browser/api/net-fetch.ts#L88)). The SDK's OAuth discovery fetches addresses named by the server (`dist/public-CvV4ZHkX.mjs:668-698`, `:958`). Neither module checked a URL's scheme before the `fetch` option added [§8](#8-fixes-needed-under-every-option)'s check. **Verified.**
4. **`net.fetch` rejects a failed connection with a plain `Error`, not a `TypeError`** ([net-client-request.ts L475-L478](https://github.com/electron/electron/blob/v45.3.4/lib/common/api/net-client-request.ts#L475-L478)). `mcp-client` counts only a `TypeError` as `network`, so proxy and certificate failures would show as `unknown`. The provider counts any failure as `network`. **Verified.** **Measured** (experiment 5): `net.fetch`, a session's `fetch` and `net.request` all gave `Error('net::ERR_CONNECTION_REFUSED')` for a closed port, and `net::ERR_NAME_NOT_RESOLVED` for an unknown host. Node gave `TypeError('fetch failed')`.
    - While fetching an MCP server's protected-resource metadata, the SDK swallows any failure but a `TypeError`, and falls back to the server's own origin as the authorization server (`dist/public-CvV4ZHkX.mjs:1179-1187` and `:684-688`). **Verified.** So a proxy or certificate failure there reads as "no OAuth metadata", and its cause is lost. Against Arranger's MCP server, the fallback gets a 404.
    - The app's function rethrows `net.fetch`'s failures as `TypeError` for this reason. The modules convert no errors, and the `Fetch` type's documentation states the contract.
5. **`net.fetch` can't answer a proxy asking for a username and password.** **Measured** (experiment 8), against a local proxy answering 407 with Basic authentication:
    - For an `https:` address, which is every real request, `net.fetch` rejects with `Error('net::ERR_TUNNEL_CONNECTION_FAILED')`. For `http:`, it returns the 407.
    - `net.request`'s `'login'` event receives the challenge, with `isProxy: true` and the proxy's host, port, scheme and realm, for `http:` and for an `https:` tunnel. Answering it retries with the credentials; cancelling it returns the 407. `app`'s `'login'` event covers only windows and utility processes.
    - The session remembers credentials once given: a later `net.fetch` on the same session went through the proxy with them, unasked.
    - `'login'` also fires when a server itself asks for Basic credentials, with `isProxy: false`. It doesn't fire for a server's `Bearer` 401, which reaches the caller unchanged, `WWW-Authenticate` included.
    - Windows or Kerberos sign-in is handled inside Chromium's network stack, not through `'login'`, and may need `session.allowNTLMCredentialsForDomains`. Untested. **Inferred.**
6. **No `Origin` header is sent, as with Node's `fetch`, but other headers differ.** **Measured** (experiment 9), for POST and GET, on the default and an in-memory session:
    - `net.fetch`, a session's `fetch` and `net.request` sent no `Origin`, `Referer` or `Cookie`. Electron sets an origin only when the caller gives one ([electron_api_url_loader.cc L685-L689](https://github.com/electron/electron/blob/v45.3.4/shell/common/api/electron_api_url_loader.cc#L685-L689)).
    - They send Chrome's `User-Agent`, ending `Electron/45.3.4`, with `Sec-Fetch-Site: none`, `Sec-Fetch-Mode: no-cors` and `Sec-Fetch-Dest: empty`. Node's `fetch` sends `User-Agent: node` and `Sec-Fetch-Mode: cors`. A server or firewall that treats browser-like requests differently could tell them apart; the app can set its own agent with `session.setUserAgent`. **Inferred.**
    - `webRequest.onBeforeSendHeaders` on a dedicated session sees the main process's requests, and removed an `Origin` from a `net.request` POST.
    - An `Origin` given to `net.fetch` turns it into a cross-origin request: Chromium sent a preflight `OPTIONS` and failed with `net::ERR_FAILED`. So the app must never set one.
    - Only plain HTTP to `127.0.0.1` was tried. That HTTPS and remote hosts behave the same is **inferred**, since the origin comes from the caller, not the URL.
7. **In follow mode, `net.fetch` sends the `Authorization` header on to another origin.** **Measured** (experiment 1): a POST carrying `Authorization: Bearer …`, redirected by a 307 from `127.0.0.1` to `localhost`, arrived at `localhost` with the header. Node's `fetch` dropped it. Follow is `net.fetch`'s default, so any code calling it with a token and no `redirect` setting can hand that token to whatever server a redirect names. The response also reported `redirected: false`, one of the fields Electron documents as unreliable.
8. **Chromium evaluates a PAC file and routes by it on a dedicated session.** **Measured** (experiment 10), with a PAC file served locally and set by `session.setProxy({ mode: 'pac_script' })`, so the default session and system settings were untouched:
    - `resolveProxy` returned each host's PAC answer, and `net.fetch` and `net.request` went where it said: through the proxy, `DIRECT`, or for `https:`, a `CONNECT` tunnel to port 443.
    - With two proxies listed and the first down, the request fell back to the second by itself.
    - Loopback goes direct, even when the PAC file names a proxy for it: `resolveProxy` reported `DIRECT` for `127.0.0.1` and `localhost`, and the request reached the local server.
    - Not measured: whether a session picks up a PAC file or proxy configured in the operating system. **Inferred.**

These behave as they should, **measured**:

- **Streaming** (experiment 2): events sent 500 ms apart arrived 500 ms apart, on the default and an in-memory session.
- **`URL` input** (experiment 1): the SDK passes `URL` objects, and one with a query string reached the server intact.
- **Aborts** (experiment 3): aborting mid-stream rejected the next read within 1 ms, and the server saw the connection close, as with Node's `fetch`. Electron's error is its own `AbortError` class rather than a `DOMException`, but both modules check `signal.aborted` rather than the error's class. **Verified.**
- **Pausing an unread body:** `net.fetch`'s body is `Readable.toWeb` over `net.request`'s response, which pauses the download while nothing reads it. That response has no `_destroy` that aborts the request, so cancelling the body leaves the connection open, paused ([net-fetch.ts](https://github.com/electron/electron/blob/v45.3.4/lib/browser/api/net-fetch.ts), [net-client-request.ts L33-L122](https://github.com/electron/electron/blob/v45.3.4/lib/common/api/net-client-request.ts#L33-L122)). **Verified**, with the open connection **inferred**. An abort closes it.

### What losing redirects costs (finding 1)

| Request and redirect                          | Under Node's `fetch`                                                                                                    | Under `net.fetch`                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| To the model, any redirect                    | Not followed. The error names the status and target, and suggests `https` in `baseUrl` for an `http`-to-`https` upgrade | Fails, with no status, target or hint |
| MCP POST, 307 or 308, same origin             | Followed                                                                                                                | Fails                                 |
| MCP POST, any other redirect                  | Not followed. The SDK's error names the target to use instead                                                           | Fails, with no target                 |
| OAuth discovery GET, any same-origin redirect | Followed                                                                                                                | Fails                                 |

The SDK follows a POST only on 307 or 308, since 301 to 303 may turn it into a GET (`keepsMethod`, `dist/src-CeKsbNLO.mjs:6868`). **Verified.**

A redirect happens, **inferred**, when:

- an address typed with `http` reaches a server that upgrades to `https`;
- a path lacks a trailing slash, as Python MCP servers built on Starlette send `/mcp` to `/mcp/`;
- a server has moved;
- a TLS-inspecting gateway sends a person who isn't signed in to its sign-in page.

Every request still fails closed. The cost is that a server reachable only through a same-origin redirect stops working, and the person can't see the address to use instead.

---

## 4. Decision 1: what the app hands the modules

### The options

**A. `net.fetch` on the default session.** One line in the app. It has every weakness of B below, and also keeps cookies and cached responses on disk (finding 2).

**B. `net.fetch` on a dedicated in-memory session, wrapped by the app.** The app creates a session with `session.fromPartition`, without `persist:`, and passes a function that calls that session's `fetch` with `credentials: 'omit'`, `cache: 'no-store'` and manual redirect mode. The function catches `net.fetch`'s rejections and rethrows them as `TypeError`, leaving aborts alone, and turns "Redirect was cancelled" into a message that names a redirect and suggests checking for `https` or a trailing slash. So the modules never see Electron's errors.

**B with redirect capture.** B, plus `webRequest.onBeforeRedirect` on the session, which reports the status and the resolved target in the same millisecond as the rejection (**measured**, experiment 1). The app's function matches each event to its request through a marker header, and builds a 3xx response from it.

**C. The app's own `fetch` on `net.request`, on a dedicated in-memory session.** It behaves like the Node `fetch` the modules are tested against:

- it returns a redirect as a 3xx response with its `Location`;
- it rejects a failed connection as a `TypeError` carrying Electron's `net::ERR_*` message;
- it rejects an abort as an `AbortError`;
- it can ask the person for a proxy's username and password.

`net.request` accepts only `http:` and `https:` unless told otherwise ([net-client-request.ts L356-L357](https://github.com/electron/electron/blob/v45.3.4/lib/common/api/net-client-request.ts#L356-L357)). **Verified.**

**D. Node's `fetch`, given the system's proxy and certificates.** For each request, the app:

1. asks Electron which proxy Chromium would use, with `session.resolveProxy(url)`, which evaluates PAC files and system settings;
2. connects through it, or directly, with an `undici` dispatcher, Node's option for choosing how `fetch` connects;
3. trusts Node's bundled certificates plus the system's, from `tls.getCACertificates('default')` and `('system')`, either in each dispatcher's `ca` list or once for the process with `tls.setDefaultCACertificates`, which Node's documentation says applies to later connections that name no certificates of their own. That Node's `fetch` picks it up is **inferred**.

Both certificate lists are needed: a `ca` list, like `tls.setDefaultCACertificates`, replaces Node's default rather than adding to it, and the system list on the test machine held only 5 certificates, none among Node's 118 bundled ones (**measured**, experiment 7). Electron's Node accepted a dispatcher from the `undici` package at Node's own version, 7.30.2 (experiment 7). A `ProxyAgent` built from `resolveProxy`'s answer under a PAC file reached the proxy, but only with `proxyTunnel: false` for plain `http:`, since by default it tunnels even those with `CONNECT` to port 80, which many proxies refuse (**measured** and **inferred**, experiment 10). Chromium falls back through a PAC answer's list by itself; under D, the app must.

**E. Do nothing.** The CRE stays unusable on networks that need a proxy or a private certificate authority.

### Comparison

|                                                                   | A                 | B                               | C                       | D                                       |
| ----------------------------------------------------------------- | ----------------- | ------------------------------- | ----------------------- | --------------------------------------- |
| PAC evaluation and routing                                        | yes, **inferred** | yes, measured                   | yes, measured           | yes, measured; the app handles fallback |
| The operating system's own proxy settings                         | yes, **inferred** | yes, **inferred**               | yes, **inferred**       | yes, **inferred**                       |
| Proxy that asks for a username and password                       | no, measured      | no, measured                    | yes, measured for Basic | Basic only                              |
| Windows or Kerberos proxy sign-in                                 | yes, **inferred** | as A                            | as A                    | no                                      |
| System certificates                                               | yes, **inferred** | yes, **inferred**               | yes, **inferred**       | read, measured; connection untested     |
| Same-origin redirects followed, others reported with their target | no                | no (yes with capture)           | yes                     | yes                                     |
| MCP network failures shown as `network`                           | no                | yes, through the app's function | yes                     | yes                                     |
| No cookies, no cache                                              | no                | yes                             | yes                     | yes                                     |
| Refuses `file:` without help from the modules                     | no                | no                              | yes                     | yes                                     |
| No `Origin` header                                                | yes, measured     | yes, measured                   | yes, measured           | yes                                     |

### Cost to build and to maintain

Line counts are **inferred** from what each option has to do, not from written code. Every option except E also needs the fixes in [§8](#8-fixes-needed-under-every-option) and the checks in [§7](#7-decision-5-how-to-check-it-works).

| Option                      | Status                                                                                                    | To build                                                                                                                                                                                                                                                                                          | To maintain                                                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**                       | Ruled out: B does everything A does without keeping cookies and a cache on disk, for about ten more lines | One line                                                                                                                                                                                                                                                                                          | Cookies and cached responses build up in the profile                                                                                                                                                                                                                            |
| **B**                       | **Chosen for now**                                                                                        | **Low.** About ten to twenty lines: the session and the wrapping function                                                                                                                                                                                                                         | **Low.** The function matches Electron's message text. A Chromium upgrade can change network behaviour that Electron's code doesn't show, so the Electron check runs at each upgrade                                                                                            |
| **B with redirect capture** | Skipped: C solves the same problem without its fragility                                                  | **Medium.** About 60 more lines: the marker header, the two listeners, building the 3xx response, and cleanup on every outcome                                                                                                                                                                    | **Medium.** Relies on the event arriving before the rejection. A session keeps only the last listener for each `webRequest` event ([web-request.md](https://github.com/electron/electron/blob/v45.3.4/docs/api/web-request.md)), so these must be the only ones on that session |
| **C**                       | **The next step**, when a trigger fires                                                                   | **High, in two steps.** First, 160 to 200 lines: headers, the request body, the response body as a `ReadableStream`, the 3xx response, aborts, errors as `TypeError`, refusing follow mode, and cancelling every `'login'` event. Later, when a target network needs it, a proxy sign-in dialogue | **Medium to high.** New ways the modules or the SDK call `fetch` must be matched. The dialogue is interface to maintain. The Electron check must cover redirects, sign-in and the server-credential case                                                                        |
| **D**                       | The fallback, if Chromium's network stack fails on a target network                                       | **Medium.** 80 to 120 lines: a `resolveProxy` call per request, parsing its answer (`PROXY`, `HTTPS`, `SOCKS5`, `DIRECT`) and falling back through it, one `undici` agent per proxy (`ProxyAgent` and `Socks5ProxyAgent` are in 7.30.2, **verified**), and the combined certificate list          | **Medium.** The app's `undici` must match the major version inside Electron's Node at every upgrade. A certificate installed after the app reads the list is missed until it reads it again (**inferred**). The proxy path needs its own check                                  |
| **E**                       | Ruled out: doesn't solve the problem                                                                      | None                                                                                                                                                                                                                                                                                              | None                                                                                                                                                                                                                                                                            |

Also ruled out, under any option:

- **Follow mode anywhere on Electron's network stack**, both `net.fetch`'s default and `net.request`'s own following, since both carry `Authorization` to another origin (finding 7).
- **In D, the system certificates alone as `ca`**, since that drops Node's bundled list.
- **Waiting for an Electron fix to manual mode.** The Fetch standard's manual mode returns an opaque response, with status 0 and no `Location`. The SDK then reports "this runtime does not expose where it points" (`dist/src-CeKsbNLO.mjs:6878`) and still follows nothing.

### Why B, and not C, for now

**Windows or Kerberos proxy sign-in doesn't separate C from B.** Chromium handles it inside the network stack for any request through it, so B has it as much as C (**inferred**, untested for both). Only D lacks it.

**What C adds over B has no known need:**

- **Redirects.** Arranger's MCP server, the first server the CRE uses, sends none ([§9](#9-end-to-end-with-arrangers-mcp-server)).
- **A prompt for a proxy's username and password**, the one ability C has over B with redirect capture. D has it for Basic only. No target network is known to need it. Under B, such a network stays unusable, as it is today, so B is no regression.

**B is far cheaper and has less to get wrong.** It is about ten to twenty lines, against C's 160 to 200 lines of network code in the main process plus a sign-in dialogue. B never prompts, so no server can fake a proxy's sign-in dialogue under it.

**Moving to C later is confined to the app.** The module side is the same under B and C: decisions 2 to 4, and `mcp-client`'s wrapper with its scheme check and size limit. B's error handling lives in the app's function, so switching replaces that one function.

**B and C share what remains unmeasured:** a proxy configured in the operating system rather than on a session, and certificates from an institution's own authority. If either fails on a target network, both fail, and D is the fallback.

### C's security points, for when it is built

- **Answer only a proxy's sign-in request.** `'login'` also fires for a server's own Basic challenge (finding 5). Prompting for any request would let an MCP server or model endpoint fake the proxy's dialogue, collect the person's institutional password, and keep receiving it from the session. So prompt only when `isProxy` is true, show the proxy's host and realm, and cancel everything else.
- **Keep the proxy password out of the renderer, except once.** Model and MCP credentials stay in the main process ([`AGENTS.md`](../../../AGENTS.md) § This project's constraints), and the proxy password is treated the same way. Electron's native `dialog` has no password field, so the prompt most likely lives in the renderer (**inferred**). The password crosses to the main process once, through `createIpcHandle`, and is never sent back or pre-filled. The proxy's host and realm are text the proxy chose, so they render as text, never HTML.
- **Keep proxy credentials out of saved configuration.** Hold them in memory, or in the keychain through `safeStorage`'s asynchronous methods.
- **Never use `net.request`'s own redirect following.** It follows any redirect to any origin, and its `'redirect'` event can't stop it ([net-client-request.ts L506-L515](https://github.com/electron/electron/blob/v45.3.4/lib/common/api/net-client-request.ts#L506-L515)). In manual mode, the event gave the status, method, resolved target and raw `Location`, and aborting there ended the request cleanly (**measured**, experiment 1).
- **Pause the response while the stream's queue is full, and abort on an abort signal**, or a large response fills main-process memory and connections stay open. **Inferred.**
- **Keep headers out of errors and logs**, since they carry the `Authorization` header and the model's API key.
- **Leave certificate checking alone:** no `setCertificateVerifyProc`, and no switch to ignore certificate errors.

---

## 5. Decisions 2 and 3: how the modules receive it

### Decision 2: the model provider's constructor

The tech-debt entry proposed a host-core option, "passed through to the provider". This decides instead that the provider takes `fetch` in its own constructor, because the app builds the provider and hands it to host-core as `McpHostOptions.provider` ([options.ts](../../../modules/mcp-host-core/src/options.ts)), so host-core has nothing to pass it through. **Verified.**

| Option                                                                   | For                                                                                                                                                                      | Against                                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **The provider's constructor**, `OpenAiCompatibleOptions.fetch` (chosen) | Matches the interface, which leaves connection details to "its own constructor" ([provider.ts:102-104](../../../modules/mcp-host-core/src/provider.ts)), beside `apiKey` | The app must pass it to both the provider and the host. A forgotten one sends model traffic around the proxy |
| **The `LlmProvider` interface**, filled in by host-core                  | One setting covers model and servers                                                                                                                                     | Host-core can't make a provider use it. Meaningless to the test double, `ScriptedProvider`                   |

The forgotten-option risk sits in the app's one configuration module, which builds both and can hand them the same function.

### Decision 3: one `fetch` for the whole host

Host-core connects each server with that server's `ServerConfig.connection`, which is `McpClientOptions` minus the fields host-core supplies itself (`ServerConfig` in [options.ts](../../../modules/mcp-host-core/src/options.ts)). So a `fetch` added to `McpClientOptions` also appears per server unless excluded. **Verified.** The decision is `McpHostOptions.fetch`, with `'fetch'` added to `ServerConfig.connection`'s `Omit`.

| Option                              | For                                                                                      | Against                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| **One for the whole host** (chosen) | One setting, which no server can miss. It describes the computer's network, not a server | No different `fetch` for one server      |
| **Per server**                      | No new host-core option                                                                  | A missed one silently bypasses the proxy |
| **Both**, the server's overriding   | Flexible                                                                                 | A precedence rule, for a need nobody has |

The likely per-server case, a local server such as Arranger's `apps/mcp-server`, needs no separate `fetch`: loopback goes direct even when a PAC file names a proxy for it (finding 8, and experiment 4). A per-server override can be added later without breaking anyone.

---

## 6. Decision 4: the option's type

The SDK types `fetch` as taking `string | URL`, and passes `URL`s. Electron types `net.fetch` as taking `string | Request`, though it accepts a `URL` at run time. **Verified.**

| Option                                                        | For                                                                                                                                     | Against                                                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The SDK's type**; the app adapts                            | Same as the SDK                                                                                                                         | `net.fetch` and a session's `fetch` fail to type-check against it (**measured**, experiment 6), so the app needs a wrapper just for the type checker |
| **String-only**, with `mcp-client` converting `URL`s (chosen) | `net.fetch`, a session's `fetch` and Node's `fetch` all fit as they are (**measured**, experiment 6). States what the modules will call | Needs a wrapper in `mcp-client`, which it needs anyway ([§8](#8-fixes-needed-under-every-option))                                                    |

---

## 7. Decision 5: how to check it works

The modules' tests run under plain Node, where `import 'electron'` gives the binary's path, not Electron's API. A stub `fetch` returns what its author believes, which is how finding 1 would pass every module test and fail in the app.

| Option                                                  | Proves                                                      | Leaves unproven                                                            | Cost                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **A one-off change to `main.ts`**                       | The Electron version it ran on, once                        | Every later Electron upgrade or change to the app's function               | None, which is the problem                                                                   |
| **Wiring host-core into the app for real**              | The whole path                                              | Waits on configuration, keychain and interface decisions, and stays manual | High                                                                                         |
| **A permanent script run under Electron** (recommended) | The app's function against local test servers, on every run | Packaging details, which don't affect it                                   | A script, possibly a build step, and `env -u ELECTRON_RUN_AS_NODE` from an editor's terminal |
| **Playwright's Electron support**                       | The packaged app                                            | Experimental, and untested with the app's fuses                            | High, for a check that needs no window                                                       |

The scenarios are written once, as a function that takes a `fetch`:

- a same-origin redirect, and one to another server;
- a slow event stream;
- an abort mid-stream;
- a refused connection;
- a proxy asking for a username and password;
- a server asking for one, which must not be answered;
- a refused connection during OAuth discovery, which must surface as a `network` failure (finding 4);
- an oversized body;
- a body cancelled mid-stream, which the server must see as the connection closing.

They run at three levels:

1. **Module tests** run them against Node's `fetch`, which confirms they match Node's real behaviour.
2. **`tsx --test` unit tests** run them against the app's function with Electron's API passed in, as `src/main/` keeps its logic in modules that import only Electron's types ([`AGENTS.md`](../../../AGENTS.md) § Repository structure). A fake session or `ClientRequest` checks the function's own logic.
3. **A script run under Electron** runs them against the real function, since a fake returns what its author believes. It also asserts that the main-process bundle resolved the SDK's `node` shim ([§8](#8-fixes-needed-under-every-option)).

Open points for the script, all **inferred**:

- The development Electron binary has no fuses flipped, so `NODE_OPTIONS='--import tsx'` might run TypeScript with no build step.
- On Linux CI, Electron likely needs a display server such as `xvfb`, even with no window.
- Whether it joins `DEVELOPMENT.md`'s pre-PR checks, or runs only on an Electron upgrade or a change to the function, is open ([§12](#12-open-questions), question 3).

---

## 8. Fixes needed under every option

| Fix                                                                                                                                                                                                                                                                                                                                                       | Why                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both modules refuse URLs other than `http:` and `https:`. In `mcp-client`, the check sits in its wrapper around the given `fetch`, so it covers server-supplied OAuth addresses. The provider requests only its own base URL's origin, so its constructor can check it                                                                                    | A `file:///…` URL would make the app read a local file, and part of it could reach an error message saved to the notebook (finding 3). **Inferred**                                                                                                                                                                                                                                                              |
| `mcp-client` wraps the given `fetch`, converting `URL`s to strings                                                                                                                                                                                                                                                                                        | Holds the scheme check, the string-only type and the size limit                                                                                                                                                                                                                                                                                                                                                  |
| The size limit (tech-debt "Responses from a server must have a size limit") sits inside that wrapper                                                                                                                                                                                                                                                      | The SDK wraps whatever `fetch` it is given, so the limit sees every response, OAuth included. **Verified**                                                                                                                                                                                                                                                                                                       |
| The size limit caps each event in an event stream, at a size that allows about 15 MiB, rather than the stream's total                                                                                                                                                                                                                                     | A change-notification stream stays open for the client's life, so a total would eventually cut it, and an Arranger tool result can legitimately reach about 15 MiB ([§9](#9-end-to-end-with-arrangers-mcp-server)). **Inferred**                                                                                                                                                                                 |
| Past the limit, the wrapper aborts the request through its own `AbortController`, joined to the caller's signal, rather than only cancelling the body                                                                                                                                                                                                     | Cancelling `net.fetch`'s body leaves the connection open ([§3](#3-what-electrons-network-stack-does)), and an abort closes it                                                                                                                                                                                                                                                                                    |
| SDK sign-in code called by the app outside a server connection, such as `auth()`, `CrossAppAccessProvider` or the grant helpers, gets `mcp-client`'s wrapper, exported when first needed ([tech debt](../../tech-debt.md#export-the-fetch-wrapper-once-the-app-calls-the-sdks-sign-in-code-itself)). Sign-in through a connection already goes through it | Such code takes its own `fetch`, defaulting to the global one, as `CrossAppAccessProvider` does (`dist/index.mjs:320`), so it would skip the wrapper's scheme check and size limit. **Verified**                                                                                                                                                                                                                 |
| The app creates its session and function after Electron's `ready` event                                                                                                                                                                                                                                                                                   | Electron's `net` can't be used before then                                                                                                                                                                                                                                                                                                                                                                       |
| The app's function refuses follow mode                                                                                                                                                                                                                                                                                                                    | Follow is `net.fetch`'s default, and carries `Authorization` to another origin (finding 7)                                                                                                                                                                                                                                                                                                                       |
| The main-process bundle resolves the SDK's `node` shim, not its `browser` one                                                                                                                                                                                                                                                                             | Under the `browser` shim, `fetchWithCorsRetry` treats a `TypeError` during OAuth discovery as "no metadata" and moves on (`dist/public-CvV4ZHkX.mjs:991-1005`), which would hide a redirect failure. Forge's main build sets `resolve.conditions: ['node']` (`@electron-forge/plugin-vite`, `dist/config/vite.main.config.js:19`). **Verified**; that the bundle follows it is unmeasured until the SDK is in it |

The wrapper need not preserve `response.url` or `response.type`: the SDK falls back to the request's URL when `url` is empty, and reads `type` only for an opaque redirect, which neither runtime produces. **Verified.**

Out of scope here: the model endpoint has no size limit, though the person configures it as they configure a server ([mcp-host-plan.md](mcp-host-plan.md) § 2.4). [Tech debt](../../tech-debt.md#responses-from-the-model-endpoint-must-have-a-size-limit) tracks it.

**Whichever option is chosen:** trusting the system's certificates lets an institution's TLS-inspecting proxy read the conversation, bearer tokens and controlled data. Under Node's `fetch`, that connection fails today, but not as a protection anyone chose ([§12](#12-open-questions), question 2).

---

## 9. End to end with Arranger's MCP server

Arranger's `apps/mcp-server` is the first server the CRE uses. Its answers were measured or read at Arranger's `main` `25814ee6`, and Usher's at its `main` `6e49c3d`.

| Question        | `apps/mcp-server`                                                                                                                                                                                                                                                                                                                                         | What it means here                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Redirects?      | None: any path but `/mcp` and the health check gets a 404 (**measured**). No ingress is designed                                                                                                                                                                                                                                                          | Same-origin following isn't needed against Arranger. An ingress redirecting `http` to `https` is handled under B by the person typing `https`, since B's message suggests it                                                                                                                                                                                                                                             |
| Cookies?        | None set or read (**measured**)                                                                                                                                                                                                                                                                                                                           | Omitting credentials loses nothing                                                                                                                                                                                                                                                                                                                                                                                       |
| Response types? | `application/json` for every exchange. `subscriptions/listen` is an event stream carrying an acknowledgement and a keep-alive every 15 s                                                                                                                                                                                                                  | Streaming matters for the model's replies and other servers, not Arranger's tool results                                                                                                                                                                                                                                                                                                                                 |
| Sizes?          | `tools/list` is about 15 KB (**measured**). Each tool result carries its payload twice. An aggregation at Elasticsearch's default cap of 65,536 buckets is 7.9 to 14.9 MiB, and 1,000 hits of 100 fields at 50 characters is 13.5 MiB, with nothing bounding hits (**computed**)                                                                          | The size limit must allow about 15 MiB per tool result, and its error must say plainly when a legitimate result exceeds it                                                                                                                                                                                                                                                                                               |
| `Origin`?       | A request with none passes. Any origin not on `MCP_ALLOWED_ORIGINS`, empty by default, gets 403, including `null`, `file://` and `app://cre` (**measured**)                                                                                                                                                                                               | No option sends one (finding 6). Electron's exact headers, replayed against the server, got 200 for `server/discover`, `tools/list` and `resources/list`, and 403 with `Origin: null` added (**measured**). Nothing in the server or its SDK reads `Sec-Fetch-*` or `User-Agent`                                                                                                                                         |
| `Host`?         | Must be on `MCP_ALLOWED_HOSTS`. On loopback: `localhost`, `127.0.0.1`, `[::1]`                                                                                                                                                                                                                                                                            | Holds through a proxy, which keeps the target's host, and on loopback, which isn't proxied                                                                                                                                                                                                                                                                                                                               |
| Authentication? | Decided, not built: every request carries `Authorization: Bearer` with the person's own token, issued by the deployment's Keycloak. A refused token gets 401 or 403 with `WWW-Authenticate: Bearer`, never a redirect. Discovery then reads protected-resource metadata on the server's origin, and Keycloak's metadata, registration and token endpoints | These go through the same `fetch`. The SDK refuses a token endpoint that is neither `https` nor loopback before sending (`dist/public-CvV4ZHkX.mjs:544`, `:1253`), so a Keycloak advertising `http` endpoints fails under every option. Whether Keycloak redirects its own paths is unmeasured. The `Origin` check's 403 has no `WWW-Authenticate` header and a scope refusal's has one, so the client must branch on it |
| Usher?          | Not on the client's path: its Bridge is middleware inside `apps/search-server`, and Usher decided against a gateway or proxy. It reads only the bearer credential, sends no redirects and sets no cookies (**read**). The MCP server is to exchange the person's token for a search-server token at Keycloak, on the server                               | Changes nothing about headers, redirects or cookies                                                                                                                                                                                                                                                                                                                                                                      |

A redirect from an ingress never reaches `apps/mcp-server`, so its logs never show one. Under B, the person's error then names no target to report, where under C it names the address the server pointed to. **Inferred.**

---

## 10. Decision

**B now, C when a need appears.** A and E are ruled out, and B with redirect capture is skipped. D is the fallback if Chromium's network stack fails on a target network.

**Triggers for moving to C:**

- A server the CRE connects to redirects in a way the person can't avoid by typing a different address: on a path they never type, such as OAuth discovery, to a target that varies, or to a gateway's sign-in page. A redirect from `http` to `https`, or to add a trailing slash, isn't a trigger, since B's message points the person at the fix.
- The deployment's Keycloak redirects any of the addresses the SDK calls: the discovery metadata, registration or token endpoint. Check before authenticated Arranger ships.
- A target network's proxy asks for a username and password.
- Any of these is known in advance.

Moving replaces the app's one function, and changes nothing in the modules.

---

## 11. Experiments

Each was a short script run with the repository's own Electron binary, as described under Environment above. The scripts are in [`scripts/fetch-option/`](scripts/fetch-option/), whose README says how to rerun them.

| #   | What it tested                                                                                                                                                            | Result                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Manual-mode redirects with a `URL` input; `onBeforeRedirect`; `net.request`'s `'redirect'` event; follow mode across origins with `Authorization`, against Node's `fetch` | Findings 1 and 7. Capture works                                |
| 2   | An event stream, one event every 500 ms                                                                                                                                   | Arrives incrementally                                          |
| 3   | An abort mid-stream, and one with a reason before the response                                                                                                            | Prompt, and the connection closes                              |
| 4   | `resolveProxy` on the default and an in-memory session; loopback with a proxy set on a session                                                                            | Both `DIRECT` on a machine with no proxy. Loopback goes direct |
| 5   | A closed port and an unknown host, through all three Electron calls                                                                                                       | Finding 4                                                      |
| 6   | Type-checking Electron's `fetch` functions against both candidate types, with TypeScript 5.9.3                                                                            | String-only fits; the SDK's type doesn't                       |
| 7   | `tls.getCACertificates` counts, and Node's `fetch` through an `undici` `Agent`                                                                                            | 5 system and 118 bundled certificates; dispatcher accepted     |
| 8   | A proxy answering 407 with Basic, for `http:` and an `https:` tunnel; a server answering 401 with Basic and with `Bearer`                                                 | Finding 5                                                      |
| 9   | Headers from all three Electron calls, POST and GET, on both sessions; an explicit `Origin`, with and without removal                                                     | Finding 6                                                      |
| 10  | A locally served PAC file on a dedicated session: a proxy, `DIRECT`, fallback past a dead proxy, loopback; D's `ProxyAgent` from `resolveProxy`                           | Finding 8. D works with `proxyTunnel: false` for `http:`       |

No experiment used a self-signed HTTPS server, so the certificate path is unmeasured for every option. Proposed, not run:

- **11, system certificates:** connect to a real internal service signed by an institutional certificate authority, through the app's function and through Node's `fetch`. It needs such a service reachable from the test machine.
- **12, Keycloak's paths:** run a local Keycloak and request the three discovery addresses the SDK builds for an issuer, its registration and token endpoints, and the issuer with a trailing slash. A local Keycloak in development mode can't show an ingress's redirect.

---

## 12. Open questions

1. **Redirects to MCP servers.** Same-origin following is only the SDK's default, not a recorded decision. B drops it until C lands. Recommendation: keep it as the long-term behaviour, as the SDK's chosen safe one, which C restores.
2. **TLS-inspecting proxies.** Trusting the system's certificates lets an institution's inspection proxy read controlled data. [mcp-host-plan.md](mcp-host-plan.md) holds back any claim of controlled-data support until its open questions are settled, and has no entry on this. Recommendation: add it to the plan's open questions for the team, rather than settle it here.
3. **The Electron check script.** Whether it joins the pre-PR checks, or runs only on an Electron upgrade or a change to the app's function.
4. **An upstream report to Electron**, that `net.fetch` rejects in manual mode where Node's `fetch` returns the 3xx. Worth filing, but a standard-conforming fix gives no target, so it doesn't change this decision.

---

## 13. Moving to Electron 46

This compares Electron 45.3.4 with `v46.0.0-alpha.13` (2026-11-23) and the `46-x-y` branch. Recheck at 46's stable release.

| What                                              | 45.3.4         | 46                                                                                    | Effect                                                                                  |
| ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `net-fetch.ts`, `net-client-request.ts`, `net.ts` |                | Identical, byte for byte                                                              | Findings 1 to 5 still hold. **Verified**                                                |
| `electron_api_url_loader.cc`                      |                | Chromium's sign-in callback gains a flag asking not to prompt, which Electron ignores | `'login'` still reaches the request. **Inferred** from the diff                         |
| Breaking-changes list                             |                | Nothing about `net`, sessions, proxies or certificates                                | **Verified**                                                                            |
| Chromium                                          | 156.0.8078.100 | 160.0.8168.0                                                                          | Network-stack changes don't show in Electron's code. Only the Electron check finds them |
| Node's built-in `undici`                          | 7.30.2         | 8.12.4                                                                                | D only: the app's `undici` must move to 8 in the same commit. **Inferred**              |
| `tls.getCACertificates`                           | Documented     | Documented                                                                            | **Verified** from Node's documentation                                                  |

B needs no code change for 46. C keeps any proxy credentials through `safeStorage`'s asynchronous methods, since 46 removes the synchronous ones. Every option runs the Electron check on the upgrade commit.

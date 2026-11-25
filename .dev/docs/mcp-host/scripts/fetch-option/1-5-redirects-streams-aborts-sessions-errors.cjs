// Experiments 1 to 5: redirects and URL input, streaming, aborts, a new session's proxy and loopback,
// and the error class for a refused connection. Local servers on 127.0.0.1 only.
const { app, net, session } = require('electron');
const http = require('node:http');
const path = require('node:path');

// A throwaway profile, so the run leaves nothing in the repository or the real Electron profile.
app.setPath('userData', require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'fetch-option-')));
if (app.dock) app.dock.hide();

const t0 = Date.now();
const ms = () => Date.now() - t0;
const serverLog = [];
const describe = (e) => ({
	class: e?.constructor?.name,
	name: e?.name,
	message: e?.message,
	cause: e?.cause ? `${e.cause.constructor?.name}: ${e.cause.code ?? ''} ${e.cause.message ?? ''}` : undefined,
});
const withTimeout = (p, s = 10) =>
	Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${s} s`)), s * 1000))]);

let port;
const server = http.createServer((req, res) => {
	const entry = {
		at: ms(),
		method: req.method,
		path: req.url,
		authorization: req.headers.authorization ? 'present' : 'none',
		host: req.headers.host,
	};
	serverLog.push(entry);
	req.on('close', () => (entry.closedAt = ms()));
	if (req.url === '/redirect307') {
		res.writeHead(307, { location: '/target' });
		return res.end('moved');
	}
	if (req.url === '/redirect-cross') {
		res.writeHead(307, { location: `http://localhost:${port}/target` });
		return res.end('moved');
	}
	if (req.url.startsWith('/target')) return res.end('target');
	if (req.url === '/sse') {
		res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
		let n = 0;
		const timer = setInterval(() => {
			n++;
			res.write(`data: ${n}\n\n`);
			if (n === 6) {
				clearInterval(timer);
				res.end();
			}
		}, 500);
		res.on('close', () => clearInterval(timer));
		return;
	}
	res.end('ok');
});

const readStream = async (response, { abortAfter, controller } = {}) => {
	const reader = response.body.getReader();
	const start = ms();
	const chunks = [];
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push({ at: ms() - start, text: Buffer.from(value).toString().trim() });
			if (abortAfter && chunks.length === abortAfter) {
				const abortedAt = ms();
				controller.abort();
				try {
					await reader.read();
					return { chunks, afterAbort: 'read resolved' };
				} catch (e) {
					return { chunks, afterAbort: describe(e), rejectedAfterMs: ms() - abortedAt };
				}
			}
		}
		return { chunks };
	} catch (e) {
		return { chunks, error: describe(e) };
	}
};

app.whenReady().then(async () => {
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	port = server.address().port;
	const base = `http://127.0.0.1:${port}`;
	const body = '{"jsonrpc":"2.0","id":1,"method":"ping"}';
	const out = { electron: process.versions.electron };
	const run = async (label, fn) => {
		const before = serverLog.length;
		try {
			out[label] = { result: await withTimeout(fn()) };
		} catch (e) {
			out[label] = { error: describe(e) };
		}
		out[label].serverSaw = serverLog.slice(before).map(({ at, ...rest }) => rest);
	};

	// Experiment 1: redirects, and URL input.
	await run('1a node fetch, manual, 307 same origin (baseline)', async () => {
		const r = await fetch(new URL(`${base}/redirect307`), { method: 'POST', body, redirect: 'manual' });
		return { status: r.status, location: r.headers.get('location'), type: r.type };
	});
	await run('1b net.fetch, manual, 307 same origin, URL object', async () => {
		const r = await net.fetch(new URL(`${base}/redirect307`), { method: 'POST', body, redirect: 'manual' });
		return { status: r.status, location: r.headers.get('location'), type: r.type };
	});
	await run('1c net.fetch GET with a URL object, no redirect', async () => {
		const r = await net.fetch(new URL(`${base}/target?x=1`));
		return { status: r.status, text: await r.text() };
	});
	await run('1d session.fetch, manual, 307, with webRequest.onBeforeRedirect', async () => {
		const s = session.fromPartition('exp1-redirect');
		const events = [];
		s.webRequest.onBeforeRedirect((d) =>
			events.push({ at: ms(), statusCode: d.statusCode, redirectURL: d.redirectURL, url: d.url, id: d.id }),
		);
		let outcome;
		try {
			const r = await s.fetch(`${base}/redirect307`, {
				method: 'POST',
				body,
				redirect: 'manual',
				credentials: 'omit',
				cache: 'no-store',
			});
			outcome = { status: r.status };
		} catch (e) {
			outcome = { rejectedAt: ms(), ...describe(e) };
		}
		await new Promise((r) => setTimeout(r, 200));
		return { outcome, onBeforeRedirect: events };
	});
	await run(
		'1e net.request, manual, 307, redirect listener aborts (option C mechanism)',
		() =>
			new Promise((resolve, reject) => {
				const req = net.request({ method: 'POST', url: `${base}/redirect307`, redirect: 'manual' });
				const seen = {};
				req.on('redirect', (statusCode, method, redirectUrl, headers) => {
					Object.assign(seen, { statusCode, method, redirectUrl, location: headers.location });
					req.abort();
					setTimeout(() => resolve({ redirect: seen, laterError: seen.laterError ?? 'none' }), 300);
				});
				req.on('error', (e) => (seen.statusCode ? (seen.laterError = describe(e)) : reject(e)));
				req.on('abort', () => (seen.abortEvent = true));
				req.end(body);
			}),
	);
	await run('1f net.fetch, follow, 307 to another origin, with Authorization', async () => {
		const r = await net.fetch(`${base}/redirect-cross`, {
			method: 'POST',
			body,
			headers: { authorization: 'Bearer secret-token' },
			redirect: 'follow',
		});
		return { status: r.status, text: await r.text(), redirected: r.redirected };
	});

	// Experiment 2: streaming.
	await run('2a net.fetch, event stream, arrival times', async () => readStream(await net.fetch(`${base}/sse`)));
	await run('2b session.fetch, in-memory, event stream, arrival times', async () => {
		const s = session.fromPartition('exp2');
		return readStream(await s.fetch(`${base}/sse`, { credentials: 'omit', cache: 'no-store' }));
	});

	// Experiment 3: aborts.
	await run('3a net.fetch, abort after the second event', async () => {
		const controller = new AbortController();
		const r = await net.fetch(`${base}/sse`, { signal: controller.signal });
		const result = await readStream(r, { abortAfter: 2, controller });
		await new Promise((res) => setTimeout(res, 300));
		return result;
	});
	await run('3b net.fetch, abort before the response, reason given', async () => {
		const controller = new AbortController();
		const p = net.fetch(`${base}/sse`, { signal: controller.signal });
		controller.abort(new Error('caller gave up'));
		try {
			await p;
			return 'resolved';
		} catch (e) {
			return describe(e);
		}
	});
	await run('3c node fetch, abort after the second event (baseline)', async () => {
		const controller = new AbortController();
		const r = await fetch(`${base}/sse`, { signal: controller.signal });
		const result = await readStream(r, { abortAfter: 2, controller });
		await new Promise((res) => setTimeout(res, 300));
		return result;
	});

	// Experiment 4: a new session's proxy, and loopback.
	await run('4a resolveProxy, default vs new in-memory session', async () => {
		const fresh = session.fromPartition('exp4-plain');
		const urls = [
			'https://example.org/',
			'http://example.org/',
			`http://127.0.0.1:${port}/`,
			`http://localhost:${port}/`,
		];
		const rows = {};
		for (const u of urls)
			rows[u] = { default: await session.defaultSession.resolveProxy(u), inMemory: await fresh.resolveProxy(u) };
		return rows;
	});
	await run('4b new session with a dummy proxy: resolveProxy and a real loopback request', async () => {
		const s = session.fromPartition('exp4-dummy');
		await s.setProxy({ proxyRules: '127.0.0.1:9' });
		const rows = {};
		for (const u of [
			'https://example.org/',
			`http://127.0.0.1:${port}/`,
			`http://localhost:${port}/`,
			`http://[::1]:${port}/`,
		])
			rows[u] = await s.resolveProxy(u);
		const r = await s.fetch(`${base}/target?via=dummy-proxy-session`, { credentials: 'omit', cache: 'no-store' });
		return { resolveProxy: rows, loopbackRequest: { status: r.status, text: await r.text() } };
	});

	// Experiment 5: error class for a refused connection.
	const closed = http.createServer();
	await new Promise((r) => closed.listen(0, '127.0.0.1', r));
	const closedPort = closed.address().port;
	await new Promise((r) => closed.close(r));
	const closedUrl = `http://127.0.0.1:${closedPort}/`;
	await run('5a node fetch, refused (baseline)', async () => {
		try {
			await fetch(closedUrl);
			return 'resolved';
		} catch (e) {
			return describe(e);
		}
	});
	await run('5b net.fetch, refused', async () => {
		try {
			await net.fetch(closedUrl);
			return 'resolved';
		} catch (e) {
			return { ...describe(e), isTypeError: e instanceof TypeError };
		}
	});
	await run('5c session.fetch, refused', async () => {
		try {
			await session.fromPartition('exp5').fetch(closedUrl);
			return 'resolved';
		} catch (e) {
			return { ...describe(e), isTypeError: e instanceof TypeError };
		}
	});
	await run(
		'5d net.request, refused',
		() =>
			new Promise((resolve) => {
				const req = net.request(closedUrl);
				req.on('response', () => resolve('response'));
				req.on('error', (e) => resolve({ ...describe(e), isTypeError: e instanceof TypeError }));
				req.end();
			}),
	);
	await run('5e net.fetch, unresolvable host', async () => {
		try {
			await net.fetch('http://does-not-exist.invalid/');
			return 'resolved';
		} catch (e) {
			return describe(e);
		}
	});

	console.log(JSON.stringify(out, null, 2));
	server.close();
	app.quit();
});

// Experiment 10: PAC handling on a dedicated session, without changing system settings.
// A local server serves the PAC file and acts as the proxy; another local server is the "origin".
const { app, net, session } = require('electron');
const http = require('node:http');
const path = require('node:path');

// A throwaway profile, so the run leaves nothing in the repository or the real Electron profile.
app.setPath('userData', require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'fetch-option-')));
if (app.dock) app.dock.hide();

// The repository's undici, which must match the version inside Electron's Node (process.versions.undici).
const undiciPath = path.dirname(require.resolve('undici/package.json'));
const proxyLog = [];
const originLog = [];

const origin = http.createServer((req, res) => {
	originLog.push({ path: req.url, host: req.headers.host });
	res.end('from origin');
});

let pac = '';
const proxy = http.createServer((req, res) => {
	if (req.url === '/proxy.pac') {
		res.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig' });
		return res.end(pac);
	}
	proxyLog.push({ kind: 'request', method: req.method, url: req.url });
	res.end('via proxy');
});
proxy.on('connect', (req, socket) => {
	proxyLog.push({ kind: 'connect', url: req.url });
	socket.end('HTTP/1.1 200 Connection Established\r\n\r\n'); // no TLS server behind it
});

const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', r));
const describe = (e) =>
	`${e?.constructor?.name}: ${e?.message}${e?.cause ? ` (cause: ${e.cause.code ?? e.cause.message})` : ''}`;
const withTimeout = (p) =>
	Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 10 s')), 10000))]);

app.whenReady().then(async () => {
	await listen(origin);
	await listen(proxy);
	const P = proxy.address().port;
	const O = origin.address().port;
	const dead = http.createServer();
	await listen(dead);
	const D = dead.address().port;
	await new Promise((r) => dead.close(r));

	pac = `function FindProxyForURL(url, host) {
		if (host == "via-proxy.test") return "PROXY 127.0.0.1:${P}";
		if (dnsDomainIs(host, ".fallback.test")) return "PROXY 127.0.0.1:${D}; PROXY 127.0.0.1:${P}";
		if (host == "direct.test") return "DIRECT";
		if (host == "127.0.0.1" || host == "localhost") return "PROXY 127.0.0.1:${P}";
		return "DIRECT";
	}`;

	const s = session.fromPartition('exp10-pac');
	await s.setProxy({ mode: 'pac_script', pacScript: `http://127.0.0.1:${P}/proxy.pac` });

	const out = { electron: process.versions.electron, resolveProxy: {} };
	for (const u of [
		'http://via-proxy.test/',
		'https://via-proxy.test/',
		'http://a.fallback.test/',
		'http://direct.test/',
		`http://127.0.0.1:${O}/`,
		`http://localhost:${O}/`,
		'https://elsewhere.test/',
	]) {
		out.resolveProxy[u] = await s.resolveProxy(u);
	}
	out.defaultSessionUntouched = await session.defaultSession.resolveProxy('http://via-proxy.test/');

	const cases = [
		[
			'session.fetch http://via-proxy.test/x',
			() =>
				s
					.fetch('http://via-proxy.test/x', { credentials: 'omit', cache: 'no-store' })
					.then(async (r) => ({ status: r.status, body: await r.text() })),
		],
		[
			'session.fetch https://via-proxy.test/ (tunnel, no TLS behind)',
			() =>
				s
					.fetch('https://via-proxy.test/', { credentials: 'omit', cache: 'no-store' })
					.then((r) => ({ status: r.status })),
		],
		[
			'net.request http://via-proxy.test/y on the PAC session',
			() =>
				new Promise((resolve, reject) => {
					const req = net.request({ url: 'http://via-proxy.test/y', session: s });
					req.on('response', (res) => {
						let b = '';
						res.on('data', (c) => (b += c));
						res.on('end', () => resolve({ status: res.statusCode, body: b }));
					});
					req.on('error', reject);
					req.end();
				}),
		],
		[
			'session.fetch http://a.fallback.test/ (first proxy dead)',
			() =>
				s
					.fetch('http://a.fallback.test/', { credentials: 'omit', cache: 'no-store' })
					.then(async (r) => ({ status: r.status, body: await r.text() })),
		],
		[
			'session.fetch http://direct.test/ (DIRECT, no such host)',
			() =>
				s
					.fetch('http://direct.test/', { credentials: 'omit', cache: 'no-store' })
					.then((r) => ({ status: r.status })),
		],
		[
			'session.fetch loopback, which the PAC sends to the proxy',
			() =>
				s
					.fetch(`http://127.0.0.1:${O}/loop`, { credentials: 'omit', cache: 'no-store' })
					.then(async (r) => ({ status: r.status, body: await r.text() })),
		],
		[
			'option D: Node fetch through an undici agent chosen from resolveProxy',
			async () => {
				const { ProxyAgent, Agent } = require(undiciPath);
				const target = 'http://via-proxy.test/d';
				const answer = await s.resolveProxy(target);
				const first = answer.split(';')[0].trim();
				const dispatcher = first.startsWith('PROXY ')
					? new ProxyAgent(`http://${first.slice(6)}`)
					: new Agent();
				const r = await fetch(target, { dispatcher });
				return { resolveProxy: answer, used: first, status: r.status, body: await r.text() };
			},
		],
		[
			'option D: same, http with proxyTunnel: false',
			async () => {
				const { ProxyAgent } = require(undiciPath);
				const answer = await s.resolveProxy('http://via-proxy.test/d2');
				const r = await fetch('http://via-proxy.test/d2', {
					dispatcher: new ProxyAgent({
						uri: `http://${answer.split(';')[0].trim().slice(6)}`,
						proxyTunnel: false,
					}),
				});
				return { status: r.status, body: await r.text() };
			},
		],
		[
			'option D: https through the ProxyAgent (tunnel, no TLS behind)',
			async () => {
				const { ProxyAgent } = require(undiciPath);
				const answer = await s.resolveProxy('https://via-proxy.test/d3');
				const r = await fetch('https://via-proxy.test/d3', {
					dispatcher: new ProxyAgent(`http://${answer.split(';')[0].trim().slice(6)}`),
				});
				return { status: r.status };
			},
		],
	];

	out.results = [];
	for (const [name, run] of cases) {
		const before = { p: proxyLog.length, o: originLog.length };
		const row = { name };
		try {
			row.result = await withTimeout(run());
		} catch (e) {
			row.error = describe(e);
		}
		row.proxySaw = proxyLog.slice(before.p);
		row.originSaw = originLog.slice(before.o);
		out.results.push(row);
	}
	console.log(JSON.stringify(out, null, 2));
	origin.close();
	proxy.close();
	app.quit();
});

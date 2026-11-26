// Experiment 9: which Origin (and related) headers Electron's main-process network calls send,
// and whether webRequest.onBeforeSendHeaders on a dedicated session can strip one.
const { app, net, session } = require('electron');
const http = require('node:http');
const path = require('node:path');

// A throwaway profile, so the run leaves nothing in the repository or the real Electron profile.
app.setPath('userData', require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'fetch-option-')));
if (app.dock) app.dock.hide();

const WATCHED = [
	'origin',
	'referer',
	'cookie',
	'sec-fetch-site',
	'sec-fetch-mode',
	'sec-fetch-dest',
	'user-agent',
	'x-probe',
];
const seen = [];

const server = http.createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		const picked = {};
		for (const name of WATCHED) if (req.headers[name] !== undefined) picked[name] = req.headers[name];
		seen.push({
			probe: req.headers['x-probe'],
			method: req.method,
			headers: picked,
			allHeaderNames: Object.keys(req.headers),
		});
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end('{"ok":true}');
	});
});

const viaRequest = (options, body, extraHeaders = {}) =>
	new Promise((resolve, reject) => {
		const req = net.request(options);
		for (const [k, v] of Object.entries(extraHeaders)) req.setHeader(k, v);
		req.on('response', (res) => {
			res.on('data', () => {});
			res.on('end', () => resolve(res.statusCode));
		});
		req.on('error', reject);
		req.end(body);
	});

app.whenReady().then(async () => {
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const url = `http://127.0.0.1:${server.address().port}/mcp`;
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
	const json = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

	const dedicated = session.fromPartition('exp9');
	const stripping = session.fromPartition('exp9-strip');
	stripping.webRequest.onBeforeSendHeaders((details, callback) => {
		const requestHeaders = { ...details.requestHeaders };
		for (const name of Object.keys(requestHeaders))
			if (name.toLowerCase() === 'origin') delete requestHeaders[name];
		callback({ requestHeaders });
	});

	const cases = [
		[
			'node-fetch POST (baseline)',
			() =>
				fetch(url, {
					method: 'POST',
					headers: { ...json, 'x-probe': 'node-fetch POST (baseline)' },
					body,
					redirect: 'manual',
				}),
		],
		[
			'net.fetch POST, default session',
			() =>
				net.fetch(url, {
					method: 'POST',
					headers: { ...json, 'x-probe': 'net.fetch POST, default session' },
					body,
					redirect: 'manual',
				}),
		],
		[
			'net.fetch GET, default session',
			() =>
				net.fetch(url, {
					headers: { accept: 'text/event-stream', 'x-probe': 'net.fetch GET, default session' },
					redirect: 'manual',
				}),
		],
		[
			'session.fetch POST, in-memory partition, omit, no-store',
			() =>
				dedicated.fetch(url, {
					method: 'POST',
					headers: { ...json, 'x-probe': 'session.fetch POST, in-memory partition, omit, no-store' },
					body,
					redirect: 'manual',
					credentials: 'omit',
					cache: 'no-store',
				}),
		],
		[
			'net.request POST, default session',
			() =>
				viaRequest({ method: 'POST', url, redirect: 'manual' }, body, {
					...json,
					'x-probe': 'net.request POST, default session',
				}),
		],
		[
			'net.request POST, in-memory partition',
			() =>
				viaRequest(
					{
						method: 'POST',
						url,
						redirect: 'manual',
						session: dedicated,
						credentials: 'omit',
						cache: 'no-store',
					},
					body,
					{ ...json, 'x-probe': 'net.request POST, in-memory partition' },
				),
		],
		[
			'net.request POST, explicit Origin, no stripping',
			() =>
				viaRequest({ method: 'POST', url, session: dedicated }, body, {
					...json,
					origin: 'https://example.org',
					'x-probe': 'net.request POST, explicit Origin, no stripping',
				}),
		],
		[
			'net.request POST, explicit Origin, stripping session',
			() =>
				viaRequest({ method: 'POST', url, session: stripping }, body, {
					...json,
					origin: 'https://example.org',
					'x-probe': 'net.request POST, explicit Origin, stripping session',
				}),
		],
		[
			'session.fetch POST, explicit Origin, stripping session',
			() =>
				stripping.fetch(url, {
					method: 'POST',
					headers: {
						...json,
						origin: 'https://example.org',
						'x-probe': 'session.fetch POST, explicit Origin, stripping session',
					},
					body,
					credentials: 'omit',
					cache: 'no-store',
				}),
		],
	];

	const results = [];
	for (const [name, run] of cases) {
		try {
			const r = await run();
			const status = typeof r === 'number' ? r : r.status;
			if (typeof r !== 'number') await r.text();
			results.push({ name, status });
		} catch (error) {
			results.push({ name, error: `${error?.constructor?.name}: ${error?.message}` });
		}
	}

	console.log(
		JSON.stringify(
			{
				electron: process.versions.electron,
				chrome: process.versions.chrome,
				node: process.versions.node,
				results,
				seen,
			},
			null,
			2,
		),
	);
	server.close();
	app.quit();
});

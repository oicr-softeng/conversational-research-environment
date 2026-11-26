// Experiment 8: proxy sign-in. A local proxy answers 407 unless given Basic credentials; a local server
// answers 401 with Basic or with Bearer. Logs what net.fetch and net.request do, and when 'login' fires.
const { app, net, session } = require('electron');
const http = require('node:http');
const path = require('node:path');

// A throwaway profile, so the run leaves nothing in the repository or the real Electron profile.
app.setPath('userData', require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'fetch-option-')));
if (app.dock) app.dock.hide();

const GOOD = 'Basic ' + Buffer.from('user:secret').toString('base64');
const proxyLog = [];
const serverLog = [];

const proxy = http.createServer((req, res) => {
	const auth = req.headers['proxy-authorization'];
	proxyLog.push({
		kind: 'request',
		method: req.method,
		url: req.url,
		proxyAuthorization: auth ? (auth === GOOD ? 'correct' : 'wrong') : 'none',
	});
	if (auth === GOOD) {
		res.writeHead(200, { 'content-type': 'text/plain' });
		res.end('via proxy');
	} else {
		res.writeHead(407, { 'proxy-authenticate': 'Basic realm="exp8-proxy"', 'content-length': 0 });
		res.end();
	}
});
proxy.on('connect', (req, socket) => {
	const auth = req.headers['proxy-authorization'];
	proxyLog.push({
		kind: 'connect',
		url: req.url,
		proxyAuthorization: auth ? (auth === GOOD ? 'correct' : 'wrong') : 'none',
	});
	if (auth === GOOD) {
		socket.end('HTTP/1.1 200 Connection Established\r\n\r\n'); // then close: no real TLS server behind it
	} else {
		socket.end(
			'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="exp8-proxy"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
		);
	}
});

const server = http.createServer((req, res) => {
	serverLog.push({ path: req.url, authorization: req.headers.authorization ? 'present' : 'none' });
	if (req.url === '/basic') {
		if (req.headers.authorization) return res.end('basic ok');
		res.writeHead(401, { 'www-authenticate': 'Basic realm="exp8-server"', 'content-type': 'text/plain' });
		return res.end('need basic');
	}
	res.writeHead(401, {
		'www-authenticate':
			'Bearer error="invalid_token", resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource"',
		'content-type': 'application/json',
	});
	res.end('{"error":"invalid_token"}');
});

const withTimeout = (p) =>
	Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 8 s')), 8000))]);
const describe = (error) => `${error?.constructor?.name}: ${error?.message}`;

const viaRequest = (options, onLogin) =>
	new Promise((resolve, reject) => {
		const logins = [];
		const req = net.request(options);
		if (onLogin) {
			req.on('login', (authInfo, callback) => {
				logins.push({ ...authInfo });
				onLogin(callback);
			});
		}
		req.on('response', (res) => {
			let body = '';
			res.on('data', (c) => (body += c));
			res.on('end', () =>
				resolve({
					status: res.statusCode,
					wwwAuthenticate: res.headers['www-authenticate'],
					body: body.slice(0, 40),
					logins,
				}),
			);
		});
		req.on('error', (e) => reject(Object.assign(e, { logins })));
		req.end();
	});

const viaFetch = async (f, url) => {
	const r = await f(url, { redirect: 'manual', credentials: 'omit', cache: 'no-store' });
	return {
		status: r.status,
		wwwAuthenticate: r.headers.get('www-authenticate'),
		body: (await r.text()).slice(0, 40),
	};
};

app.whenReady().then(async () => {
	await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	// A fresh in-memory session per proxy case, so no case inherits another's cached proxy credentials.
	let n = 0;
	const fresh = async () => {
		const s = session.fromPartition(`exp8-proxied-${n++}`);
		await s.setProxy({ proxyRules: `127.0.0.1:${proxy.address().port}` });
		return s;
	};
	const proxied = await fresh();
	const direct = session.fromPartition('exp8-direct');
	const base = `http://127.0.0.1:${server.address().port}`;

	const answer = (cb) => cb('user', 'secret');
	const cancel = (cb) => cb();

	const cases = [
		['P0 resolveProxy for http://exp8.test/', async () => proxied.resolveProxy('http://exp8.test/')],
		[
			'P1 session.fetch http via 407 proxy',
			async () => {
				const s = await fresh();
				return viaFetch(s.fetch.bind(s), 'http://exp8.test/');
			},
		],
		[
			'P2 net.request http via 407 proxy, login answered',
			async () => viaRequest({ url: 'http://exp8.test/', session: await fresh() }, answer),
		],
		[
			'P3 net.request http via 407 proxy, login cancelled',
			async () => viaRequest({ url: 'http://exp8.test/', session: await fresh() }, cancel),
		],
		[
			'P4 session.fetch https via 407 proxy (CONNECT)',
			async () => {
				const s = await fresh();
				return viaFetch(s.fetch.bind(s), 'https://exp8.test/');
			},
		],
		[
			'P5 net.request https via 407 proxy (CONNECT), login answered',
			async () => viaRequest({ url: 'https://exp8.test/', session: await fresh() }, answer),
		],
		[
			'P6 same session: net.request answers once, then session.fetch',
			async () => {
				const s = await fresh();
				const first = await viaRequest({ url: 'http://exp8.test/', session: s }, answer);
				const second = await viaFetch(s.fetch.bind(s), 'http://exp8.test/other');
				return { first: first.status, logins: first.logins.length, thenFetch: second.status };
			},
		],
		[
			'S1 net.request server 401 Basic, login listener cancels',
			() => viaRequest({ url: `${base}/basic`, session: direct }, cancel),
		],
		['S2 session.fetch server 401 Basic', () => viaFetch(direct.fetch.bind(direct), `${base}/basic`)],
		[
			'S3 net.request server 401 Bearer, login listener cancels',
			() => viaRequest({ url: `${base}/bearer`, session: direct }, cancel),
		],
		['S4 session.fetch server 401 Bearer', () => viaFetch(direct.fetch.bind(direct), `${base}/bearer`)],
	];

	const results = [];
	for (const [name, run] of cases) {
		const before = { proxy: proxyLog.length, server: serverLog.length };
		try {
			results.push({ name, result: await withTimeout(run()) });
		} catch (error) {
			results.push({ name, error: describe(error), logins: error?.logins });
		}
		results[results.length - 1].proxySaw = proxyLog.slice(before.proxy);
		results[results.length - 1].serverSaw = serverLog.slice(before.server);
	}
	console.log(JSON.stringify({ electron: process.versions.electron, results }, null, 2));
	proxy.close();
	server.close();
	app.quit();
});

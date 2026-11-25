// Node's fetch, same Node as Electron 45: does it carry Authorization across a cross-origin 307 in follow mode?
const http = require('node:http');
const seen = [];
const server = http.createServer((req, res) => {
	seen.push({ path: req.url, host: req.headers.host, authorization: req.headers.authorization ? 'present' : 'none' });
	if (req.url === '/redirect-cross') {
		res.writeHead(307, { location: `http://localhost:${server.address().port}/target` });
		return res.end();
	}
	res.end('target');
});
server.listen(0, '127.0.0.1', async () => {
	const r = await fetch(`http://127.0.0.1:${server.address().port}/redirect-cross`, {
		method: 'POST',
		body: 'x',
		headers: { authorization: 'Bearer secret-token' },
	});
	console.log(JSON.stringify({ node: process.versions.node, status: r.status, redirected: r.redirected, seen }));
	server.close();
});

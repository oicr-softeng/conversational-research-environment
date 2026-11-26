// Experiment 7: can Electron's Node read the system's certificates, and does Node's built-in fetch
// accept an undici dispatcher (option D)? Prints counts only, never certificate contents.
const { app } = require('electron');
const tls = require('node:tls');
const http = require('node:http');
const path = require('node:path');

// A throwaway profile, so the run leaves nothing in the repository or the real Electron profile.
app.setPath('userData', require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'fetch-option-')));
if (app.dock) app.dock.hide();

// The repository's undici, which must match the version inside Electron's Node (process.versions.undici).
const undiciPath = path.dirname(require.resolve('undici/package.json'));

app.whenReady().then(async () => {
	const out = {
		electron: process.versions.electron,
		node: process.versions.node,
		undiciBuiltIn: process.versions.undici,
	};
	const sets = {};
	for (const type of ['default', 'bundled', 'system', 'extra']) {
		try {
			sets[type] = tls.getCACertificates(type);
			out[`count_${type}`] = sets[type].length;
		} catch (error) {
			out[`count_${type}`] = `${error.constructor.name}: ${error.message}`;
		}
	}
	if (Array.isArray(sets.system) && Array.isArray(sets.bundled) && Array.isArray(sets.default)) {
		const bundled = new Set(sets.bundled);
		const dflt = new Set(sets.default);
		out.system_not_in_bundled = sets.system.filter((c) => !bundled.has(c)).length;
		out.system_not_in_default = sets.system.filter((c) => !dflt.has(c)).length;
		out.default_equals_bundled =
			sets.default.length === sets.bundled.length && sets.default.every((c) => bundled.has(c));
	}

	// Dispatcher compatibility, over plain HTTP on loopback.
	const server = http.createServer((req, res) => res.end('ok'));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const url = `http://127.0.0.1:${server.address().port}/`;
	try {
		const { Agent, version } = require(undiciPath);
		let connects = 0;
		const agent = new Agent({ connect: { ca: sets.system } }).compose((dispatch) => (opts, handler) => {
			connects++;
			return dispatch(opts, handler);
		});
		const res = await fetch(url, { dispatcher: agent });
		out.dispatcher = {
			undiciPackage: require(path.join(undiciPath, 'package.json')).version,
			status: res.status,
			body: await res.text(),
			dispatchedThroughAgent: connects,
		};
	} catch (error) {
		out.dispatcher = `${error.constructor.name}: ${error.message}`;
	}
	server.close();
	console.log(JSON.stringify(out, null, 2));
	app.quit();
});

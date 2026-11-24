import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAppServer } from '../server.js';

// Exercise the actual server request handler without binding a port. This also runs in restricted sandboxes.
async function withServer(options, run) {
  const server = createAppServer(options);
  const handler = server.listeners('request')[0];
  const base = 'http://127.0.0.1:4173';
  const send = async (url, options = {}) => {
    const request = Readable.from(options.body ? [String(options.body)] : []);
    request.method = options.method || 'GET';
    request.url = new URL(url).pathname;
    request.socket = { localPort: 4173 };
    request.headers = { host: '127.0.0.1:4173', ...Object.fromEntries(new Headers(options.headers)) };
    if (options.body instanceof URLSearchParams) request.headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    const headers = new Headers();
    let status = 200, body;
    const response = {
      writableEnded: false,
      setHeader(name, value) { headers.set(name, value); },
      writeHead(code, values) { status = code; for (const [name, value] of Object.entries(values)) headers.set(name, value); },
      end(value) { body = value; this.writableEnded = true; }
    };
    await handler(request, response);
    assert.ok(response.writableEnded, 'request must receive a completed response');
    return new Response(body, { status, headers });
  };
  await run(base, send);
}

test('server handler serves actual HTML and modules with a restrictive file allowlist', async () => {
  await withServer({}, async (base, send) => {
    const response = await send(base);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<script type="module" src="src\/app.js">/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    for (const name of ['app', 'api', 'compare', 'compare-view', 'demo', 'dom', 'identity', 'projects', 'projects-view']) assert.equal((await send(`${base}/src/${name}.js`)).status, 200, name);
    assert.equal((await send(`${base}/package.json`)).status, 404);
    assert.equal((await send(`${base}/server.js`)).status, 404);
  });
});

test('proxy permits only configured HTTPS targets, export operations and same-origin submissions', async () => {
  const target = 'https://redcap.example.org/api/'; let calls = 0;
  await withServer({ allowedUrls: [target], fetcher: async (url, options) => {
    calls++; assert.equal(url, target); assert.equal(options.redirect, 'error');
    assert.deepEqual([...options.body.keys()].sort(), ['content', 'format', 'returnFormat', 'token']);
    return Response.json({ project_title: 'DEV', in_production: 0, project_id: 1 });
  } }, async (base, send) => {
    const post = (changes = {}, origin = base) => send(`${base}/api/export`, { method: 'POST', headers: { Origin: origin }, body: new URLSearchParams({ apiUrl: target, token: 'synthetic-test-token', content: 'project', ...changes }) });
    assert.equal((await post()).status, 200);
    assert.equal((await post({}, 'https://untrusted.example.org')).status, 403);
    assert.equal((await post({ apiUrl: 'https://other.example.org/api/' })).status, 403);
    assert.equal((await post({ content: 'record' })).status, 400);
    assert.equal(calls, 1);
  });
});

test('proxy strips remote error text rather than leaking credentials', async () => {
  const target = 'https://redcap.example.org/api/';
  await withServer({ allowedUrls: [target], fetcher: async () => Response.json({ error: 'synthetic-secret' }) }, async (base, send) => {
    const response = await send(`${base}/api/export`, { method: 'POST', headers: { Origin: base }, body: new URLSearchParams({ apiUrl: target, token: 'synthetic-secret', content: 'project' }) });
    assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('synthetic-secret'));
  });
});

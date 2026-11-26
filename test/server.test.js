import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, relative, sep } from 'node:path';
import { createAppServer, publishSite } from '../server.js';

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
    for (const name of ['app', 'api', 'compare', 'compare-view', 'demo', 'dictionary', 'dictionary-view', 'dom', 'icons', 'identity', 'projects', 'projects-view', 'record', 'record-view', 'router', 'template', 'template-view', 'theme']) assert.equal((await send(`${base}/src/${name}.js`)).status, 200, name);
    const tabler = await send(`${base}/vendor/tabler/1.7.5/tabler.min.css`);
    assert.equal(tabler.status, 200);
    assert.match(tabler.headers.get('content-type'), /^text\/css/);
    assert.equal((await send(`${base}/vendor/tabler/1.7.5/LICENSE`)).status, 404);
    assert.equal((await send(`${base}/package.json`)).status, 404);
    assert.equal((await send(`${base}/server.js`)).status, 404);
  });
});

test('with an allowlist, the served page and both of its policies permit connections only to the listed REDCap origins', async () => {
  const allowedUrls = ['https://redcap.example.org/api/', 'https://redcap.example.org/other/api/', 'https://second.example.org/api/'];
  await withServer({ allowedUrls }, async (base, send) => {
    const response = await send(base), html = await response.text();
    const connect = policy => policy.match(/connect-src ([^;]+)/)[1];
    assert.equal(connect(response.headers.get('content-security-policy')), "'self' https://redcap.example.org https://second.example.org");
    assert.equal(connect(html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1]), "'self' https://redcap.example.org https://second.example.org");
    assert.match(html, /<meta name="redcap-api-urls" content="https:\/\/redcap.example.org\/api\/ https:\/\/redcap.example.org\/other\/api\/ https:\/\/second.example.org\/api\/">/);
  });
  await withServer({}, async (base, send) => {
    const response = await send(base), html = await response.text();
    assert.equal(html, await readFile(new URL('../index.html', import.meta.url), 'utf8'));
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self' https:;/);
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

test('proxy forwards the exportFieldNames export used by Upload template', async () => {
  const target = 'https://redcap.example.org/api/', contents = [];
  await withServer({ allowedUrls: [target], fetcher: async (url, options) => { contents.push(options.body.get('content')); return Response.json([{ original_field_name: 'record_id', choice_value: '', export_field_name: 'record_id' }]); } }, async (base, send) => {
    const response = await send(`${base}/api/export`, { method: 'POST', headers: { Origin: base }, body: new URLSearchParams({ apiUrl: target, token: 'synthetic-test-token', content: 'exportFieldNames' }) });
    assert.equal(response.status, 200);
    assert.deepEqual(contents, ['exportFieldNames']);
  });
});

test('proxy forwards a record export only for exactly one named record with fixed parameters', async () => {
  const target = 'https://redcap.example.org/api/', bodies = [];
  await withServer({ allowedUrls: [target], fetcher: async (url, options) => { bodies.push([...options.body.entries()].sort()); return Response.json([]); } }, async (base, send) => {
    const post = (params, extra = []) => { const body = new URLSearchParams({ apiUrl: target, token: 'synthetic-test-token', content: 'record', format: 'json', returnFormat: 'json', type: 'flat', rawOrLabel: 'raw', ...params }); for (const [key, value] of extra) body.append(key, value); for (const [key, value] of Object.entries(params)) if (value === null) body.delete(key); return send(`${base}/api/export`, { method: 'POST', headers: { Origin: base }, body }); };
    assert.equal((await post({ 'records[0]': 'SYN-001' })).status, 200);
    assert.equal((await post({ 'records[0]': 'SYN-001', type: null, rawOrLabel: null, format: null, returnFormat: null })).status, 200);
    for (const [params, extra, name] of [
      [{}, [], 'no record'], [{ 'records[0]': ' ' }, [], 'blank record'], [{ 'records[0]': 'SYN-001' }, [['records[1]', 'SYN-002']], 'second record'],
      [{ 'records[0]': 'SYN-001' }, [['records[0]', 'SYN-002']], 'repeated record'], [{ records: 'SYN-001' }, [], 'records without index'],
      [{ 'records[0]': 'SYN-001', type: 'eav' }, [], 'other type'], [{ 'records[0]': 'SYN-001', rawOrLabel: 'label' }, [], 'labels'], [{ 'records[0]': 'SYN-001', format: 'csv' }, [], 'other format'],
      [{ 'records[0]': 'SYN-001' }, [['fields[0]', 'record_id']], 'extra parameter'], [{ 'records[0]': 'SYN-001' }, [['filterLogic', '1']], 'filter logic']
    ]) assert.equal((await post(params, extra)).status, 400, name);
    const metadata = await send(`${base}/api/export`, { method: 'POST', headers: { Origin: base }, body: new URLSearchParams({ apiUrl: target, token: 'synthetic-test-token', content: 'metadata', 'records[0]': 'SYN-001' }) });
    assert.equal(metadata.status, 400);
    const expected = [['content', 'record'], ['format', 'json'], ['rawOrLabel', 'raw'], ['records[0]', 'SYN-001'], ['returnFormat', 'json'], ['token', 'synthetic-test-token'], ['type', 'flat']];
    assert.deepEqual(bodies, [expected, expected]);
  });
});

test('proxy strips remote error text rather than leaking credentials', async () => {
  const target = 'https://redcap.example.org/api/';
  await withServer({ allowedUrls: [target], fetcher: async () => Response.json({ error: 'synthetic-secret' }) }, async (base, send) => {
    const response = await send(`${base}/api/export`, { method: 'POST', headers: { Origin: base }, body: new URLSearchParams({ apiUrl: target, token: 'synthetic-secret', content: 'project' }) });
    assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('synthetic-secret'));
  });
});

// The files the page actually loads: index.html's script and stylesheet references, then each module's relative imports
// and the files it fetches by a path relative to the page, such as FAQ.md.
async function pageFiles() {
  const files = new Set(), pending = [];
  const add = (from, ref) => { const file = posix.join(posix.dirname(from), ref); if (!files.has(file)) { files.add(file); pending.push(file); } };
  add('', 'index.html');
  while (pending.length) {
    const file = pending.pop(), text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    if (file.endsWith('.html')) for (const [, ref] of text.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)) add(file, ref);
    if (file.endsWith('.js')) for (const [, ref] of text.matchAll(/^import\b[^'"]*['"](\.[^'"]+)['"]/gm)) add(file, ref);
    if (file.endsWith('.js')) for (const [, ref] of text.matchAll(/\bfetch\('([^'/][^']*)'/g)) add('', ref);
  }
  return [...files].sort();
}

test('the Pages site publishes exactly the files the page loads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pages-'));
  try {
    await publishSite(dir);
    const published = (await readdir(dir, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/')).sort();
    assert.deepEqual(published, await pageFiles());
    assert.equal(await readFile(join(dir, 'src/api.js'), 'utf8'), await readFile(new URL('../src/api.js', import.meta.url), 'utf8'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

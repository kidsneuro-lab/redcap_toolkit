import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateApiUrl } from './src/api.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const staticFiles = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/styles.css', ['styles.css', 'text/css']], ...['app', 'api', 'compare', 'demo'].map(name => [`/src/${name}.js`, [`src/${name}.js`, 'text/javascript']]),
  // PROTOTYPE, throwaway: toolkit shell variants.
  ['/prototype/toolkit-shell.html', ['prototype/toolkit-shell.html', 'text/html']], ['/prototype/toolkit-shell.css', ['prototype/toolkit-shell.css', 'text/css']], ['/prototype/toolkit-shell.js', ['prototype/toolkit-shell.js', 'text/javascript']], ['/vendor/tabler/1.7.5/tabler.min.css', ['vendor/tabler/1.7.5/tabler.min.css', 'text/css']]]);
const permittedExports = new Set(['project', 'instrument', 'metadata', 'repeatingFormsEvents']);
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

export function createAppServer({ allowedUrls = [], fetcher = fetch } = {}) {
  const allowed = new Set(allowedUrls.map(value => validateApiUrl(value)));
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', csp);
    response.setHeader('Referrer-Policy', 'no-referrer');
    const send = (status, message) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: message })); };
    const port = request.socket.localPort;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(request.headers.host)) return send(403, 'Invalid host.');
    const path = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
    if (request.method === 'POST' && path === '/api/export') {
      // Only this local page may submit credentials to the proxy. Upstream targets are separately allowlisted.
      if (![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(request.headers.origin)) return send(403, 'Invalid origin.');
      if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return send(415, 'Expected a form-encoded request.');
      try {
        let text = '';
        for await (const chunk of request) { text += chunk; if (Buffer.byteLength(text) > 32768) return send(413, 'Request too large.'); }
        const params = new URLSearchParams(text);
        let target;
        try { target = validateApiUrl(params.get('apiUrl')); } catch { return send(400, 'Invalid API URL.'); }
        if (!allowed.has(target)) return send(403, 'API URL is not allowed.');
        if (!permittedExports.has(params.get('content')) || !params.get('token')) return send(400, 'Invalid export request.');
        const body = new URLSearchParams({ token: params.get('token'), content: params.get('content'), format: 'json', returnFormat: 'json' });
        const upstream = await fetcher(target, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(30000) });
        if (!upstream.ok) return send(502, 'REDCap returned an unsuccessful response.');
        const data = await upstream.text();
        if (Buffer.byteLength(data) > 25 * 1024 * 1024) return send(502, 'Schema export exceeded 25 MB.');
        let json;
        try { json = JSON.parse(data); } catch { return send(502, 'REDCap did not return JSON.'); }
        if (json?.error) return send(502, 'REDCap rejected the export.');
        response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(json));
      } catch { if (!response.writableEnded) send(502, 'Could not retrieve the REDCap schema. Check connectivity and API access.'); }
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) return send(405, 'Method not allowed.');
    const file = staticFiles.get(path);
    if (!file) return send(404, 'Not found.');
    try {
      const content = await readFile(resolve(root, file[0]));
      response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); response.end(request.method === 'HEAD' ? undefined : content);
    } catch { send(500, 'Could not read application file.'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const server = createAppServer({ allowedUrls: (process.env.REDCAP_API_URLS || '').split(',').map(value => value.trim()).filter(Boolean) });
  server.listen(port, '127.0.0.1', () => console.log(`REDCap comparator: http://127.0.0.1:${server.address().port}`));
}

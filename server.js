import http from 'node:http';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { recordParameters, validateApiUrl } from './src/api.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const staticFiles = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/toolkit.css', ['toolkit.css', 'text/css']], ['/vendor/tabler/1.7.5/tabler.min.css', ['vendor/tabler/1.7.5/tabler.min.css', 'text/css']], ...['app', 'api', 'compare', 'compare-view', 'demo', 'dictionary', 'dictionary-view', 'dom', 'icons', 'identity', 'projects', 'projects-view', 'record', 'record-view', 'router', 'template', 'template-view', 'theme'].map(name => [`/src/${name}.js`, [`src/${name}.js`, 'text/javascript']])]);
// The Release workflow publishes exactly these files to GitHub Pages.
export async function publishSite(dir) {
  for (const file of new Set([...staticFiles.values()].map(([file]) => file))) {
    await mkdir(dirname(resolve(dir, file)), { recursive: true });
    await copyFile(resolve(root, file), resolve(dir, file));
  }
}
const permittedExports = new Set(['project', 'instrument', 'metadata', 'repeatingFormsEvents', 'exportFieldNames', 'record']);
const fixedParameters = { format: 'json', returnFormat: 'json' };
// The upstream body for a valid request, or undefined. Each key may appear once, fixed parameters may only take their fixed values, and a record export must name exactly one record.
function exportBody(params) {
  const content = params.get('content'), record = content === 'record';
  const fixed = { ...fixedParameters, ...(record && recordParameters) }, keys = [...params.keys()];
  const permitted = new Set(['apiUrl', 'token', 'content', ...Object.keys(fixed), ...(record ? ['records[0]'] : [])]);
  if (!permittedExports.has(content) || !params.get('token') || new Set(keys).size !== keys.length || keys.some(key => !permitted.has(key))) return;
  if (Object.entries(fixed).some(([key, value]) => params.has(key) && params.get(key) !== value)) return;
  if (record && !params.get('records[0]')?.trim()) return;
  return new URLSearchParams({ token: params.get('token'), content, ...fixed, ...(record && { 'records[0]': params.get('records[0]') }) });
}
// With allowed API URLs, the page may connect only to their origins. Without, to any HTTPS host, as direct access needs.
const connectSources = urls => urls.length ? ["'self'", ...new Set(urls.map(url => new URL(url).origin))].join(' ') : "'self' https:";
const csp = urls => `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src ${connectSources(urls)}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
// The page with the allowed API URLs for the app to enforce and its meta policy narrowed to match. Unchanged without any.
export function pageWithAllowlist(html, urls) {
  if (!urls.length) return html;
  return html.replace(/connect-src [^;]+;/, `connect-src ${connectSources(urls)};`).replace('<meta name="referrer"', `<meta name="redcap-api-urls" content="${urls.join(' ')}">\n  <meta name="referrer"`);
}

export function createAppServer({ allowedUrls = [], fetcher = fetch } = {}) {
  const allowed = new Set(allowedUrls.map(value => validateApiUrl(value))), policy = csp([...allowed]);
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', policy);
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
        const body = exportBody(params);
        if (!body) return send(400, 'Invalid export request.');
        const upstream = await fetcher(target, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(30000) });
        if (!upstream.ok) return send(502, 'REDCap returned an unsuccessful response.');
        const data = await upstream.text();
        if (Buffer.byteLength(data) > 25 * 1024 * 1024) return send(502, 'Export exceeded 25 MB.');
        let json;
        try { json = JSON.parse(data); } catch { return send(502, 'REDCap did not return JSON.'); }
        if (json?.error) return send(502, 'REDCap rejected the export.');
        response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(json));
      } catch { if (!response.writableEnded) send(502, 'Could not retrieve the REDCap export. Check connectivity and API access.'); }
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) return send(405, 'Method not allowed.');
    const file = staticFiles.get(path);
    if (!file) return send(404, 'Not found.');
    try {
      const content = file[0] === 'index.html' ? pageWithAllowlist(await readFile(resolve(root, file[0]), 'utf8'), [...allowed]) : await readFile(resolve(root, file[0]));
      response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); response.end(request.method === 'HEAD' ? undefined : content);
    } catch { send(500, 'Could not read application file.'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const server = createAppServer({ allowedUrls: (process.env.REDCAP_API_URLS || '').split(',').map(value => value.trim()).filter(Boolean) });
  server.listen(port, '127.0.0.1', () => console.log(`REDCap Toolkit: http://127.0.0.1:${server.address().port}`));
}

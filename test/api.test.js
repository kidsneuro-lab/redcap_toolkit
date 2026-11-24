import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchExport, validateApiUrl, validateResponse } from '../src/api.js';

const config = { apiUrl: 'https://redcap.example.org/api/', token: 'synthetic-test-secret' };
test('API requests use form POST bodies and never put tokens in the URL', async () => {
  const value = await fetchExport(config, 'project', { fetcher: async (url, options) => {
    assert.equal(url, config.apiUrl);
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('token'), config.token);
    assert.equal(options.body.get('content'), 'project');
    return Response.json({ project_title: 'DEV', project_id: 1, in_production: 0 });
  } });
  assert.equal(value.project_id, 1);
});
test('proxy requests include target API URL in body', async () => {
  await fetchExport(config, 'repeating', { proxy: true, fetcher: async (url, options) => {
    assert.equal(url, '/api/export'); assert.equal(options.body.get('apiUrl'), config.apiUrl);
    assert.equal(options.body.get('content'), 'repeatingFormsEvents'); return Response.json([]);
  } });
});
test('remote error text is not exposed, including HTTP 200 API error objects', async () => {
  await assert.rejects(fetchExport(config, 'metadata', { fetcher: async () => Response.json({ error: config.token }) }), error => !error.message.includes(config.token) && /rejected/.test(error.message));
  await assert.rejects(fetchExport(config, 'metadata', { fetcher: async () => new Response(config.token, { status: 403 }) }), /HTTP 403/);
});
test('invalid JSON, wrong response shapes and empty metadata cannot become a match', async () => {
  await assert.rejects(fetchExport(config, 'metadata', { fetcher: async () => new Response('<html>Login</html>') }), /valid JSON/);
  assert.throws(() => validateResponse('metadata', {}), /unexpected response/);
  assert.throws(() => validateResponse('metadata', []), /must contain fields/);
  assert.throws(() => validateResponse('instruments', []), /unexpectedly empty/);
  assert.deepEqual(validateResponse('repeating', []), []);
});
test('network failures give actionable information without revealing credentials', async () => {
  await assert.rejects(fetchExport(config, 'metadata', { hostname: '127.0.0.1', fetcher: async () => { throw new Error(config.token); } }), error => /CORS/.test(error.message) && !error.message.includes(config.token));
});
test('network failures on a hosted site suggest running locally with the proxy', async () => {
  const fail = async () => { throw new TypeError('Failed to fetch'); };
  for (const hostname of ['h-joshi.github.io', '127.0.0.1.example.org']) await assert.rejects(fetchExport(config, 'metadata', { hostname, fetcher: fail }), { message: 'This REDCap may not allow requests from this site. Run the toolkit locally with the proxy (see README).' }, hostname);
  for (const hostname of ['127.0.0.1', 'localhost']) await assert.rejects(fetchExport(config, 'metadata', { hostname, fetcher: fail }), /Could not read metadata/, hostname);
});
test('API URL validation rejects insecure endpoints and embedded credentials', () => {
  for (const url of ['http://example.org/api/', 'https://user:password@example.org/api/', 'https://example.org/api/?token=secret', 'https://example.org/api/#token']) assert.throws(() => validateApiUrl(url));
});
test('exportFieldNames is requested as a read-only export and malformed or empty responses are rejected', async () => {
  const rows = [{ original_field_name: 'record_id', choice_value: '', export_field_name: 'record_id' }, { original_field_name: 'symptoms', choice_value: '-9', export_field_name: 'symptoms____9' }];
  const value = await fetchExport(config, 'fieldNames', { fetcher: async (url, options) => { assert.equal(options.body.get('content'), 'exportFieldNames'); return Response.json(rows); } });
  assert.deepEqual(value, rows);
  assert.throws(() => validateResponse('fieldNames', []), /unexpectedly empty/);
  assert.throws(() => validateResponse('fieldNames', { record_id: 'record_id' }), /unexpected response/);
  assert.throws(() => validateResponse('fieldNames', [{ original_field_name: 'record_id', choice_value: '' }]), /missing export_field_name/);
  assert.throws(() => validateResponse('fieldNames', [{ choice_value: '', export_field_name: 'record_id' }]), /missing original_field_name/);
});

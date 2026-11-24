export const exportsBySection = { project: 'project', instruments: 'instrument', repeating: 'repeatingFormsEvents', metadata: 'metadata' };

export function validateApiUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Use an HTTPS REDCap API URL.');
  if (url.username || url.password || url.search || url.hash) throw new Error('The API URL must not contain credentials, a query or a fragment.');
  return url.href;
}

export function validateResponse(section, value) {
  if (section === 'project') {
    if (!value || Array.isArray(value) || typeof value !== 'object' || typeof value.project_title !== 'string') throw new Error('Project Info returned an unexpected response.');
  } else {
    if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error(`${section} returned an unexpected response.`);
    const required = { instruments: 'instrument_name', metadata: 'field_name', repeating: 'form_name' }[section];
    if (value.some(row => typeof row[required] !== 'string' || !row[required])) throw new Error(`${section} contains a missing ${required}.`);
    if (section === 'metadata' && (!value.length || value.some(row => typeof row.form_name !== 'string' || !row.form_name))) throw new Error('Metadata must contain fields and instrument names.');
    if (section === 'instruments' && !value.length) throw new Error('The instrument export was unexpectedly empty.');
  }
  return value;
}

export async function fetchExport(config, section, { signal, proxy = false, fetcher = fetch } = {}) {
  const apiUrl = validateApiUrl(config.apiUrl);
  const body = new URLSearchParams({ token: config.token, content: exportsBySection[section], format: 'json', returnFormat: 'json' });
  if (proxy) body.set('apiUrl', apiUrl);
  let response;
  try {
    response = await fetcher(proxy ? '/api/export' : apiUrl, { method: 'POST', body, signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Could not read ${section}. Check the API URL, network and CORS permissions, or use the local proxy.`);
  }
  if (!response.ok) throw new Error(`${section} request failed with HTTP ${response.status}. Check API permissions and connectivity.`);
  let value;
  try { value = await response.json(); } catch { throw new Error(`${section} did not return valid JSON.`); }
  // Do not surface remote error text: it may contain credentials or HTML.
  if (value?.error) throw new Error(`REDCap rejected the ${section} export. Check the token and API export privileges.`);
  return validateResponse(section, value);
}

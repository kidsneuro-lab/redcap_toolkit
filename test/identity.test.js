import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIdentity, validatePair } from '../src/identity.js';

test('identity validation requires exact title independently of descriptive tags', () => {
  const config = { expectedTitle: 'Phase 1 DEV', tags: ['PROD'] };
  const info = { project_title: 'Phase 1 DEV', project_id: 1, in_production: '0', is_longitudinal: 0 };
  assert.deepEqual(validateIdentity(config, info), []);
  assert.match(validateIdentity(config, { ...info, project_title: 'Phase 1 DEV ' })[0], /title mismatch/);
  assert.deepEqual(validateIdentity(config, { ...info, in_production: '1' }), []);
  assert.deepEqual(validateIdentity({ expectedTitle: info.project_title }, info), []);
  assert.match(validateIdentity(config, { ...info, is_longitudinal: 1 })[0], /longitudinal/);
});

test('duplicate underlying projects are rejected despite URL slash or numeric ID differences', () => {
  assert.throws(() => validatePair({ apiUrl: 'https://example.org/api/' }, { project_id: 1 }, { apiUrl: 'https://example.org/api' }, { project_id: '1' }), /same REDCap project/);
  assert.doesNotThrow(() => validatePair({ apiUrl: 'https://example.org/api/' }, { project_id: 1 }, { apiUrl: 'https://other.example.org/api/' }, { project_id: 1 }));
});

test('identity validation requires a project ID', () => {
  const config = { expectedTitle: 'Synthetic project' };
  for (const project_id of [undefined, null, '']) {
    assert.deepEqual(validateIdentity(config, { project_title: config.expectedTitle, project_id }), ['Project Info did not return a project ID.']);
  }
});

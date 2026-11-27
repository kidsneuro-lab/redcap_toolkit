import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProjectInfo, validateIdentity, validatePair } from '../src/identity.js';

test('identity validation requires the saved project ID, and a title change or tags do not matter', () => {
  const config = { projectId: '1', title: 'Phase 1 DEV', tags: ['PROD'] };
  const info = { project_title: 'Phase 1 DEV', project_id: 1, in_production: '0', is_longitudinal: 0 };
  assert.deepEqual(validateIdentity(config, info), []);
  assert.deepEqual(validateIdentity(config, { ...info, project_title: 'Renamed study' }), []);
  assert.deepEqual(validateIdentity(config, { ...info, in_production: '1' }), []);
  assert.match(validateIdentity(config, { ...info, project_id: 2 })[0], /Project ID mismatch\. Expected 1; received 2\./);
  assert.match(validateIdentity(config, { ...info, is_longitudinal: 1 })[0], /longitudinal/);
});

test('a project saved before project IDs were recorded cannot be used until its token is checked', () => {
  const issues = validateIdentity({ expectedTitle: 'Phase 1 DEV', tags: [] }, { project_title: 'Phase 1 DEV', project_id: 1 });
  assert.deepEqual(issues, ['This project has no recorded project ID. Enter its token in Projects to check it.']);
});

test('duplicate underlying projects are rejected despite URL slash or numeric ID differences', () => {
  assert.throws(() => validatePair({ apiUrl: 'https://example.org/api/' }, { project_id: 1 }, { apiUrl: 'https://example.org/api' }, { project_id: '1' }), /same REDCap project/);
  assert.doesNotThrow(() => validatePair({ apiUrl: 'https://example.org/api/' }, { project_id: 1 }, { apiUrl: 'https://other.example.org/api/' }, { project_id: 1 }));
});

test('identity validation requires a project ID', () => {
  const config = { projectId: '1', title: 'Synthetic project' };
  for (const project_id of [undefined, null, '']) {
    assert.deepEqual(validateIdentity(config, { project_title: config.title, project_id }), ['Project Info did not return a project ID.']);
  }
});

const info = { project_id: 101, project_title: 'Synthetic study', in_production: 0, is_longitudinal: 0 };

test('checking a new project takes its title from Project Info and tags it PROD or DEV', () => {
  const added = { id: 'one', projectId: '101', tags: ['Phase 1'], apiUrl: 'https://demo.invalid/api/' };
  assert.deepEqual(checkProjectInfo(added, info), { project: { ...added, title: 'Synthetic study', inProduction: false, tags: ['Phase 1', 'DEV'] }, notices: [] });
  assert.deepEqual(checkProjectInfo(added, { ...info, in_production: '1' }).project.tags, ['Phase 1', 'PROD']);
});

test('a token is refused when it belongs to another project, the project is longitudinal or its production status is unrecognised', () => {
  const saved = { id: 'one', projectId: '101', title: 'Synthetic study', inProduction: false, tags: ['DEV'], apiUrl: 'https://demo.invalid/api/' };
  assert.throws(() => checkProjectInfo(saved, { ...info, project_id: 202 }), { message: 'This token belongs to project ID 202, not 101.' });
  assert.throws(() => checkProjectInfo(saved, { ...info, project_id: '' }), { message: 'Project Info did not return a project ID.' });
  assert.throws(() => checkProjectInfo(saved, { ...info, is_longitudinal: 1 }), { message: 'This project is longitudinal. This app supports classic projects only.' });
  for (const in_production of [undefined, 'yes', 2]) assert.throws(() => checkProjectInfo(saved, { ...info, in_production }), { message: 'Project Info returned an unrecognised production status.' });
});

test('a later check refreshes the title and replaces the PROD or DEV tag only when the production status changes', () => {
  const saved = { id: 'one', projectId: '101', title: 'Synthetic study', inProduction: false, tags: ['dev', 'Phase 1'], apiUrl: 'https://demo.invalid/api/' };
  assert.deepEqual(checkProjectInfo(saved, { ...info, project_title: 'Renamed study', in_production: 1 }), {
    project: { ...saved, title: 'Renamed study', inProduction: true, tags: ['Phase 1', 'PROD'] },
    notices: ['Title changed from "Synthetic study" to "Renamed study".', 'Synthetic study moved to production. Its DEV tag is now PROD.']
  });
  const untagged = { ...saved, tags: ['Phase 1'] };
  assert.deepEqual(checkProjectInfo(untagged, info), { project: untagged, notices: [] });
});

test('the first check of a project saved before project IDs requires its old title, then records the project ID', () => {
  const legacy = { id: 'old', label: 'Old label', expectedTitle: 'Synthetic study', tags: ['PROD'], apiUrl: 'https://demo.invalid/api/' };
  assert.deepEqual(checkProjectInfo(legacy, info), { project: { id: 'old', projectId: '101', title: 'Synthetic study', inProduction: false, tags: ['DEV'], apiUrl: 'https://demo.invalid/api/' }, notices: [] });
  assert.throws(() => checkProjectInfo(legacy, { ...info, project_title: 'Synthetic study ' }), { message: 'This token belongs to "Synthetic study ", not the saved title "Synthetic study".' });
});

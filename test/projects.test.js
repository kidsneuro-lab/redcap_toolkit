import test from 'node:test';
import assert from 'node:assert/strict';
import { containsTokenShape, projectName, readProjects, writeProjects } from '../src/projects.js';
import { fakeStorage } from './storage.js';

test('token-shaped text contains a standalone run of exactly 32 or 64 hexadecimal characters', () => {
  const token = '0123456789aBcDeF'.repeat(2);
  for (const text of [token, `Study (${token}) follow-up`, `study_${token}_DEV`, token.repeat(2)]) {
    assert.equal(containsTokenShape(text), true, text);
  }
  for (const text of [token.slice(1), `${token}0`, `${token.repeat(2)}0`, 'G'.repeat(32), `G${token}`, `${token}7`, `é${token}`, `${token}２`, 'Study 2026 (Phase 1)']) {
    assert.equal(containsTokenShape(text), false, text);
  }
});

test('checked project configurations round trip with their project ID, title and production status, without tokens', () => {
  const storage = fakeStorage();
  const saved = { id: 'one', projectId: '101', title: 'Synthetic title', inProduction: false, tags: ['DEV'], apiUrl: 'https://demo.invalid/api/' };
  writeProjects(storage, [{ ...saved, token: 'synthetic-secret' }]);
  assert.ok(![...storage.items.values()].some(value => value.includes('synthetic-secret')));
  assert.deepEqual(readProjects(storage), [saved]);
});

test('a project saved before project IDs keeps its expected title until checked, and its display label is dropped', () => {
  const storage = fakeStorage({ 'redcap-toolkit.projects.v1': JSON.stringify([{ id: 'legacy', label: 'Existing', expectedTitle: 'Existing title', tags: ['DEV'], apiUrl: 'https://demo.invalid/api/' }]) });
  const projects = readProjects(storage);
  assert.deepEqual(projects, [{ id: 'legacy', expectedTitle: 'Existing title', tags: ['DEV'], apiUrl: 'https://demo.invalid/api/' }]);
  writeProjects(storage, projects);
  assert.deepEqual(readProjects(storage), projects);
});

test('a saved configuration with neither a checked project ID nor an expected title is refused', () => {
  for (const config of [{ id: 'one', title: 'Synthetic title', inProduction: false, tags: [], apiUrl: 'https://demo.invalid/api/' }, { id: 'one', projectId: '101', inProduction: false, tags: [], apiUrl: 'https://demo.invalid/api/' }, { id: 'one', projectId: '101', title: 'Synthetic title', tags: [], apiUrl: 'https://demo.invalid/api/' }, { id: 'one', label: 'Synthetic', tags: [], apiUrl: 'https://demo.invalid/api/' }]) {
    assert.throws(() => readProjects(fakeStorage({ 'redcap-toolkit.projects.v1': JSON.stringify([config]) })), /incomplete/);
  }
});

test('old phase and environment labels load as tags', () => {
  const storage = fakeStorage({ 'redcap-toolkit.projects.v1': JSON.stringify([{ id: 'legacy', label: 'Existing', expectedTitle: 'Existing title', phase: 'Phase 1', environment: 'PROD', apiUrl: 'https://demo.invalid/api/' }]) });
  assert.deepEqual(readProjects(storage)[0].tags, ['Phase 1', 'PROD']);
});

test('a configuration saved under the old key comes through intact and the old key is removed', () => {
  const saved = [{ id: 'old', expectedTitle: 'Old title', tags: ['DEV'], apiUrl: 'https://demo.invalid/api/' }];
  const storage = fakeStorage({ 'redcap-comparator.projects.v1': JSON.stringify(saved.map(project => ({ ...project, label: 'Old' }))) });
  assert.deepEqual(readProjects(storage), saved);
  assert.deepEqual(JSON.parse(storage.getItem('redcap-toolkit.projects.v1')), saved);
  assert.equal(storage.getItem('redcap-comparator.projects.v1'), null);
});

test('the old key is kept and its projects still load when saving under the new key fails', () => {
  const saved = [{ id: 'old', expectedTitle: 'Old title', tags: [], apiUrl: 'https://demo.invalid/api/' }];
  const storage = fakeStorage({ 'redcap-comparator.projects.v1': JSON.stringify(saved) });
  storage.setItem = () => { throw new Error('Synthetic quota exceeded.'); };
  assert.deepEqual(readProjects(storage), saved);
  assert.deepEqual(JSON.parse(storage.getItem('redcap-comparator.projects.v1')), saved);
  assert.equal(storage.getItem('redcap-toolkit.projects.v1'), null);
});

test('Tool pickers name a project by title, project ID and tags, so projects with the same title can be told apart', () => {
  assert.equal(projectName({ projectId: '101', title: 'Synthetic study', tags: ['Phase 1', 'DEV'] }), 'Synthetic study (PID 101) · Phase 1 · DEV');
  assert.equal(projectName({ expectedTitle: 'Synthetic study', tags: [] }), 'Synthetic study (project ID not checked)');
});

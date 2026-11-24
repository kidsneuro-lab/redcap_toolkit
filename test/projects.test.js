import test from 'node:test';
import assert from 'node:assert/strict';
import { readProjects, writeProjects } from '../src/projects.js';

function fakeStorage(entries = {}) {
  const items = new Map(Object.entries(entries));
  return {
    items,
    getItem: key => items.has(key) ? items.get(key) : null,
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: key => { items.delete(key); }
  };
}

test('saved project configurations round trip without tokens', () => {
  const storage = fakeStorage();
  writeProjects(storage, [{ id: 'one', label: 'Synthetic', expectedTitle: 'Synthetic title', tags: ['DEV'], apiUrl: 'https://demo.invalid/api/', token: 'synthetic-secret' }]);
  assert.ok(![...storage.items.values()].some(value => value.includes('synthetic-secret')));
  assert.deepEqual(readProjects(storage), [{ id: 'one', label: 'Synthetic', expectedTitle: 'Synthetic title', tags: ['DEV'], apiUrl: 'https://demo.invalid/api/' }]);
});

test('old phase and environment labels load as tags', () => {
  const storage = fakeStorage({ 'redcap-toolkit.projects.v1': JSON.stringify([{ id: 'legacy', label: 'Existing', expectedTitle: 'Existing title', phase: 'Phase 1', environment: 'PROD', apiUrl: 'https://demo.invalid/api/' }]) });
  assert.deepEqual(readProjects(storage)[0].tags, ['Phase 1', 'PROD']);
});

test('a configuration saved under the old key comes through intact and the old key is removed', () => {
  const saved = [{ id: 'old', label: 'Old', expectedTitle: 'Old title', tags: ['DEV'], apiUrl: 'https://demo.invalid/api/' }];
  const storage = fakeStorage({ 'redcap-comparator.projects.v1': JSON.stringify(saved) });
  assert.deepEqual(readProjects(storage), saved);
  assert.deepEqual(JSON.parse(storage.getItem('redcap-toolkit.projects.v1')), saved);
  assert.equal(storage.getItem('redcap-comparator.projects.v1'), null);
});

test('the old key is kept and its projects still load when saving under the new key fails', () => {
  const saved = [{ id: 'old', label: 'Old', expectedTitle: 'Old title', tags: [], apiUrl: 'https://demo.invalid/api/' }];
  const storage = fakeStorage({ 'redcap-comparator.projects.v1': JSON.stringify(saved) });
  storage.setItem = () => { throw new Error('Synthetic quota exceeded.'); };
  assert.deepEqual(readProjects(storage), saved);
  assert.deepEqual(JSON.parse(storage.getItem('redcap-comparator.projects.v1')), saved);
  assert.equal(storage.getItem('redcap-toolkit.projects.v1'), null);
});

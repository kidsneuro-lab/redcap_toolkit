import test from 'node:test';
import assert from 'node:assert/strict';
import { installDocument } from './dom.js';
import { fakeStorage } from './storage.js';
import { mountProjects } from '../src/projects-view.js';

function mountView(saved) {
  const document = installDocument();
  const container = document.createElement('div');
  const storage = fakeStorage(saved === undefined ? {} : { 'redcap-toolkit.projects.v1': JSON.stringify(saved) });
  const notices = [];
  const view = mountProjects(container, { storage, notice: (message, error = false) => notices.push({ message, error }) });
  const $ = id => { const node = container.querySelector(`#${id}`); assert.ok(node, `Unknown element: ${id}`); return node; };
  const save = (label, tags = '', token = 'synthetic-secret') => {
    $('new-project').click();
    for (const [id, value] of Object.entries({ label, 'expected-title': label, tags, 'api-url': 'https://demo.invalid/api/', token })) $(id).value = value;
    $('project-form').dispatch('submit');
    assert.equal($('form-error').textContent, '');
  };
  const button = text => [...container.descendants()].find(node => node.tagName === 'BUTTON' && node.textContent === text);
  return { view, $, save, button, notices, stored: () => JSON.parse(storage.getItem('redcap-toolkit.projects.v1')) };
}

test('saved projects keep normalised tags and their session tokens, and tokens are never stored', () => {
  const ui = mountView();
  const changes = [];
  ui.view.onProjectsChange(projects => changes.push(projects.length));
  ui.save('First', ' DEV, custom, DEV, , <tag> ');
  ui.save('Second', '', 'second-secret');
  assert.deepEqual(ui.stored().map(project => project.tags), [['DEV', 'custom', '<tag>'], []]);
  assert.ok(ui.stored().every(project => !('token' in project)));
  assert.deepEqual(ui.view.projects().map(project => [project.label, project.token]), [['First', 'synthetic-secret'], ['Second', 'second-secret']]);
  assert.deepEqual(changes, [1, 2]);
});

test('old group and environment labels load as tags, keep project details and discard saved tokens', () => {
  const ui = mountView([{ id: 'legacy', label: 'Existing', expectedTitle: 'Existing title', phase: 'Phase 1', environment: 'PROD', apiUrl: 'https://demo.invalid/api/', token: 'must-not-load' }]);
  assert.deepEqual(ui.view.projects().map(project => [project.tags, project.token]), [[['Phase 1', 'PROD'], '']]);
  assert.equal(ui.notices.length, 0);
  ui.button('Edit').click();
  assert.equal(ui.$('tags').value, 'Phase 1, PROD');
  ui.$('project-form').dispatch('submit');
  assert.deepEqual(ui.stored(), [{ id: 'legacy', label: 'Existing', expectedTitle: 'Existing title', tags: ['Phase 1', 'PROD'], apiUrl: 'https://demo.invalid/api/' }]);
});

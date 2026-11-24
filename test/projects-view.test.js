import test from 'node:test';
import assert from 'node:assert/strict';
import { installDocument } from './dom.js';
import { fakeStorage } from './storage.js';
import { mountProjects } from '../src/projects-view.js';

function mountView(saved, hostname = '127.0.0.1') {
  const document = installDocument();
  const container = document.createElement('div'), trigger = document.createElement('div');
  const storage = fakeStorage(saved === undefined ? {} : { 'redcap-toolkit.projects.v1': JSON.stringify(saved) });
  const notices = [];
  const view = mountProjects(container, { trigger, hostname, storage, notice: (message, error = false) => notices.push({ message, error }) });
  const $ = id => { const node = container.querySelector(`#${id}`) || trigger.querySelector(`#${id}`); assert.ok(node, `Unknown element: ${id}`); return node; };
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

test('the Projects button counts session tokens, orange while any is missing and green when all are entered', () => {
  const ui = mountView();
  const count = () => [ui.$('token-count').textContent, ui.$('token-count').className.match(/bg-(orange|green)-lt/)?.[1]];
  assert.deepEqual(count(), ['No projects', 'orange']);
  ui.save('First');
  ui.save('Second', '', '');
  assert.deepEqual(count(), ['1 of 2 tokens', 'orange']);
  ui.button('Enter token').click();
  ui.$('token').value = 'second-secret';
  ui.$('project-form').dispatch('submit');
  assert.deepEqual(count(), ['2 of 2 tokens', 'green']);
});

test('the drawer opens modally from its button or a Tool request, and a request with none configured starts a new project', () => {
  const ui = mountView();
  const drawer = ui.$('projects-drawer');
  assert.equal(drawer.open, false);
  ui.$('projects-button').click();
  assert.equal(drawer.open, true);
  assert.equal(drawer.modal, true);
  ui.$('close-projects').click();
  assert.equal(drawer.open, false);
  ui.view.show(true, { addIfEmpty: true });
  assert.equal(drawer.open, true);
  assert.equal(ui.$('project-form').hidden, false);
  assert.equal(ui.$('label').ownerDocument.activeElement, ui.$('label'));
});

test('the proxy switch is offered only when the page is served locally, and is off until chosen', () => {
  for (const hostname of ['127.0.0.1', 'localhost']) {
    const ui = mountView(undefined, hostname);
    assert.equal(ui.$('proxy-setting').hidden, false, hostname);
    assert.equal(ui.view.proxy(), false);
    ui.$('proxy').checked = true;
    assert.equal(ui.view.proxy(), true);
  }
  for (const hostname of ['h-joshi.github.io', 'redcap.example.org', '127.0.0.1.example.org']) {
    const ui = mountView(undefined, hostname);
    assert.equal(ui.$('proxy-setting').hidden, true, hostname);
    assert.equal(ui.view.proxy(), false);
  }
});

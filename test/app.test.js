import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as comparison from '../src/compare.js';
import * as identity from '../src/identity.js';
import * as projects from '../src/projects.js';
import * as api from '../src/api.js';
import { demoSnapshots } from '../src/demo.js';

const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

// A minimal DOM exercises real app handlers without a browser or dependencies.
function app(saved = []) {
  const nodes = new Map();
  class Node {
    constructor(text = '', value = '') { this.textContent = text; this.value = value; this.children = []; this.events = {}; this.hidden = false; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    add(child) { this.append(child); }
    setAttribute() {}
    addEventListener(name, handler) { this.events[name] = handler; }
    focus() {}
    reset() { for (const id of ['project-id', 'label', 'expected-title', 'tags', 'api-url', 'token']) nodes.get(id).value = ''; }
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(id, new Node());
  let stored = JSON.stringify(saved), sequence = 0;
  const requests = [], downloads = [];
  const { left } = demoSnapshots();
  const context = vm.createContext({
    ...comparison, ...identity, ...projects, ...api, demoSnapshots, console, AbortController, setTimeout, clearTimeout, Blob,
    crypto: { randomUUID: () => `project-${++sequence}` },
    URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:synthetic'; }, revokeObjectURL() {} },
    document: { getElementById: id => { assert.ok(nodes.has(id), `Unknown element: ${id}`); return nodes.get(id); }, createElement: () => new Node(), createTextNode: text => new Node(text) },
    Option: Node,
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } },
    fetchExport: async (config, section) => {
      requests.push([config.id, section]);
      return section === 'project' ? { ...left.project, project_id: config.id, project_title: config.expectedTitle, in_production: 1 } : structuredClone(left[section]);
    }
  });
  Node.prototype.click = function () { return this.events.click?.(); };
  vm.runInContext(source, context, { filename: 'app.js' });
  const read = expression => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
  const save = (label, tags = '') => {
    nodes.get('new-project').click();
    for (const [id, value] of Object.entries({ label, 'expected-title': label, tags, 'api-url': 'https://demo.invalid/api/', token: 'synthetic-secret' })) nodes.get(id).value = value;
    nodes.get('project-form').events.submit({ preventDefault() {} });
    assert.equal(nodes.get('form-error').textContent, '');
  };
  return { nodes, read, save, requests, downloads, stored: () => JSON.parse(stored), run: code => vm.runInContext(code, context) };
}

test('optional free-text tags persist, normalise and appear in the downloaded report without tokens', async () => {
  const ui = app();
  ui.save('First', ' DEV, custom, DEV, , <tag> ');
  ui.save('Second');
  assert.deepEqual(ui.stored().map(project => project.tags), [['DEV', 'custom', '<tag>'], []]);
  assert.ok(ui.stored().every(project => !('token' in project)));
  ui.nodes.get('reference').value = 'project-1'; ui.nodes.get('comparison').value = 'project-2';
  await ui.nodes.get('compare').click();
  assert.equal(ui.read('report.projects[0].validation'), 'title verified');
  assert.deepEqual(ui.read('report.projects.map(project => project.tags)'), [['DEV', 'custom', '<tag>'], []]);
  assert.equal(ui.requests.length, 8);
  assert.equal(ui.nodes.get('report').hidden, false);
  ui.nodes.get('download').click();
  const downloaded = await ui.downloads[0].text();
  assert.ok(!downloaded.includes('synthetic-secret'));
  assert.deepEqual(JSON.parse(downloaded).projects[0].tags, ['DEV', 'custom', '<tag>']);
});

test('same DEV tags and different group tags allow comparison regardless of production status', async () => {
  const ui = app();
  ui.save('First', 'DEV, Group A'); ui.save('Second', 'DEV, Group B');
  ui.nodes.get('reference').value = 'project-1'; ui.nodes.get('comparison').value = 'project-2';
  await ui.nodes.get('compare').click();
  assert.equal(ui.requests.length, 8);
  assert.equal(ui.read('report.demo'), false);
  assert.ok(ui.read('report.projects.every(project => project.validation === "title verified")'));
});

test('legacy group and environment labels load as tags, retain project details and discard saved tokens', () => {
  const ui = app([{ id: 'legacy', label: 'Existing', expectedTitle: 'Existing title', phase: 'Phase 1', environment: 'PROD', apiUrl: 'https://demo.invalid/api/', token: 'must-not-load' }]);
  assert.deepEqual(ui.read('projects[0].tags'), ['Phase 1', 'PROD']);
  assert.equal(ui.read('projects[0].token'), '');
  ui.run('editProject(projects[0])');
  assert.equal(ui.nodes.get('tags').value, 'Phase 1, PROD');
  ui.nodes.get('project-form').events.submit({ preventDefault() {} });
  assert.deepEqual(ui.stored(), [{ id: 'legacy', label: 'Existing', expectedTitle: 'Existing title', tags: ['Phase 1', 'PROD'], apiUrl: 'https://demo.invalid/api/' }]);
});

test('duplicate selections are still blocked and demo reports retain descriptive tags', async () => {
  const ui = app(); ui.save('First');
  ui.nodes.get('reference').value = 'project-1'; ui.nodes.get('comparison').value = 'project-1';
  await ui.nodes.get('compare').click();
  assert.match(ui.nodes.get('notice').textContent, /distinct projects/);
  assert.equal(ui.requests.length, 0);
  ui.nodes.get('demo').click();
  assert.deepEqual(ui.read('report.projects.map(project => project.tags)'), [['DEV'], ['PROD']]);
  assert.equal(ui.nodes.get('report').hidden, false);
});

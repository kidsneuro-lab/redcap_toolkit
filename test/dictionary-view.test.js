import test from 'node:test';
import assert from 'node:assert/strict';
import { installDocument } from './dom.js';
import { demoSnapshots } from '../src/demo.js';
import dictionaryView from '../src/dictionary-view.js';

// The fake DOM keeps each node's own text, so a cell's text is gathered from its descendants.
const text = node => [node.textContent, ...[...node.descendants()].map(child => child.textContent)].join('');
const project = (id, title) => ({ id, projectId: id, title, tags: [], apiUrl: 'https://demo.invalid/api/', token: `${id}-synthetic-secret` });

// Mounts the Tool with a fake toolkit. Synthetic REDCap exports are served through a stubbed fetch; `projectId` overrides the exported project ID.
function mountTool(projects, { projectId, exports = {} } = {}) {
  const document = installDocument();
  const container = document.createElement('div');
  const { left } = demoSnapshots();
  const calls = { notices: [], shown: [] }, requests = [];
  globalThis.fetch = async (url, { body }) => {
    const config = projects.find(item => item.token === body.get('token')), section = body.get('content');
    requests.push(section);
    const served = { project: { ...left.project, project_id: projectId ?? config.projectId, project_title: config.title }, instrument: left.instruments, metadata: left.metadata, ...exports };
    return Response.json(served[section]);
  };
  const changes = [];
  const toolkit = {
    projects: () => projects.map(item => ({ ...item })),
    onProjectsChange: listener => changes.push(listener),
    proxy: () => false,
    apiUrls: null,
    notice: (message, error = false) => calls.notices.push({ message, error }),
    showProjects: (...args) => calls.shown.push(args),
    setBusy: () => {}
  };
  dictionaryView.mount(container, toolkit);
  const $ = id => { const node = container.querySelector(`#dictionary-${id}`); assert.ok(node, `Unknown element: ${id}`); return node; };
  const choose = async id => { $('project').value = id; await $('project').dispatch('change'); };
  // The Variable cell holds the field name. Rows are read from the rendered table, not from the rules module.
  const shownNames = () => $('rows').children.map(row => text(row.children[0]));
  // Replaces the saved projects and tells the Tool, as the Projects drawer does.
  const changeProjects = next => { projects = next; for (const listener of changes) listener(toolkit.projects()); };
  return { $, choose, calls, requests, shownNames, document, changeProjects };
}

test('Data dictionary is a Tool that checks identity before reading Instruments and Metadata, and nothing else', async () => {
  assert.equal(dictionaryView.id, 'dictionary');
  assert.equal(dictionaryView.title, 'Data dictionary');
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.choose('one');
  assert.equal(ui.requests[0], 'project');
  assert.deepEqual(ui.requests.slice(1).sort(), ['instrument', 'metadata']);
  assert.equal(ui.$('controls').hidden, false);
  // The demo Metadata with the default free-text filter: unvalidated text, descriptive, calc and file fields are hidden.
  assert.deepEqual(ui.shownNames(), ['record_id', 'consent', 'collected', 'freezer_events']);
});

test('a project ID mismatch stops before any other export, and a failed export shows an error instead of a partial dictionary', async () => {
  const mismatch = mountTool([project('one', 'Example project DEV')], { projectId: 'other' });
  await mismatch.choose('one');
  assert.deepEqual(mismatch.requests, ['project']);
  assert.equal(mismatch.$('controls').hidden, true);
  assert.match(mismatch.$('project-status').className, /alert-danger/);
  const malformed = mountTool([project('one', 'Example project DEV')], { exports: { metadata: [{ form_name: 'enrolment' }] } });
  await malformed.choose('one');
  assert.equal(malformed.$('controls').hidden, true);
  assert.deepEqual(malformed.shownNames(), []);
  assert.match(malformed.$('project-status').textContent, /No dictionary has been shown/);
});

test('a missing session token opens the Projects area instead of requesting exports', async () => {
  const ui = mountTool([{ ...project('one', 'Example project DEV'), token: '' }]);
  await ui.choose('one');
  assert.deepEqual(ui.requests, []);
  assert.equal(ui.calls.shown.length, 1);
  assert.match(ui.$('project-status').textContent, /Enter an API token/);
});

test('unticking an instrument narrows the table, Clear shows the empty state and Select all restores every instrument', async () => {
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.choose('one');
  ui.$('instrument-sample').checked = false;
  await ui.$('instrument-sample').dispatch('change');
  assert.deepEqual(ui.shownNames(), ['record_id', 'consent']);
  await ui.$('clear-instruments').click();
  assert.equal(ui.$('instrument-enrolment').checked, false);
  assert.deepEqual(ui.shownNames(), []);
  assert.equal(ui.$('empty').hidden, false);
  assert.equal(ui.$('empty').textContent, 'Select at least one instrument.');
  await ui.$('select-instruments').click();
  assert.deepEqual(ui.shownNames(), ['record_id', 'consent', 'collected', 'freezer_events']);
  assert.equal(ui.$('empty').hidden, true);
});

test('the free-text filter starts ticked and can be turned off, and search narrows the table as you type', async () => {
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.choose('one');
  assert.equal(ui.$('hide-free-text').checked, true);
  ui.$('hide-free-text').checked = false;
  await ui.$('hide-free-text').dispatch('change');
  assert.equal(ui.shownNames().length, demoSnapshots().left.metadata.length);
  ui.$('search').value = 'thawed';
  await ui.$('search').dispatch('input');
  assert.deepEqual(ui.shownNames(), ['freezer_events']);
  ui.$('search').value = 'no such field';
  await ui.$('search').dispatch('input');
  assert.deepEqual(ui.shownNames(), []);
  assert.equal(ui.$('empty').hidden, false);
  assert.equal(ui.$('empty').textContent, 'No fields match the search or filter.');
});

test('a header button cycles ascending, descending and Metadata order, marking only its column with aria-sort', async () => {
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.choose('one');
  const metadataOrder = ui.shownNames(), header = id => ui.$(id).parentNode;
  assert.equal(ui.$('sort-name').tagName, 'BUTTON');
  await ui.$('sort-name').click();
  assert.deepEqual(ui.shownNames(), ['collected', 'consent', 'freezer_events', 'record_id']);
  assert.equal(header('sort-name').getAttribute('aria-sort'), 'ascending');
  await ui.$('sort-name').click();
  assert.deepEqual(ui.shownNames(), ['record_id', 'freezer_events', 'consent', 'collected']);
  assert.equal(header('sort-name').getAttribute('aria-sort'), 'descending');
  assert.equal(ui.$('sort-name').className, 'table-sort desc');
  await ui.$('sort-name').click();
  assert.deepEqual(ui.shownNames(), metadataOrder);
  assert.equal(header('sort-name').getAttribute('aria-sort'), null);
  await ui.$('sort-label').click();
  await ui.$('sort-type').click();
  assert.equal(header('sort-label').getAttribute('aria-sort'), null);
  assert.equal(header('sort-type').getAttribute('aria-sort'), 'ascending');
  assert.equal(header('sort-instrument').getAttribute('aria-sort'), null);
});

test('labels and choices are shown as text, and checkbox fields carry the upload hint', async () => {
  const { left } = demoSnapshots(), metadata = structuredClone(left.metadata);
  metadata[1].field_label = '<b>Consent</b> <img src=x onerror=alert(1)>';
  const ui = mountTool([project('one', 'Example project DEV')], { exports: { metadata } });
  await ui.choose('one');
  const rows = ui.$('rows').children, cells = name => rows.find(row => text(row.children[0]) === name).children;
  assert.equal(cells('consent')[2].textContent, '<b>Consent</b> <img src=x onerror=alert(1)>');
  assert.ok([...ui.$('rows').descendants()].every(node => !['B', 'IMG'].includes(node.tagName)));
  assert.match(text(cells('consent')[4]), /1 Yes.*0 No/);
  assert.match(text(cells('freezer_events')[4]), /-9 Not recorded.*One column per option in uploads/);
});

test('Explore demo shows the synthetic dictionary without any request', async () => {
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.$('demo').click();
  assert.deepEqual(ui.requests, []);
  assert.equal(ui.$('project').value, 'demo');
  assert.deepEqual(ui.shownNames(), ['record_id', 'consent', 'collected', 'freezer_events']);
  assert.match(ui.calls.notices.at(-1).message, /Demo data only/);
});

test('entering a missing token reloads the chosen project, and removing the project resets the Tool', async () => {
  const ui = mountTool([{ ...project('one', 'Example project DEV'), token: '' }]);
  await ui.choose('one');
  ui.changeProjects([project('one', 'Example project DEV')]);
  await new Promise(resolve => setTimeout(resolve));
  assert.deepEqual(ui.shownNames(), ['record_id', 'consent', 'collected', 'freezer_events']);
  ui.changeProjects([]);
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(ui.$('controls').hidden, true);
  assert.equal(ui.$('project').children.length, 1);
});

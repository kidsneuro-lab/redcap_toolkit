import test from 'node:test';
import assert from 'node:assert/strict';
import { installDocument } from './dom.js';
import { demoSnapshots } from '../src/demo.js';
import recordView from '../src/record-view.js';

// The fake DOM keeps each node's own text, so a node's text is gathered from its descendants.
const text = node => [node.textContent, ...[...node.descendants()].map(child => child.textContent)].join('');
const project = (id, title) => ({ id, projectId: id, title, tags: [], apiUrl: 'https://demo.invalid/api/', token: `${id}-synthetic-secret` });

// Mounts the Tool with a fake toolkit. Synthetic REDCap exports are served through a stubbed fetch; `projectId` overrides the exported project ID.
// The record export serves the demo rows whose record ID matches the requested one, as REDCap does.
function mountTool(projects, { projectId, exports = {} } = {}) {
  const document = installDocument();
  const container = document.createElement('div');
  const { left } = demoSnapshots();
  const calls = { notices: [], shown: [] }, requests = [];
  let hold = null;
  globalThis.fetch = async (url, { body }) => {
    const config = projects.find(item => item.token === body.get('token')), section = body.get('content');
    requests.push(section === 'record' ? `record:${body.get('records[0]')}` : section);
    if (section === 'record' && hold) await hold;
    const served = { project: { ...left.project, project_id: projectId ?? config.projectId, project_title: config.title }, instrument: left.instruments, metadata: left.metadata, exportFieldNames: left.fieldNames, record: left.record.filter(row => row.record_id === body.get('records[0]')), ...exports };
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
  const mounted = recordView.mount(container, toolkit);
  const $ = id => { const node = container.querySelector(`#record-${id}`); assert.ok(node, `Unknown element: ${id}`); return node; };
  const choose = async id => { $('project').value = id; await $('project').dispatch('change'); };
  const lookup = async id => { $('id').value = id; await $('view').click(); };
  // Each block is a section: its heading, then a table whose rows hold Variable, Field label and Value.
  const blocks = () => $('blocks').children.map(section => ({ heading: text(section.children[0]), rows: section.children[1]?.children?.[0]?.children?.[1]?.children?.map(row => row.children.map(text)) ?? [] }));
  const changeProjects = next => { projects = next; for (const listener of changes) listener(toolkit.projects()); };
  const holdRecords = () => { let release; hold = new Promise(resolve => { release = resolve; }); return () => { hold = null; release(); }; };
  return { $, choose, lookup, blocks, calls, requests, document, container, mounted, changeProjects, holdRecords };
}

test('Record viewer checks identity, reads Instruments, Metadata and Export Field Names, and requests a record only when one is entered', async () => {
  assert.equal(recordView.id, 'record');
  assert.equal(recordView.title, 'Record viewer');
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.choose('one');
  assert.equal(ui.requests[0], 'project');
  assert.deepEqual(ui.requests.slice(1).sort(), ['exportFieldNames', 'instrument', 'metadata']);
  assert.equal(ui.$('controls').hidden, false);
  await ui.lookup('  SYN-001 ');
  assert.deepEqual(ui.requests.slice(4), ['record:SYN-001']);
  assert.deepEqual(ui.blocks().map(block => block.heading), ['EnrolmentComplete (2)', 'Sample collectionInstance 1Complete (2)', 'Sample collectionInstance 2Unverified (1)']);
  assert.match(ui.$('status').textContent, /^Record SYN-001 · read /);
});

test('a project ID mismatch stops before any other export, and a blank record ID makes no request', async () => {
  const mismatch = mountTool([project('one', 'Example project DEV')], { projectId: 'other' });
  await mismatch.choose('one');
  assert.deepEqual(mismatch.requests, ['project']);
  assert.equal(mismatch.$('controls').hidden, true);
  assert.match(mismatch.$('project-status').textContent, /No record can be viewed/);
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.choose('one');
  await ui.lookup('   ');
  assert.equal(ui.requests.filter(request => request.startsWith('record')).length, 0);
  assert.match(ui.$('status').textContent, /Enter a record ID/);
});

test('a missing session token opens the Projects area instead of requesting exports', async () => {
  const ui = mountTool([{ ...project('one', 'Example project DEV'), token: '' }]);
  await ui.choose('one');
  assert.deepEqual(ui.requests, []);
  assert.equal(ui.calls.shown.length, 1);
  assert.match(ui.$('project-status').textContent, /Enter an API token/);
});

test('an empty record export gives one neutral message, and a malformed one an error, with no record shown', async () => {
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.choose('one');
  await ui.lookup('SYN-404');
  assert.equal(ui.$('status').textContent, 'No record with this ID is available to this token.');
  assert.deepEqual(ui.blocks(), []);
  const malformed = mountTool([project('one', 'Example project DEV')], { exports: { record: { record_id: 'SYN-001' } } });
  await malformed.choose('one');
  await malformed.lookup('SYN-001');
  assert.deepEqual(malformed.blocks(), []);
  assert.match(malformed.$('status').textContent, /No record has been shown/);
});

test('coded values show the raw code with its label, validated text its type, and empty fields are hidden at first', async () => {
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.choose('one');
  await ui.lookup('SYN-001');
  const [, first, second] = ui.blocks();
  const row = (block, name) => block.rows.find(cells => cells[0] === name);
  assert.equal(row(first, 'freezer_events')[2], '1 Thawed2 Relabelled');
  assert.equal(row(first, 'collected')[2], '2026-03-04date_ymd');
  assert.equal(row(second, 'lab_code'), undefined);
  ui.$('hide-empty').checked = false;
  await ui.$('hide-empty').dispatch('change');
  assert.equal(row(ui.blocks()[2], 'lab_code')[2], 'Empty');
  assert.equal(row(ui.blocks()[0], 'consent')[2], '1 Yes');
});

test('identifier values are kept out of the page until Show identifiers, which resets for each lookup', async () => {
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.choose('one');
  await ui.lookup('SYN-001');
  const initials = () => ui.blocks()[0].rows.find(cells => cells[0] === 'initials')[2];
  assert.equal(initials(), 'Identifier•••');
  assert.ok(!text(ui.container).includes('ZZ'));
  ui.$('show-identifiers').checked = true;
  await ui.$('show-identifiers').dispatch('change');
  assert.equal(initials(), 'IdentifierZZ');
  await ui.lookup('SYN-001');
  assert.equal(ui.$('show-identifiers').checked, false);
  assert.equal(initials(), 'Identifier•••');
});

test('a field the token cannot export is labelled as such, not as empty', async () => {
  const { left } = demoSnapshots();
  const record = left.record.map(({ initials, ...row }) => row);
  const ui = mountTool([project('one', 'Example project DEV')], { exports: { record } });
  await ui.choose('one');
  await ui.lookup('SYN-001');
  assert.equal(ui.blocks()[0].rows.find(cells => cells[0] === 'initials')[2], "IdentifierNot exported with this token's rights");
});

test('leaving the Tool, choosing another project or a new lookup forgets the shown record', async () => {
  const ui = mountTool([project('one', 'Example project DEV'), project('two', 'Example project DEV two')]);
  await ui.choose('one');
  await ui.lookup('SYN-001');
  ui.mounted.leave();
  assert.deepEqual([ui.blocks(), ui.$('id').value, ui.$('status').textContent], [[], '', '']);
  assert.equal(ui.$('controls').hidden, false);
  await ui.lookup('SYN-001');
  await ui.choose('two');
  assert.deepEqual([ui.blocks(), ui.$('id').value], [[], '']);
  await ui.lookup('SYN-001');
  await ui.lookup('SYN-404');
  assert.deepEqual(ui.blocks(), []);
});

test('a slower lookup does not reappear after the Tool is left', async () => {
  const ui = mountTool([project('one', 'Example project DEV')]);
  await ui.choose('one');
  const release = ui.holdRecords();
  ui.$('id').value = 'SYN-001';
  const pending = ui.$('view').click();
  ui.mounted.leave();
  release();
  await pending;
  assert.deepEqual(ui.blocks(), []);
  assert.equal(ui.$('status').textContent, '');
});

test('the record ID input is never inside a form, and lookups make no download', async () => {
  const ui = mountTool([project('one', 'Example project DEV')]);
  assert.ok(![...ui.container.descendants()].some(node => node.tagName === 'FORM'));
  await ui.choose('one');
  ui.$('id').value = 'SYN-001';
  await ui.$('id').dispatch('keydown', { key: 'Enter' });
  assert.equal(ui.blocks().length, 3);
  assert.deepEqual(ui.document.downloads, []);
});

test('Explore demo shows the synthetic record without any connection, and other IDs are not available', async () => {
  const ui = mountTool([]);
  await ui.$('demo').click();
  assert.deepEqual(ui.requests, []);
  assert.deepEqual(ui.calls.notices.at(-1), { message: 'Demo data only. No connection to REDCap has been made.', error: false });
  assert.equal(ui.$('id').value, 'SYN-001');
  assert.equal(ui.blocks().length, 3);
  await ui.lookup('SYN-002');
  assert.equal(ui.$('status').textContent, 'No record with this ID is available to this token.');
  assert.deepEqual(ui.requests, []);
});

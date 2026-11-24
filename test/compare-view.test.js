import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { installDocument } from './dom.js';
import { demoSnapshots } from '../src/demo.js';
import compareView from '../src/compare-view.js';

const project = (id, label, tags = []) => ({ id, label, expectedTitle: label, tags, apiUrl: 'https://demo.invalid/api/', token: `${id}-synthetic-secret` });

// Mounts the Tool with a fake toolkit. Synthetic REDCap exports are served through a stubbed fetch, keyed by token.
function mountTool(projects, { proxy = false } = {}) {
  const document = installDocument();
  const container = document.createElement('div');
  const { left } = demoSnapshots();
  const calls = { notices: [], busy: [], shown: [] }, requests = [];
  globalThis.fetch = async (url, { body }) => {
    const config = projects.find(item => item.token === body.get('token')), section = body.get('content');
    requests.push([config.id, section, url]);
    const exports = { project: { ...left.project, project_id: config.id, project_title: config.expectedTitle, in_production: 1 }, instrument: left.instruments, repeatingFormsEvents: left.repeating, metadata: left.metadata };
    return Response.json(exports[section]);
  };
  const toolkit = {
    projects: () => projects.map(item => ({ ...item })),
    onProjectsChange: () => {},
    proxy: () => proxy,
    notice: (message, error = false) => calls.notices.push({ message, error }),
    showProjects: (...args) => calls.shown.push(args),
    setBusy: busy => calls.busy.push(busy)
  };
  compareView.mount(container, toolkit);
  const $ = id => { const node = container.querySelector(`#${id}`); assert.ok(node, `Unknown element: ${id}`); return node; };
  const select = (reference, comparison) => { $('reference').value = reference; $('comparison').value = comparison; };
  const downloaded = async () => JSON.parse(await resolveObjectURL(document.downloads.at(-1).href).text());
  return { $, select, calls, requests, downloaded, lastNotice: () => calls.notices.at(-1) };
}

test('Schema comparison reports both projects with their tags and downloads the report without tokens', async () => {
  const ui = mountTool([project('one', 'First', ['DEV', 'custom', '<tag>']), project('two', 'Second')]);
  assert.equal(compareView.id, 'compare');
  assert.equal(compareView.title, 'Schema comparison');
  ui.select('one', 'two');
  await ui.$('compare').click();
  assert.equal(ui.requests.length, 8);
  assert.deepEqual(ui.calls.busy, [true, false]);
  assert.equal(ui.$('report').hidden, false);
  await ui.$('download').click();
  const report = await ui.downloaded();
  assert.ok(!JSON.stringify(report).includes('synthetic-secret'));
  assert.deepEqual(report.projects.map(item => [item.tags, item.validation]), [[['DEV', 'custom', '<tag>'], 'title verified'], [[], 'title verified']]);
  assert.equal(report.demo, false);
});

test('same DEV tags and different group tags allow comparison regardless of production status', async () => {
  const ui = mountTool([project('one', 'First', ['DEV', 'Group A']), project('two', 'Second', ['DEV', 'Group B'])]);
  ui.select('one', 'two');
  await ui.$('compare').click();
  assert.equal(ui.requests.length, 8);
  await ui.$('download').click();
  assert.ok((await ui.downloaded()).projects.every(item => item.validation === 'title verified'));
});

test('duplicate selections are still blocked and demo reports retain descriptive tags', async () => {
  const ui = mountTool([project('one', 'First')]);
  ui.select('one', 'one');
  await ui.$('compare').click();
  assert.match(ui.lastNotice().message, /distinct projects/);
  assert.equal(ui.requests.length, 0);
  await ui.$('demo').click();
  assert.equal(ui.$('report').hidden, false);
  await ui.$('download').click();
  const report = await ui.downloaded();
  assert.equal(report.demo, true);
  assert.deepEqual(report.projects.map(item => item.tags), [['DEV'], ['PROD']]);
});

test('a missing session token opens the Projects area instead of requesting exports', async () => {
  const ui = mountTool([project('one', 'First'), { ...project('two', 'Second'), token: '' }]);
  ui.select('one', 'two');
  await ui.$('compare').click();
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.calls.shown.length, 1);
  assert.match(ui.lastNotice().message, /Enter an API token/);
});

test('exports go through the local proxy only when the toolkit proxy setting is on', async () => {
  for (const [proxy, url] of [[false, 'https://demo.invalid/api/'], [true, '/api/export']]) {
    const ui = mountTool([project('one', 'First'), project('two', 'Second')], { proxy });
    ui.select('one', 'two');
    await ui.$('compare').click();
    assert.deepEqual([...new Set(ui.requests.map(request => request[2]))], [url]);
  }
});

test('Manage projects and Set up projects open the Projects drawer through the toolkit', async () => {
  const ui = mountTool([]);
  await ui.$('manage').click();
  await ui.$('empty-add').click();
  assert.deepEqual(ui.calls.shown, [[], [true, { addIfEmpty: true }]]);
});

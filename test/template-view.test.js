import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { installDocument } from './dom.js';
import { demoSnapshots } from '../src/demo.js';
import templateView from '../src/template-view.js';

const project = (id, label, extras = {}) => ({ id, label, expectedTitle: label, tags: [], apiUrl: 'https://demo.invalid/api/', token: `${id}-synthetic-secret`, ...extras });

// Mounts the Tool with a fake toolkit. Synthetic REDCap exports are served through a stubbed fetch, keyed by token.
function mountTool(projects, { title, apiUrls = null } = {}) {
  const document = installDocument();
  const container = document.createElement('div');
  const { left } = demoSnapshots();
  const calls = { notices: [], busy: [], shown: [] }, requests = [], listeners = [];
  globalThis.fetch = async (url, { body }) => {
    const config = projects.find(item => item.token === body.get('token')), content = body.get('content');
    requests.push(content);
    const exports = { project: { ...left.project, project_id: config.id, project_title: title ?? config.expectedTitle }, metadata: left.metadata, repeatingFormsEvents: left.repeating, exportFieldNames: left.fieldNames };
    return Response.json(exports[content]);
  };
  const toolkit = {
    projects: () => projects.map(item => ({ ...item })),
    onProjectsChange: listener => listeners.push(listener),
    proxy: () => false,
    apiUrls,
    notice: (message, error = false) => calls.notices.push({ message, error }),
    showProjects: (...args) => calls.shown.push(args),
    setBusy: busy => calls.busy.push(busy)
  };
  templateView.mount(container, toolkit);
  const $ = id => { const node = container.querySelector(`#template-${id}`); assert.ok(node, `Unknown element: ${id}`); return node; };
  const choose = (id, value) => { $(id).value = value; return $(id).dispatch('change'); };
  const check = (id, checked = true) => { $(id).checked = checked; return $(id).dispatch('change'); };
  // Stands in for the Projects drawer saving a change, such as an entered token.
  const projectsChanged = () => Promise.all(listeners.map(listener => listener(projects.map(item => ({ ...item })))));
  const downloaded = async () => { const file = document.downloads.at(-1); return { name: file.name, text: await resolveObjectURL(file.href).text() }; };
  return { $, choose, check, projectsChanged, calls, requests, document, downloaded };
}

test('All importable fields downloads the instrument template once the project identity is verified', async () => {
  const ui = mountTool([project('one', 'First')]);
  assert.equal(templateView.id, 'template');
  assert.equal(templateView.title, 'Upload template');
  await ui.choose('project', 'one');
  assert.equal(ui.requests[0], 'project');
  assert.deepEqual(ui.requests.slice(1).sort(), ['exportFieldNames', 'metadata', 'repeatingFormsEvents']);
  await ui.choose('instrument', 'sample');
  await ui.$('download').click();
  const file = await ui.downloaded();
  assert.match(file.name, /^sample_upload_template_\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(file.text, 'record_id,redcap_repeat_instrument,redcap_repeat_instance,sample_id,collected,freezer_events___1,freezer_events___2,freezer_events____9,lab_code,rna_quality,sample_complete\r\n');
});

test('Selected fields starts with nothing ticked and Download disabled until a field is ticked', async () => {
  const ui = mountTool([project('one', 'First')]);
  await ui.choose('project', 'one');
  await ui.choose('instrument', 'sample');
  await ui.check('mode-selected');
  assert.deepEqual(['pick-sample_id', 'pick-lab_code', 'pick-sample_complete'].map(id => ui.$(id).checked), [false, false, false]);
  assert.equal(ui.$('download').disabled, true);
  assert.match(ui.$('download-hint').textContent, /Select at least one field/);
  await ui.check('pick-lab_code');
  assert.equal(ui.$('download').disabled, false);
  await ui.$('download').click();
  assert.equal((await ui.downloaded()).text, 'record_id,redcap_repeat_instrument,redcap_repeat_instance,lab_code\r\n');
});

test('ticked fields survive switching modes and are cleared when the instrument changes', async () => {
  const ui = mountTool([project('one', 'First')]);
  await ui.choose('project', 'one');
  await ui.choose('instrument', 'sample');
  await ui.check('mode-selected');
  await ui.check('pick-lab_code');
  await ui.check('mode-all');
  await ui.check('mode-selected');
  assert.equal(ui.$('pick-lab_code').checked, true);
  await ui.choose('instrument', 'enrolment');
  await ui.choose('instrument', 'sample');
  assert.equal(ui.$('mode-all').checked, true);
  await ui.check('mode-selected');
  assert.equal(ui.$('pick-lab_code').checked, false);
  assert.equal(ui.$('download').disabled, true);
});

test('an identity failure requests nothing further and produces no template', async () => {
  const ui = mountTool([project('one', 'First')], { title: 'Someone else' });
  await ui.choose('project', 'one');
  assert.deepEqual(ui.requests, ['project']);
  assert.match(ui.$('project-status').textContent, /Project title mismatch.*No template has been produced/);
  assert.equal(ui.$('instrument').disabled, true);
  assert.equal(ui.$('download').disabled, true);
  assert.equal(ui.document.downloads.length, 0);
});

test('a project without a session token opens the Projects area instead of requesting exports', async () => {
  const ui = mountTool([project('one', 'First', { token: '' })]);
  await ui.choose('project', 'one');
  assert.deepEqual(ui.requests, []);
  assert.equal(ui.calls.shown.length, 1);
  assert.match(ui.$('project-status').textContent, /API token/);
});

test('Explore demo needs no connection and its downloads are named as demo files', async () => {
  const ui = mountTool([]);
  await ui.$('demo').click();
  assert.deepEqual(ui.requests, []);
  assert.deepEqual(ui.calls.notices.at(-1), { message: 'Demo data only. No connection to REDCap has been made.', error: false });
  assert.match(ui.$('project-status').textContent, /Example project DEV \(demo, synthetic\)/);
  await ui.choose('instrument', 'enrolment');
  await ui.$('download').click();
  const file = await ui.downloaded();
  assert.match(file.name, /^demo_enrolment_upload_template_\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(file.text, 'record_id,consent,initials,enrolment_complete\r\n');
});

test('entering the missing token in Projects loads the waiting project', async () => {
  const waiting = project('one', 'First', { token: '' }), ui = mountTool([waiting]);
  await ui.choose('project', 'one');
  waiting.token = 'one-synthetic-secret';
  await ui.projectsChanged();
  assert.equal(ui.requests[0], 'project');
  assert.equal(ui.$('instrument').disabled, false);
});

test('a project whose API URL is outside the allowlist is never sent a request, and no template is produced', async () => {
  const ui = mountTool([project('one', 'First', { apiUrl: 'https://evil.example.net/api/' })], { apiUrls: ['https://demo.invalid/api/'] });
  await ui.choose('project', 'one');
  assert.deepEqual(ui.requests, []);
  assert.match(ui.$('project-status').textContent, /not on this site's list of permitted REDCap API URLs\. No template has been produced\./);
  assert.equal(ui.$('instrument').disabled, true);
});

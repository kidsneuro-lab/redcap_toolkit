import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { installDocument } from './dom.js';
import { demoSnapshots } from '../src/demo.js';
import compareView from '../src/compare-view.js';

const project = (id, label, tags = []) => ({ id, label, expectedTitle: label, tags, apiUrl: 'https://demo.invalid/api/', token: `${id}-synthetic-secret` });

// Mounts the Tool with a fake toolkit. Synthetic REDCap exports are served through a stubbed fetch, keyed by token.
function mountTool(projects, { proxy = false, apiUrls = null, projectInfo = {} } = {}) {
  const document = installDocument();
  const container = document.createElement('div');
  const { left } = demoSnapshots();
  const calls = { notices: [], busy: [], shown: [] }, requests = [];
  globalThis.fetch = async (url, { body }) => {
    const config = projects.find(item => item.token === body.get('token')), section = body.get('content');
    requests.push([config.id, section, url]);
    const exports = { project: { ...left.project, ...projectInfo[config.id], project_id: config.id, project_title: config.expectedTitle, in_production: 1 }, instrument: left.instruments, repeatingFormsEvents: left.repeating, metadata: left.metadata };
    return Response.json(exports[section]);
  };
  const toolkit = {
    projects: () => projects.map(item => ({ ...item })),
    onProjectsChange: () => {},
    proxy: () => proxy,
    apiUrls,
    notice: (message, error = false) => calls.notices.push({ message, error }),
    showProjects: (...args) => calls.shown.push(args),
    setBusy: busy => calls.busy.push(busy)
  };
  compareView.mount(container, toolkit);
  const $ = id => { const node = container.querySelector(`#${id}`); assert.ok(node, `Unknown element: ${id}`); return node; };
  const select = (reference, comparison) => { $('reference').value = reference; $('comparison').value = comparison; };
  const downloadText = () => resolveObjectURL(document.downloads.at(-1).href).text();
  const downloaded = async () => JSON.parse(await downloadText());
  return { $, select, calls, requests, downloaded, downloadText, lastNotice: () => calls.notices.at(-1) };
}

const omissionMarker = '[omitted from download]';

async function compareProjectsWithPersonalDetails() {
  const projectInfo = {
    one: { project_pi_firstname: 'ExamplePI', project_pi_lastname: 'SyntheticPIReference', project_pi_email: 'synthetic-pi@example.invalid', project_irb_number: '', project_grant_number: 'SyntheticGrant', project_notes: null },
    two: { project_pi_firstname: 'ExamplePI', project_pi_lastname: 'SyntheticPIComparison', project_irb_number: null, project_notes: '' }
  };
  const ui = mountTool([project('one', 'First'), project('two', 'Second')], { projectInfo });
  ui.select('one', 'two');
  await ui.$('compare').click();
  return ui;
}

test('the default download omits sensitive Project Info values while recording differences and presence', async () => {
  const ui = await compareProjectsWithPersonalDetails();
  await ui.$('download').click();
  assert.doesNotMatch(await ui.downloadText(), /SyntheticPIReference|SyntheticPIComparison|ExamplePI|synthetic-pi@example\.invalid|SyntheticGrant/);
  const report = await ui.downloaded();
  const { reference, comparison } = report.snapshots;
  const projectRows = Object.fromEntries(report.sections.project.map(row => [row.id, row]));
  for (const property of ['project_pi_firstname', 'project_pi_lastname', 'project_irb_number', 'project_notes']) {
    assert.equal(reference.project[property], omissionMarker);
    assert.equal(comparison.project[property], omissionMarker);
  }
  const surname = projectRows.project_pi_lastname;
  assert.equal(surname.status, 'changed');
  assert.deepEqual([surname.left, surname.right], [omissionMarker, omissionMarker]);
  assert.deepEqual(surname.changes, [{ property: 'project_pi_lastname', left: omissionMarker, right: omissionMarker, leftPresent: true, rightPresent: true }]);
  assert.equal(projectRows.project_pi_firstname.status, 'unchanged');
  assert.equal(projectRows.project_pi_firstname.left, omissionMarker);
  const email = projectRows.project_pi_email;
  assert.equal(reference.project.project_pi_email, omissionMarker);
  assert.equal(Object.hasOwn(comparison.project, 'project_pi_email'), false);
  assert.equal(Object.hasOwn(email, 'right'), false);
  assert.deepEqual(email.changes, [{ property: 'project_pi_email', left: omissionMarker, leftPresent: true, rightPresent: false }]);
});

test('the include option restores Project Info values for the current report only', async () => {
  const ui = await compareProjectsWithPersonalDetails();
  const include = ui.$('include-sensitive-project-info');
  assert.equal(include.checked, false);
  await ui.$('download').click();
  const omitted = await ui.downloaded();
  include.checked = true;
  await ui.$('download').click();
  const included = await ui.downloaded();
  assert.equal(included.snapshots.reference.project.project_pi_lastname, 'SyntheticPIReference');
  assert.equal(included.snapshots.comparison.project.project_pi_lastname, 'SyntheticPIComparison');
  const surname = included.sections.project.find(row => row.id === 'project_pi_lastname');
  assert.deepEqual(surname.changes, [{ property: 'project_pi_lastname', left: 'SyntheticPIReference', right: 'SyntheticPIComparison', leftPresent: true, rightPresent: true }]);
  assert.deepEqual(included.counts, omitted.counts);
  const comparisonResults = ({ sections: { project, ...otherSections } }) => ({
    ...otherSections,
    project: project.map(({ id, status, expected, changes }) => ({ id, status, expected, changes: changes.map(({ property, leftPresent, rightPresent }) => ({ property, leftPresent, rightPresent })) }))
  });
  assert.deepEqual(comparisonResults(included), comparisonResults(omitted));
  assert.ok([...ui.$('results').descendants()].some(node => node.textContent === 'SyntheticPIReference'));
  include.checked = false;
  await ui.$('download').click();
  assert.deepEqual(await ui.downloaded(), omitted);
  include.checked = true;
  await ui.$('compare').click();
  assert.equal(include.checked, false);
});

test('download coverage lists the Project Info properties whose values were omitted', async () => {
  const ui = await compareProjectsWithPersonalDetails();
  await ui.$('download').click();
  assert.deepEqual((await ui.downloaded()).coverage.omittedProjectInfoProperties, ['project_grant_number', 'project_irb_number', 'project_notes', 'project_pi_email', 'project_pi_firstname', 'project_pi_lastname']);
  ui.$('include-sensitive-project-info').checked = true;
  await ui.$('download').click();
  assert.deepEqual((await ui.downloaded()).coverage.omittedProjectInfoProperties, []);
});

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

test('a project whose API URL is outside the allowlist is never sent a request, and the comparison is incomplete', async () => {
  const ui = mountTool([project('one', 'First'), { ...project('two', 'Second'), apiUrl: 'https://evil.example.net/api/' }], { apiUrls: ['https://demo.invalid/api/'] });
  ui.select('one', 'two');
  await ui.$('compare').click();
  assert.ok(ui.requests.every(([id]) => id !== 'two'));
  assert.match(ui.lastNotice().message, /Second: This API URL is not on this site's list of permitted REDCap API URLs/);
  assert.equal(ui.$('report').hidden, true);
});

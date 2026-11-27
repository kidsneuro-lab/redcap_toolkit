import test from 'node:test';
import assert from 'node:assert/strict';
import { installDocument } from './dom.js';
import { fakeStorage } from './storage.js';
import { mountProjects } from '../src/projects-view.js';

// Synthetic Project Info, served through a stubbed fetch and keyed by token. A token not listed is rejected the way REDCap rejects it.
const infos = {
  'synthetic-secret': { project_id: 101, project_title: 'Synthetic study', in_production: 0, is_longitudinal: 0 },
  'second-secret': { project_id: 202, project_title: 'Second study', in_production: 1, is_longitudinal: 0 }
};

function mountView(saved, hostname = '127.0.0.1', apiUrls = null, served = infos) {
  const document = installDocument();
  const container = document.createElement('div'), trigger = document.createElement('div');
  const storage = fakeStorage(saved === undefined ? {} : { 'redcap-toolkit.projects.v1': JSON.stringify(saved) });
  const notices = [], requests = [];
  globalThis.fetch = async (url, { body }) => {
    requests.push({ url, content: body.get('content'), apiUrl: body.get('apiUrl') });
    return Response.json(served[body.get('token')] ?? { error: 'You do not have permissions to use the API' });
  };
  const view = mountProjects(container, { trigger, hostname, storage, apiUrls, notice: (message, error = false) => notices.push({ message, error }) });
  const $ = id => { const node = container.querySelector(`#${id}`) || trigger.querySelector(`#${id}`); assert.ok(node, `Unknown element: ${id}`); return node; };
  const submit = () => $('project-form').dispatch('submit');
  const fill = (projectId, tags = '', token = 'synthetic-secret', apiUrl = 'https://demo.invalid/api/') => {
    $('new-project').click();
    for (const [id, value] of Object.entries({ 'redcap-project-id': projectId, tags, 'api-url': apiUrl, token })) $(id).value = value;
    return submit();
  };
  const save = async (...args) => { await fill(...args); assert.equal($('form-error').textContent, ''); };
  const button = (text, row = container) => [...row.descendants()].find(node => node.tagName === 'BUTTON' && node.textContent === text);
  const rows = () => [...$('project-list').children].map(row => [...row.descendants()].filter(node => !node.children.length).map(node => node.textContent).join(' | '));
  return { view, $, fill, save, submit, button, rows, notices, requests, stored: () => JSON.parse(storage.getItem('redcap-toolkit.projects.v1')) };
}

test('adding a project checks its token against Project Info and saves the title, project ID and PROD or DEV tag', async () => {
  const ui = mountView();
  const changes = [];
  ui.view.onProjectsChange(projects => changes.push(projects.length));
  await ui.save('101', ' Phase 1, custom, Phase 1, , <tag> ');
  await ui.save('202', '', 'second-secret');
  assert.deepEqual(ui.requests.map(request => request.content), ['project', 'project']);
  assert.deepEqual(ui.stored().map(({ id, ...project }) => project), [
    { projectId: '101', title: 'Synthetic study', inProduction: false, tags: ['Phase 1', 'custom', '<tag>', 'DEV'], apiUrl: 'https://demo.invalid/api/' },
    { projectId: '202', title: 'Second study', inProduction: true, tags: ['PROD'], apiUrl: 'https://demo.invalid/api/' }
  ]);
  assert.ok(ui.stored().every(project => !('token' in project) && !('label' in project)));
  assert.deepEqual(ui.view.projects().map(project => project.token), ['synthetic-secret', 'second-secret']);
  assert.deepEqual(ui.rows(), [
    'Synthetic study | PID 101 | Phase 1 | custom | <tag> | DEV | Token available for this session · https://demo.invalid/api/ | Edit | Remove',
    'Second study | PID 202 | PROD | Token available for this session · https://demo.invalid/api/ | Edit | Remove'
  ]);
  assert.deepEqual(changes, [1, 2]);
});

test('a project is not saved and its token is discarded when the check fails or the project is already saved', async t => {
  const token = '0123456789abcdef'.repeat(2);
  for (const [name, projectId, used, expected] of [
    ['missing token', '303', '', /Enter the API token\. It is checked against Project Info before saving\./],
    ['token REDCap rejects', '303', token, /REDCap rejected the project export/],
    ['token for another project', '303', 'synthetic-secret', /This token belongs to project ID 101, not 303\./],
    ['project ID that is not a number', 'abc', 'synthetic-secret', /Enter the REDCap project ID, using digits only\./],
    ['project already saved', '101', 'synthetic-secret', /already saved as "Synthetic study"/]
  ]) {
    await t.test(name, async () => {
      const ui = mountView([{ id: 'saved', projectId: '101', title: 'Synthetic study', inProduction: false, tags: ['DEV'], apiUrl: 'https://demo.invalid/api' }]);
      const before = ui.stored();
      await ui.fill(projectId, '', used);
      assert.match(ui.$('form-error').textContent, expected);
      assert.ok(!ui.$('form-error').textContent.includes(token));
      assert.equal(ui.$('project-form').hidden, false);
      assert.equal(ui.$('token').value, '');
      assert.equal(ui.$('save-project').disabled, false);
      assert.deepEqual(ui.stored(), before);
      assert.deepEqual(ui.view.projects().map(project => project.token), ['']);
    });
  }
});

const checked = { id: 'saved', projectId: '101', title: 'Old title', inProduction: true, tags: ['PROD', 'Phase 1'], apiUrl: 'https://demo.invalid/api/' };

test('a token entered for a saved project is checked, and refreshes its title and PROD or DEV tag with notices', async () => {
  const ui = mountView([checked]);
  ui.button('Enter token').click();
  assert.equal(ui.$('redcap-project-id').value, '101');
  ui.$('token').value = 'synthetic-secret';
  await ui.submit();
  assert.equal(ui.$('form-error').textContent, '');
  assert.deepEqual(ui.stored(), [{ ...checked, title: 'Synthetic study', inProduction: false, tags: ['Phase 1', 'DEV'] }]);
  assert.equal(ui.view.projects()[0].token, 'synthetic-secret');
  assert.deepEqual(ui.notices.map(item => item.message), ['Title changed from "Old title" to "Synthetic study".', 'Old title moved back to development. Its PROD tag is now DEV.']);
});

test('tags are edited without a token, and changing the project ID or API URL needs a token checked again', async () => {
  const ui = mountView([checked]);
  ui.button('Edit').click();
  ui.$('tags').value = 'Phase 2';
  await ui.submit();
  assert.equal(ui.$('form-error').textContent, '');
  assert.deepEqual(ui.stored(), [{ ...checked, tags: ['Phase 2'] }]);
  assert.equal(ui.requests.length, 0);
  for (const [field, value] of [['redcap-project-id', '202'], ['api-url', 'https://other.invalid/api/']]) {
    ui.button('Edit').click();
    ui.$(field).value = value;
    await ui.submit();
    assert.match(ui.$('form-error').textContent, /Enter the API token/);
    assert.deepEqual(ui.stored(), [{ ...checked, tags: ['Phase 2'] }]);
  }
  ui.$('redcap-project-id').value = '202';
  ui.$('api-url').value = 'https://demo.invalid/api/';
  ui.$('token').value = 'second-secret';
  await ui.submit();
  assert.deepEqual(ui.stored(), [{ id: 'saved', projectId: '202', title: 'Second study', inProduction: true, tags: ['Phase 2', 'PROD'], apiUrl: 'https://demo.invalid/api/' }]);
  assert.deepEqual(ui.notices, []);
});

test('a project saved before project IDs is listed by its expected title, and its first token must match that title', async () => {
  const ui = mountView([{ id: 'legacy', label: 'Old label', expectedTitle: 'Synthetic study', tags: ['Phase 1'], apiUrl: 'https://demo.invalid/api/', token: 'must-not-load' }]);
  assert.deepEqual(ui.rows(), ['Synthetic study | Project ID not checked | Phase 1 | Token needed · https://demo.invalid/api/ | Enter token | Edit | Remove']);
  ui.button('Enter token').click();
  assert.equal(ui.$('redcap-project-id').value, '');
  ui.$('token').value = 'second-secret';
  await ui.submit();
  assert.match(ui.$('form-error').textContent, /This token belongs to "Second study", not the saved title "Synthetic study"\./);
  ui.$('token').value = 'synthetic-secret';
  await ui.submit();
  assert.equal(ui.$('form-error').textContent, '');
  assert.deepEqual(ui.stored(), [{ id: 'legacy', projectId: '101', title: 'Synthetic study', inProduction: false, tags: ['Phase 1', 'DEV'], apiUrl: 'https://demo.invalid/api/' }]);
});

test('the Projects form rejects token-shaped tags without changing configuration', async () => {
  const token = '0123456789abcdef'.repeat(2);
  const ui = mountView([checked]);
  const before = ui.stored();
  ui.button('Edit').click();
  ui.$('tags').value = `Phase 1, ${token.repeat(2)}, Study`;
  await ui.submit();
  const error = ui.$('form-error').textContent;
  assert.match(error, /^Tags contains text that looks like a REDCap token\. Paste the token into the API token field\.$/);
  assert.equal(ui.$('project-form').hidden, false);
  assert.deepEqual(ui.stored(), before);
});

test('old group and environment labels load as tags, and saved tokens are discarded', () => {
  const ui = mountView([{ id: 'legacy', label: 'Existing', expectedTitle: 'Existing title', phase: 'Phase 1', environment: 'PROD', apiUrl: 'https://demo.invalid/api/', token: 'must-not-load' }]);
  assert.deepEqual(ui.view.projects().map(project => [project.tags, project.token]), [[['Phase 1', 'PROD'], '']]);
  assert.equal(ui.notices.length, 0);
});

test('the Projects button counts session tokens, orange while any is missing and green when all are entered', async () => {
  const ui = mountView();
  const count = () => [ui.$('token-count').textContent, ui.$('token-count').className.match(/bg-(orange|green)-lt/)?.[1]];
  assert.deepEqual(count(), ['No projects', 'orange']);
  const loaded = mountView([checked, { ...checked, id: 'second', projectId: '202', title: 'Second study' }]);
  const loadedCount = () => [loaded.$('token-count').textContent, loaded.$('token-count').className.match(/bg-(orange|green)-lt/)?.[1]];
  assert.deepEqual(loadedCount(), ['0 of 2 tokens', 'orange']);
  for (const token of ['synthetic-secret', 'second-secret']) {
    loaded.button('Enter token').click();
    loaded.$('token').value = token;
    await loaded.submit();
  }
  assert.deepEqual(loadedCount(), ['2 of 2 tokens', 'green']);
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
  assert.equal(ui.$('api-url').ownerDocument.activeElement, ui.$('api-url'));
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

test('the token check goes through the local proxy when it is switched on', async () => {
  const ui = mountView();
  ui.$('proxy').checked = true;
  await ui.save('101');
  assert.deepEqual(ui.requests, [{ url: '/api/export', content: 'project', apiUrl: 'https://demo.invalid/api/' }]);
});

test('a project cannot be saved with an API URL outside the allowlist, and its token is not sent', async () => {
  const ui = mountView(undefined, '127.0.0.1', ['https://redcap.example.org/api/']);
  await ui.fill('101', '', 'synthetic-secret', 'https://evil.example.net/api/');
  assert.deepEqual(ui.requests, []);
  assert.match(ui.$('form-error').textContent, /not on this site's list of permitted REDCap API URLs/);
  assert.equal(ui.stored(), null);
  assert.deepEqual(ui.view.projects(), []);
});

test('a saved project whose API URL is outside the allowlist is shown as blocked and offers no token entry', () => {
  const ui = mountView([{ id: 'elsewhere', label: 'Elsewhere', expectedTitle: 'Elsewhere', tags: [], apiUrl: 'https://evil.example.net/api/' }, { id: 'listed', label: 'Listed', expectedTitle: 'Listed', tags: [], apiUrl: 'https://redcap.example.org/api/' }], '127.0.0.1', ['https://redcap.example.org/api/']);
  const rows = [...ui.$('project-list').children], text = row => [...row.descendants()].map(node => node.textContent).join(' ');
  assert.match(text(rows[0]), /Blocked: this API URL is not permitted on this site/);
  assert.ok(![...rows[0].descendants()].some(node => node.tagName === 'BUTTON' && node.textContent === 'Enter token'));
  assert.ok([...rows[1].descendants()].some(node => node.tagName === 'BUTTON' && node.textContent === 'Enter token'));
});

test('the token field is not a password field, so browsers do not offer to save or restore the token', () => {
  const token = mountView().$('token');
  assert.notEqual(token.type, 'password');
  assert.deepEqual(Object.fromEntries(['autocomplete', 'autocapitalize', 'autocorrect', 'spellcheck', 'data-1p-ignore', 'data-lpignore', 'data-bwignore'].map(name => [name, token.getAttribute(name)])), { autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'data-1p-ignore': '', 'data-lpignore': 'true', 'data-bwignore': '' });
});

test('saved project fields have spellcheck off, so their text is not sent to a spellcheck service', () => {
  const ui = mountView();
  for (const id of ['redcap-project-id', 'tags', 'api-url']) assert.equal(ui.$(id).getAttribute('spellcheck'), 'false', id);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { installDocument } from './dom.js';
import { mountRouter } from '../src/router.js';

// Two synthetic Tools that record each mount and leave a marker in their container.
function mountShell() {
  const document = installDocument();
  const nav = document.createElement('ul'), outlet = document.createElement('div');
  const toolkit = { name: 'synthetic toolkit' }, mounts = [];
  const tool = (id, title) => ({ id, title, mount(container, given) { mounts.push([id, given]); container.append(document.createElement('p')); } });
  const router = mountRouter({ nav, outlet, tools: [tool('compare', 'Schema comparison'), tool('template', 'Upload template')], toolkit });
  const links = () => [...nav.descendants()].filter(node => node.tagName === 'A');
  // The current Tool's panel is the one shown, and its navbar link is the one marked as the current page.
  const current = () => ({
    shown: shell.outlet.children.filter(panel => !panel.hidden).map(panel => panel.getAttribute('data-tool')),
    marked: links().filter(link => link.getAttribute('aria-current') === 'page').map(link => link.href)
  });
  const shell = { router, nav, outlet, toolkit, mounts, links, current };
  return shell;
}

test('a route mounts its Tool once, with the toolkit', () => {
  const shell = mountShell();
  shell.router.show('#/compare');
  shell.router.show('#/compare');
  assert.deepEqual(shell.mounts, [['compare', shell.toolkit]]);
});

test('switching Tools hides and shows them without remounting, and marks the current link', () => {
  const shell = mountShell();
  assert.deepEqual(shell.links().map(link => [link.href, link.textContent]), [['#/compare', 'Schema comparison'], ['#/template', 'Upload template']]);
  shell.router.show('#/compare');
  shell.router.show('#/template');
  assert.deepEqual(shell.current(), { shown: ['template'], marked: ['#/template'] });
  shell.router.show('#/compare');
  assert.deepEqual(shell.current(), { shown: ['compare'], marked: ['#/compare'] });
  assert.deepEqual(shell.mounts.map(([id]) => id), ['compare', 'template']);
  assert.equal(shell.outlet.children.length, 2);
});

test('unknown and empty routes fall back to Schema comparison', () => {
  for (const hash of ['', '#', '#/projects', '#/compare/extra']) {
    const shell = mountShell();
    shell.router.show('#/template');
    shell.router.show(hash);
    assert.deepEqual(shell.current(), { shown: ['compare'], marked: ['#/compare'] }, hash);
  }
});

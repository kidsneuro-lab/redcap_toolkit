import test from 'node:test';
import assert from 'node:assert/strict';
import { installDocument } from './dom.js';
import faqView from '../src/faq-view.js';

// Mounts the FAQ page with FAQ.md served through a stubbed fetch, then waits for it to render.
async function mountFaq(respond) {
  installDocument();
  const requests = [];
  globalThis.fetch = async (url, options) => { requests.push(url); return respond(); };
  const container = document.createElement('section');
  faqView.mount(container, {});
  await new Promise(setImmediate);
  return { container, requests };
}
// The element tree as [tag, own text and children], with, for links, their href, target and rel. The fake DOM keeps an element's own text
// apart from its children, so stray text set before children are appended still shows, as it would in a browser.
const tree = node => node.tagName === '#TEXT' ? node.textContent : [node.tagName.toLowerCase(), ...(node.tagName === 'A' ? [{ href: node.href, target: node.getAttribute('target'), rel: node.getAttribute('rel') }] : []), ...[node.textContent].filter(Boolean), ...node.children.map(tree)];

test('the FAQ page fetches FAQ.md and shows its headings, paragraphs, lists, code, bold and links as elements', async () => {
  const markdown = '# FAQ\n## Troubleshooting\n### Why?\nThe `repeatingFormsEvents` export needs **Project Setup/Design**.\n- See [Pages](https://pages.github.com/)\n- Open [Schema comparison](#/compare)';
  const { container, requests } = await mountFaq(() => new Response(markdown));
  assert.deepEqual(requests, ['FAQ.md']);
  assert.deepEqual(container.children.map(tree), [
    ['h1', 'FAQ'],
    ['h2', 'Troubleshooting'],
    ['h3', 'Why?'],
    ['p', 'The ', ['code', 'repeatingFormsEvents'], ' export needs ', ['strong', 'Project Setup/Design'], '.'],
    ['ul', ['li', 'See ', ['a', { href: 'https://pages.github.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Pages']], ['li', 'Open ', ['a', { href: '#/compare', target: null, rel: null }, 'Schema comparison']]]
  ]);
});

test('markup in FAQ.md is shown as text, never as elements', async () => {
  const { container } = await mountFaq(() => new Response('<img src=x onerror=alert(1)> and **<b>bold</b>**'));
  assert.deepEqual(container.children.map(tree), [['p', '<img src=x onerror=alert(1)> and ', ['strong', '<b>bold</b>']]]);
});

test('a FAQ.md that cannot be loaded shows a plain error in the page', async () => {
  for (const respond of [() => new Response('missing', { status: 404 }), () => { throw new TypeError('Failed to fetch'); }]) {
    const { container } = await mountFaq(respond);
    assert.deepEqual(container.children.map(tree), [['p', 'The FAQ could not be loaded. Reload the page to try again.']]);
  }
});

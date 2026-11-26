import { parseFaq } from './faq.js';
import { element } from './dom.js';

// Each block's tag, with Tabler spacing so sections stand apart.
const headings = { 1: ['h1', 'page-title mb-4'], 2: ['h2', 'mt-5 mb-3'], 3: ['h3', 'mt-4'] };

// One run of text, code, bold or a link. Text is always set as text, so markup in FAQ.md is never rendered.
function run(item) {
  if (item.type === 'text') return document.createTextNode(item.text);
  if (item.type === 'code') return element('code', item.text);
  if (item.type === 'bold') return element('strong', item.text);
  const link = element('a', item.text);
  link.href = item.href;
  // Links to other sites open in a new tab and, like the page's referrer policy, send no referrer.
  if (/^https:/i.test(item.href)) { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); }
  return link;
}
function block(item) {
  if (item.type === 'list') {
    const list = element('ul');
    for (const runs of item.items) { const entry = element('li'); entry.append(...runs.map(run)); list.append(entry); }
    return list;
  }
  const [tag, className] = item.type === 'heading' ? headings[item.level] : ['p'];
  const node = element(tag, undefined, className);
  node.append(...item.content.map(run));
  return node;
}

// The FAQ page, rendered from FAQ.md. It is fetched relative to the page, so it is served beside index.html.
function mount(container) {
  (async () => {
    try {
      const response = await fetch('FAQ.md', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      container.replaceChildren(...parseFaq(await response.text()).blocks.map(block));
    } catch {
      container.replaceChildren(element('p', 'The FAQ could not be loaded. Reload the page to try again.', 'text-danger'));
    }
  })();
}

export default { id: 'faq', title: 'FAQ', mount };

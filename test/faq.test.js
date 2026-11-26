import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFaq } from '../src/faq.js';

const text = value => ({ type: 'text', text: value });

test('headings and paragraphs become blocks, with lines of one paragraph joined', () => {
  const { blocks, unsupported } = parseFaq('# Questions\n\n## Compatibility\n\n### Which version?\nTested against\nREDCap 17.5.3.\n');
  assert.deepEqual(blocks, [
    { type: 'heading', level: 1, content: [text('Questions')] },
    { type: 'heading', level: 2, content: [text('Compatibility')] },
    { type: 'heading', level: 3, content: [text('Which version?')] },
    { type: 'paragraph', content: [text('Tested against REDCap 17.5.3.')] }
  ]);
  assert.deepEqual(unsupported, []);
});

test('consecutive bullet lines form one list, ended by a blank line or another block', () => {
  const { blocks, unsupported } = parseFaq('- Read-only exports\n- Tokens in memory\n\n- Proxy on loopback\n## Next');
  assert.deepEqual(blocks, [
    { type: 'list', items: [[text('Read-only exports')], [text('Tokens in memory')]] },
    { type: 'list', items: [[text('Proxy on loopback')]] },
    { type: 'heading', level: 2, content: [text('Next')] }
  ]);
  assert.deepEqual(unsupported, []);
});

test('inline code, bold and links become runs in paragraphs, headings and list items', () => {
  const { blocks, unsupported } = parseFaq('### Why **HTTP 400**?\nThe `repeatingFormsEvents` export needs **Project Setup/Design**. See the [README](README.md).\n- [Pages](https://pages.github.com/) and [Schema comparison](#/compare)');
  assert.deepEqual(blocks, [
    { type: 'heading', level: 3, content: [text('Why '), { type: 'bold', text: 'HTTP 400' }, text('?')] },
    { type: 'paragraph', content: [text('The '), { type: 'code', text: 'repeatingFormsEvents' }, text(' export needs '), { type: 'bold', text: 'Project Setup/Design' }, text('. See the '), { type: 'link', text: 'README', href: 'README.md' }, text('.')] },
    { type: 'list', items: [[{ type: 'link', text: 'Pages', href: 'https://pages.github.com/' }, text(' and '), { type: 'link', text: 'Schema comparison', href: '#/compare' }]] }
  ]);
  assert.deepEqual(unsupported, []);
});

test('only https, relative and route links are links, others stay as their markdown text and are reported by line', () => {
  const kept = ['https://example.org/a', 'README.md', 'docs/notes.md', '#/faq'];
  for (const href of kept) assert.deepEqual(parseFaq(`[x](${href})`), { blocks: [{ type: 'paragraph', content: [{ type: 'link', text: 'x', href }] }], unsupported: [] }, href);
  for (const href of ['javascript:alert(1)', 'http://example.org', 'data:text/html,hi', 'JavaScript:void(0)', '//example.org', '#top', 'mailto:a@example.org']) {
    const source = `Intro\n\nSee [x](${href}) now`;
    assert.deepEqual(parseFaq(source), { blocks: [{ type: 'paragraph', content: [text('Intro')] }, { type: 'paragraph', content: [text(`See [x](${href}) now`)] }], unsupported: [3] }, href);
  }
});

test('links the browser would rewrite into another host or scheme are not links', () => {
  // URL parsing treats a backslash as a slash and strips leading control characters, so these would leave the page or run script.
  for (const href of ['\\\\example.org', '/\\example.org', '\\/example.org', 'docs\\..\\\\example.org', '\x01javascript:alert(1)', '\x1fhttp://example.org', '\x00//example.org', 'faq\x7f.md']) {
    assert.deepEqual(parseFaq(`[x](${href})`), { blocks: [{ type: 'paragraph', content: [text(`[x](${href})`)] }], unsupported: [1] }, JSON.stringify(href));
  }
});

test('syntax outside the subset stays as its markdown text and is reported by line', () => {
  for (const source of ['1. First', '* Item', '+ Item', '  - Nested', '    indented code', '> Quote', '```', '#### Deep', '| a | b |', '<b>Bold</b>', '---', 'Some *italic* text', 'Some _italic_ text', 'Line with <script>x</script>']) {
    assert.deepEqual(parseFaq(`Intro\n\n${source}`), { blocks: [{ type: 'paragraph', content: [text('Intro')] }, { type: 'paragraph', content: [text(source.trim())] }], unsupported: [3] }, source);
  }
});

test('plain text that only resembles markup is not reported', () => {
  for (const source of ['The field_name column', 'Use a * b or 2*3', 'Costs < 5 and > 2', 'Issue #55']) assert.deepEqual(parseFaq(source).unsupported, [], source);
});

test('HTML comments, including the editing notes at the top of FAQ.md, are skipped', () => {
  assert.deepEqual(parseFaq('<!--\nSupported: # ## ###, - lists.\n-->\n# FAQ\n<!-- one line -->\nText'), { blocks: [{ type: 'heading', level: 1, content: [text('FAQ')] }, { type: 'paragraph', content: [text('Text')] }], unsupported: [] });
});

test('code keeps its contents literal, so markup inside it is not formatted', () => {
  assert.deepEqual(parseFaq('Run `**not bold** [x](y)`').blocks, [{ type: 'paragraph', content: [text('Run '), { type: 'code', text: '**not bold** [x](y)' }] }]);
});

test('FAQ.md uses only the supported syntax and states the tested version and the rights the Repeating Instruments and Events export needs', async () => {
  const { blocks, unsupported } = parseFaq(await readFile(new URL('../FAQ.md', import.meta.url), 'utf8'));
  assert.deepEqual(unsupported, []);
  const shown = blocks.flatMap(block => block.items ?? [block.content]).flat().map(run => run.text).join(' ');
  for (const fact of ['REDCap 17.5.3', 'repeatingFormsEvents', 'API Export', 'Project Setup/Design', 'HTTP 400. Check API permissions and connectivity.']) assert.ok(shown.includes(fact), fact);
});

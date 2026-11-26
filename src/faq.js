// FAQ rules: a fixed markdown subset parsed into plain blocks. Pure: no DOM, storage or network.

// Inline code, bold and links, in that order of precedence, so markup inside code stays literal.
const inlinePattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
// A link may only lead to an HTTPS page, a path relative to the page or a route in this app. Browsers rewrite or drop backslashes and
// control characters while parsing a URL, which could turn an apparently relative link into another host or scheme, so those are refused,
// and a relative link must still resolve to the page's own site under the same parser.
const base = new URL('https://faq.invalid/page/');
function allowedHref(href) {
  if (/[\x00-\x20\x7f\\]/.test(href)) return false;
  if (/^https:\/\//i.test(href) || href.startsWith('#/')) return true;
  return !/^([a-z][a-z\d+.-]*:|#)/i.test(href) && new URL(href, base).origin === base.origin;
}
// Block syntax outside the subset: indented lines, numbered and other lists, quotes, code fences, deeper headings, tables, raw HTML and rules.
const unsupportedBlock = /^(\s+\S|\d+[.)]\s|[*+]\s|>|```|~~~|#{4,}|\||<(?!!--)|[-*_=]{3,}\s*$)/;
// Inline syntax outside the subset, in text that is not code: raw HTML tags and italics.
const unsupportedInline = /<[a-z/!]|(^|[^\w*])\*[^\s*][^*]*\*(?![\w*])|(^|[^\w_])_[^\s_][^_]*_(?![\w_])/i;

// One line or paragraph's runs of text, code, bold and links, and whether a link had to be kept as text.
function inline(source) {
  const runs = [];
  let at = 0, rejected = false;
  const text = value => {
    if (!value) return;
    if (runs.at(-1)?.type === 'text') runs.at(-1).text += value; else runs.push({ type: 'text', text: value });
  };
  for (const match of source.matchAll(inlinePattern)) {
    const [whole, code, bold, label, href] = match;
    text(source.slice(at, match.index));
    if (code !== undefined) runs.push({ type: 'code', text: code });
    else if (bold !== undefined) runs.push({ type: 'bold', text: bold });
    else if (allowedHref(href)) runs.push({ type: 'link', text: label, href });
    else { text(whole); rejected = true; }
    at = match.index + whole.length;
  }
  text(source.slice(at));
  return { runs, rejected: rejected || runs.some(run => run.type === 'text' && unsupportedInline.test(run.text)) };
}

// The blocks of the FAQ, and the line numbers of any syntax outside the subset, which is kept as paragraph text.
// Inline syntax is reported by the first line of its paragraph. A paragraph or list continues until a blank line or another kind of block.
// HTML comments, such as editing notes, are skipped.
export function parseFaq(markdown) {
  const blocks = [], unsupported = new Set();
  let paragraph = null, list = null, comment = false;
  const runs = (source, line) => {
    const { runs, rejected } = inline(source);
    if (rejected) unsupported.add(line);
    return runs;
  };
  markdown.split(/\r?\n/).forEach((text, index) => {
    const line = index + 1, supported = !unsupportedBlock.test(text);
    const heading = supported && text.match(/^(#{1,3}) (.+)$/), item = supported && text.match(/^- (.+)$/);
    if (!comment && text.startsWith('<!--')) comment = true;
    if (comment) { comment = !text.includes('-->'); paragraph = list = null; return; }
    if (!text.trim()) { paragraph = list = null; return; }
    if (!supported) unsupported.add(line);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, source: heading[2].trim(), line }); paragraph = list = null; return; }
    if (item) {
      if (!list) blocks.push(list = { type: 'list', items: [] });
      list.items.push({ source: item[1].trim(), line });
      paragraph = null;
      return;
    }
    list = null;
    if (paragraph) paragraph.source += ` ${text.trim()}`;
    else blocks.push(paragraph = { type: 'paragraph', source: text.trim(), line });
  });
  return {
    blocks: blocks.map(({ source, line, ...block }) => block.type === 'list' ? { ...block, items: block.items.map(item => runs(item.source, item.line)) } : { ...block, content: runs(source, line) }),
    unsupported: [...unsupported].sort((a, b) => a - b)
  };
}

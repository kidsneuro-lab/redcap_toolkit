// One minimal fake DOM: enough to mount views and drive their handlers without a browser or dependencies.
// It parses markup only to build the element tree, ids and boolean attributes. It does not render or lay out anything.
const voidTags = new Set(['input', 'meta', 'link', 'br', 'img', 'hr']);

class FakeNode {
  constructor(document, tag = '#text', text = '') {
    Object.assign(this, { ownerDocument: document, tagName: tag.toUpperCase(), textContent: text, value: '', id: '', className: '', type: '', href: '', download: '', tabIndex: 0, hidden: false, disabled: false, checked: false, inert: false, parentNode: null, children: [], attributes: {}, events: {} });
  }
  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === 'string' ? this.ownerDocument.createTextNode(node) : node;
      child.remove();
      child.parentNode = this;
      this.children.push(child);
    }
  }
  add(option) { this.append(option); }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  *descendants() {
    for (const child of this.children) { yield child; yield* child.descendants(); }
  }
  querySelector(selector) {
    if (!selector.startsWith('#')) throw new Error(`Fake DOM supports id selectors only: ${selector}`);
    for (const node of this.descendants()) if (node.id === selector.slice(1)) return node;
    return null;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, handler) { (this.events[name] ??= []).push(handler); }
  // Returns the handlers' results so tests can await asynchronous handlers.
  dispatch(name, event = {}) { return Promise.all((this.events[name] || []).map(handler => handler({ preventDefault() {}, ...event }))); }
  click() {
    if (this.disabled) return Promise.resolve([]);
    if (this.tagName === 'A') this.ownerDocument.downloads.push({ href: this.href, name: this.download });
    return this.dispatch('click');
  }
  focus() { this.ownerDocument.activeElement = this; }
  reset() {
    for (const node of this.descendants()) if (['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)) { node.value = ''; node.checked = 'checked' in node.attributes; }
  }
  set innerHTML(html) {
    this.replaceChildren();
    const stack = [this];
    for (const [, closing, tag, attributes, text] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g)) {
      const parent = stack.at(-1);
      if (text !== undefined) { if (text.trim()) parent.textContent += text.trim(); continue; }
      if (closing) { stack.pop(); continue; }
      const node = this.ownerDocument.createElement(tag);
      for (const [, name, value = ''] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
        node.setAttribute(name, value);
        if (name === 'id' || name === 'type' || name === 'value') node[name] = value;
        if (name === 'class') node.className = value;
        if (['hidden', 'checked', 'disabled'].includes(name)) node[name] = true;
      }
      parent.append(node);
      if (!voidTags.has(tag.toLowerCase())) stack.push(node);
    }
  }
}

// Installs a fresh fake as the global document, which view helpers use when called (never on import).
export function installDocument() {
  const document = { downloads: [], activeElement: null };
  Object.assign(document, {
    createElement: tag => new FakeNode(document, tag),
    createTextNode: text => new FakeNode(document, '#text', text),
    body: null,
    getElementById: id => document.body.querySelector(`#${id}`)
  });
  document.body = document.createElement('body');
  globalThis.document = document;
  return document;
}

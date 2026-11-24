import { element } from './dom.js';

// Hash routes to Tools. Each Tool is mounted the first time its route is opened, then only hidden and shown,
// so its state, such as a report, survives switching Tools. The first Tool is the default for unknown routes.
export function mountRouter({ nav, outlet, tools, toolkit }) {
  const panels = new Map();
  const links = new Map(tools.map(tool => {
    const item = element('li', undefined, 'nav-item'), link = element('a', tool.title, 'nav-link');
    link.href = `#/${tool.id}`;
    item.append(link); nav.append(item);
    return [tool.id, link];
  }));
  function show(hash) {
    const tool = tools.find(item => `#/${item.id}` === hash) || tools[0];
    if (!panels.has(tool.id)) {
      const panel = element('section');
      panel.setAttribute('data-tool', tool.id);
      outlet.append(panel);
      panels.set(tool.id, panel);
      tool.mount(panel, toolkit);
    }
    for (const [id, panel] of panels) panel.hidden = id !== tool.id;
    for (const [id, link] of links) {
      link.className = `nav-link${id === tool.id ? ' active' : ''}`;
      if (id === tool.id) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    }
  }
  return { show };
}

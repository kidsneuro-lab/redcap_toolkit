import { element } from './dom.js';

// Hash routes to Tools. Each Tool is mounted the first time its route is opened, then only hidden and shown,
// so its state, such as a report, survives switching Tools. A Tool whose mount returns { leave } is told when it is hidden,
// for state that must not survive, such as record data. The first Tool is the default for unknown routes.
export function mountRouter({ nav, outlet, tools, toolkit }) {
  const panels = new Map(), leaves = new Map();
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
      leaves.set(tool.id, tool.mount(panel, toolkit)?.leave);
    }
    for (const [id, panel] of panels) {
      if (id !== tool.id && !panel.hidden) leaves.get(id)?.();
      panel.hidden = id !== tool.id;
    }
    for (const [id, link] of links) {
      link.className = `nav-link${id === tool.id ? ' active' : ''}`;
      if (id === tool.id) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    }
  }
  return { show };
}

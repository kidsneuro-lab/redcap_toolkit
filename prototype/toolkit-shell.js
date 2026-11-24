// PROTOTYPE, throwaway. Three toolkit shell variants on prototype/toolkit-shell.html, switchable via ?variant=A|B|C.
// Synthetic projects only. No REDCap calls, no storage. Icons are @tabler/icons 3.52.0 outline paths (MIT).
const paths = {
  diff: '<path d="M11 16h10"/><path d="M11 16l4 4"/><path d="M11 16l4 -4"/><path d="M13 8h-10"/><path d="M13 8l-4 4"/><path d="M13 8l-4 -4"/>',
  sheet: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/><path d="M8 11h8v7h-8l0 -7"/><path d="M8 15h8"/><path d="M11 11v7"/>',
  database: '<path d="M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0"/><path d="M4 6v6a8 3 0 0 0 16 0v-6"/><path d="M4 12v6a8 3 0 0 0 16 0v-6"/>',
  key: '<path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0"/><path d="M15 9h.01"/>',
  moon: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008"/>',
  sun: '<path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
  menu: '<path d="M4 6l16 0"/><path d="M4 12l16 0"/><path d="M4 18l16 0"/>',
  plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>'
};
const icon = (name, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

const variants = { A: 'Top navbar + Projects drawer', B: 'Sidebar + Projects page', C: 'Top tabs + Projects rail' };
const tools = [{ id: 'compare', title: 'Schema comparison', icon: 'diff' }, { id: 'template', title: 'Upload template', icon: 'sheet' }];
const state = {
  projects: [
    { id: 'p1', label: 'Example project DEV', tags: ['DEV'], token: true },
    { id: 'p2', label: 'Example project PROD', tags: ['PROD'], token: false },
    { id: 'p3', label: 'Pilot study', tags: ['Phase 1'], token: false }
  ],
  proxy: false, drawer: false, navOpen: false
};
const params = new URLSearchParams(location.search);
let variant = variants[params.get('variant')] ? params.get('variant') : 'A';
const route = () => location.hash.replace(/^#\//, '') || 'compare';
const tokenCount = () => state.projects.filter(p => p.token).length;
const tokenSummary = () => `${tokenCount()} of ${state.projects.length} tokens`;

// ---- shared content (the Tools and the project list); each variant owns its own layout ----
const options = () => state.projects.map(p => `<option>${[p.label, ...p.tags].join(' · ')}</option>`).join('');
const compareView = () => `
  <div class="card mb-3"><div class="card-body">
    <div class="row g-3 align-items-end">
      <div class="col-md"><label class="form-label" for="ref">Reference project</label><select id="ref" class="form-select">${options()}</select><div class="form-hint">Values appear on the left.</div></div>
      <div class="col-md"><label class="form-label" for="cmp">Comparison project</label><select id="cmp" class="form-select">${options()}</select><div class="form-hint">Values appear on the right.</div></div>
      <div class="col-md-auto d-flex gap-2 pb-4"><button class="btn btn-primary" type="button">Compare projects</button><button class="btn" type="button">Explore demo</button></div>
    </div>
  </div></div>
  <div class="row row-cards mb-3">
    ${[['Project settings', 3, '1 unexpected · 2 expected'], ['Instruments', 1, 'changed or unmatched · 1 changed property'], ['Repeating instruments', 1, 'changed or unmatched'], ['Field metadata', 2, 'changed or unmatched · 1 changed property']].map(([t, n, s]) => `
      <div class="col-sm-6 col-lg-3"><div class="card card-sm"><div class="card-body"><div class="subheader">${t}</div><div class="h1 mb-0">${n}</div><div class="text-secondary small">${s}</div></div></div></div>`).join('')}
  </div>
  <div class="card">
    <div class="card-header"><ul class="nav nav-tabs card-header-tabs"><li class="nav-item"><a class="nav-link" href="#">Project settings</a></li><li class="nav-item"><a class="nav-link" href="#">Instruments</a></li><li class="nav-item"><a class="nav-link" href="#">Repeating instruments</a></li><li class="nav-item"><a class="nav-link active" aria-current="true" href="#">Field metadata</a></li></ul></div>
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Field</th><th>Status</th><th>Property</th><th>Reference · Example project DEV</th><th>Comparison · Example project PROD</th></tr></thead>
      <tbody>
        <tr><td><code>consent</code></td><td><span class="badge bg-yellow-lt">Changed</span></td><td>required_field</td><td><pre class="proto-value">y</pre></td><td><pre class="proto-value">"" (empty string)</pre></td></tr>
        <tr><td><code>rna_quality</code></td><td><span class="badge bg-blue-lt">Reference only</span></td><td colspan="3" class="text-secondary">Whole field present only in the reference project.</td></tr>
      </tbody>
    </table></div>
  </div>`;
const templateView = () => `
  <div class="card proto-placeholder"><div class="card-body">
    <h3 class="card-title">Upload template</h3>
    <p class="text-secondary">Placeholder. The selection flow is decided in "Upload template: selection flow".</p>
    <div class="row g-3">
      <div class="col-md-6"><label class="form-label" for="tp">Project</label><select id="tp" class="form-select">${options()}</select></div>
      <div class="col-md-6"><label class="form-label" for="ti">Instrument</label><select id="ti" class="form-select" disabled><option>Select a project first</option></select></div>
    </div>
    <button class="btn btn-primary mt-3" type="button" disabled>Download CSV</button>
  </div></div>`;
const projectRows = ({ inline }) => state.projects.map(p => `
  <div class="list-group-item"><div class="row align-items-center g-2">
    <div class="col"><div class="fw-bold">${p.label}</div><div>${p.tags.map(t => `<span class="badge bg-secondary-lt me-1">${t}</span>`).join('')}</div></div>
    <div class="col-auto">${p.token ? `<span class="badge bg-green-lt">${icon('key', 'icon-sm')} Token entered</span>` : inline
      ? `<input class="form-control form-control-sm" type="password" placeholder="Paste token" aria-label="API token for ${p.label}" data-action="token" data-id="${p.id}">`
      : `<button class="btn btn-sm btn-outline-warning" type="button" data-action="token" data-id="${p.id}">Enter token</button>`}</div>
    ${inline ? '' : '<div class="col-auto"><button class="btn btn-sm btn-ghost-secondary" type="button">Edit</button></div>'}
  </div></div>`).join('');
const proxySwitch = () => `<label class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" data-action="proxy" ${state.proxy ? 'checked' : ''}><span class="form-check-label">Use local proxy</span></label>`;
const themeButton = () => {
  const dark = document.documentElement.dataset.bsTheme === 'dark';
  return `<button class="nav-link px-2 btn btn-ghost-secondary" type="button" data-action="theme" aria-label="${dark ? 'Use light theme' : 'Use dark theme'}">${icon(dark ? 'sun' : 'moon')}</button>`;
};
const toolLinks = (className = 'nav-item') => tools.map(t => `<li class="${className}"><a class="nav-link ${route() === t.id ? 'active' : ''}" href="#/${t.id}" ${route() === t.id ? 'aria-current="page"' : ''}><span class="nav-link-icon">${icon(t.icon)}</span><span class="nav-link-title">${t.title}</span></a></li>`).join('');
const pageHeader = title => `<div class="page-header d-print-none"><div class="container-xl"><div class="page-pretitle">REDCap Toolkit</div><h2 class="page-title">${title}</h2></div></div>`;
const toolTitle = () => tools.find(t => t.id === route())?.title || 'Projects';
const toolBody = () => route() === 'template' ? templateView() : compareView();
const toggler = id => `<button class="navbar-toggler" type="button" data-action="nav" aria-controls="${id}" aria-expanded="${state.navOpen}" aria-label="Toggle navigation">${icon('menu')}</button>`;

// ---- Variant A: horizontal navbar; Projects open in a right-hand drawer from anywhere ----
function variantA() {
  return `<div class="page">
    <header class="navbar navbar-expand-md d-print-none"><div class="container-xl">
      ${toggler('nav-a')}
      <a class="navbar-brand pe-md-3" href="#/compare">${icon('database', 'me-2')}REDCap Toolkit</a>
      <div class="navbar-nav flex-row order-md-last gap-2 align-items-center">
        ${themeButton()}
        <button class="btn" type="button" data-action="drawer" aria-expanded="${state.drawer}" aria-controls="drawer-a">${icon('key', 'me-1')}Projects <span class="badge ${tokenCount() < state.projects.length ? 'bg-orange-lt' : 'bg-green-lt'} ms-2">${tokenSummary()}</span></button>
      </div>
      <div class="collapse navbar-collapse ${state.navOpen ? 'show' : ''}" id="nav-a"><nav aria-label="Tools"><ul class="navbar-nav">${toolLinks()}</ul></nav></div>
    </div></header>
    <div class="page-wrapper">${pageHeader(toolTitle())}<div class="page-body"><div class="container-xl">${toolBody()}</div></div></div>
    <div id="drawer-a" class="offcanvas offcanvas-end proto-drawer ${state.drawer ? 'show' : ''}" role="dialog" aria-label="Projects" ${state.drawer ? '' : 'hidden'}>
      <div class="offcanvas-header"><h2 class="offcanvas-title">Projects</h2><button class="btn-close" type="button" data-action="drawer" aria-label="Close projects"></button></div>
      <div class="offcanvas-body">
        <p class="text-secondary small">Details are remembered in this browser. Tokens stay in memory for this session only.</p>
        <div class="list-group list-group-flush mb-3">${projectRows({ inline: false })}</div>
        <button class="btn btn-outline-primary w-100 mb-3" type="button">${icon('plus', 'me-1')}Add project</button>
        ${proxySwitch()}
      </div>
    </div>
    ${state.drawer ? '<div class="offcanvas-backdrop fade show" data-action="drawer"></div>' : ''}
  </div>`;
}

// ---- Variant B: vertical sidebar; Projects is its own route alongside the Tools ----
function variantB() {
  const projectsPage = `<div class="card"><div class="card-header"><h3 class="card-title">Configured projects</h3><div class="card-actions"><button class="btn btn-primary" type="button">${icon('plus', 'me-1')}Add project</button></div></div>
    <div class="list-group list-group-flush">${projectRows({ inline: false })}</div>
    <div class="card-footer d-flex justify-content-between align-items-center flex-wrap gap-2"><span class="text-secondary small">Details are remembered in this browser. Tokens stay in memory for this session only.</span>${proxySwitch()}</div></div>`;
  return `<div class="page">
    <aside class="navbar navbar-vertical navbar-expand-lg" data-bs-theme="dark"><div class="container-fluid">
      ${toggler('nav-b')}
      <a class="navbar-brand" href="#/compare">${icon('database', 'me-2')}REDCap Toolkit</a>
      <div class="collapse navbar-collapse ${state.navOpen ? 'show' : ''}" id="nav-b">
        <nav aria-label="Tools" class="w-100"><ul class="navbar-nav pt-lg-3">
          <li class="nav-item"><span class="nav-link disabled text-uppercase small">Tools</span></li>
          ${toolLinks()}
          <li class="nav-item mt-3"><span class="nav-link disabled text-uppercase small">Setup</span></li>
          <li class="nav-item"><a class="nav-link ${route() === 'projects' ? 'active' : ''}" href="#/projects" ${route() === 'projects' ? 'aria-current="page"' : ''}><span class="nav-link-icon">${icon('key')}</span><span class="nav-link-title">Projects</span><span class="badge ${tokenCount() < state.projects.length ? 'bg-orange-lt' : 'bg-green-lt'} ms-auto">${tokenSummary()}</span></a></li>
        </ul></nav>
        <div class="mt-auto p-3 d-flex align-items-center justify-content-between">${proxySwitch()}${themeButton()}</div>
      </div>
    </div></aside>
    <div class="page-wrapper">${pageHeader(toolTitle())}<div class="page-body"><div class="container-xl">${route() === 'projects' ? projectsPage : toolBody()}</div></div></div>
  </div>`;
}

// ---- Variant C: dark top bar with Tool tabs; Projects and tokens always visible in a left rail ----
function variantC() {
  return `<div class="page">
    <header class="navbar navbar-expand-md d-print-none" data-bs-theme="dark"><div class="container-xl">
      ${toggler('nav-c')}
      <a class="navbar-brand pe-md-4" href="#/compare">${icon('database', 'me-2')}REDCap Toolkit</a>
      <div class="navbar-nav flex-row order-md-last">${themeButton()}</div>
      <div class="collapse navbar-collapse ${state.navOpen ? 'show' : ''}" id="nav-c"><nav aria-label="Tools"><ul class="navbar-nav">${toolLinks()}</ul></nav></div>
    </div></header>
    <div class="page-wrapper"><div class="page-body"><div class="container-xl"><div class="row g-4">
      <div class="col-lg-4"><div class="card proto-rail">
        <div class="card-header"><h3 class="card-title">Projects this session</h3><div class="card-actions"><button class="btn btn-sm" type="button" aria-label="Add project">${icon('plus')}</button></div></div>
        <div class="list-group list-group-flush">${projectRows({ inline: true })}</div>
        <div class="card-footer">${proxySwitch()}<div class="form-hint mt-1">Tokens stay in memory for this session only.</div></div>
      </div></div>
      <div class="col-lg-8"><h2 class="page-title mb-3">${toolTitle()}</h2>${toolBody()}</div>
    </div></div></div></div>
  </div>`;
}

const renderers = { A: variantA, B: variantB, C: variantC };
function render() {
  if (variant !== 'B' && route() === 'projects') { location.hash = '#/compare'; return; }
  document.getElementById('root').innerHTML = renderers[variant]();
  document.getElementById('proto-label').textContent = `${variant} (${variants[variant]})`;
}
function setVariant(step) {
  const keys = Object.keys(variants);
  variant = keys[(keys.indexOf(variant) + step + keys.length) % keys.length];
  state.navOpen = false; state.drawer = false;
  history.replaceState(null, '', `?variant=${variant}${location.hash}`);
  render();
}
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.matches('input')) return;
  const action = target.dataset.action;
  if (action === 'nav') state.navOpen = !state.navOpen;
  if (action === 'drawer') state.drawer = !state.drawer;
  if (action === 'theme') document.documentElement.dataset.bsTheme = document.documentElement.dataset.bsTheme === 'dark' ? 'light' : 'dark';
  if (action === 'token') state.projects.find(p => p.id === target.dataset.id).token = true;
  render();
});
document.addEventListener('change', event => {
  const target = event.target;
  if (target.dataset.action === 'proxy') state.proxy = target.checked;
  if (target.dataset.action === 'token' && target.value) { state.projects.find(p => p.id === target.dataset.id).token = true; render(); }
});
document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key === 'Escape' && state.drawer) { state.drawer = false; render(); }
  if (event.key === 'ArrowLeft') setVariant(-1);
  if (event.key === 'ArrowRight') setVariant(1);
});
document.getElementById('proto-prev').addEventListener('click', () => setVariant(-1));
document.getElementById('proto-next').addEventListener('click', () => setVariant(1));
window.addEventListener('hashchange', () => { state.navOpen = false; render(); });
render();

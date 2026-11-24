import { readProjects, writeProjects } from './projects.js';
import { validateApiUrl } from './api.js';
import { button, element } from './dom.js';
import { icon } from './icons.js';

const triggerTemplate = `<button id="projects-button" class="btn" type="button" aria-haspopup="dialog" aria-controls="projects-drawer">${icon('key', 'me-1')}Projects <span id="token-count" class="badge ms-2"></span></button>`;
const template = `<dialog id="projects-drawer" class="offcanvas offcanvas-end" aria-labelledby="projects-heading">
  <div class="offcanvas-header"><h2 id="projects-heading" class="offcanvas-title">Projects</h2><button id="close-projects" class="btn-close" type="button" aria-label="Close projects"></button></div>
  <div id="projects-body" class="offcanvas-body">
    <p class="text-secondary small">Project details are remembered in this browser. Tokens stay in memory until you close or reload the page.</p>
    <div id="project-list" class="list-group list-group-flush mb-3"></div>
    <button id="new-project" class="btn btn-outline-primary w-100 mb-3" type="button">${icon('plus', 'me-1')}Add project</button>
    <form id="project-form" class="mb-3" hidden>
      <input id="project-id" type="hidden">
      <div class="mb-3"><label class="form-label" for="label">Display label</label><input id="label" class="form-control" required placeholder="Example project"></div>
      <div class="mb-3"><label class="form-label" for="expected-title">Expected REDCap project title</label><input id="expected-title" class="form-control" required placeholder="Exact title returned by Project Info"><div class="form-hint">Case and whitespace must match exactly.</div></div>
      <div class="mb-3"><label class="form-label" for="tags">Tags (optional)</label><input id="tags" class="form-control" placeholder="DEV, Phase 1"><div class="form-hint">Separate tags with commas. Tags describe projects and do not restrict comparisons or validate production status.</div></div>
      <div class="mb-3"><label class="form-label" for="api-url">REDCap API URL</label><input id="api-url" class="form-control" type="url" required placeholder="https://redcap.example.org/api/"></div>
      <div class="mb-3"><label class="form-label" for="token">API token</label><input id="token" class="form-control" type="password" autocomplete="off" spellcheck="false" placeholder="Paste token for this session"><div class="form-hint">Token is excluded from saved configuration and report downloads.</div></div>
      <div class="d-flex flex-wrap gap-2 align-items-center"><button class="btn btn-primary" type="submit">Save project</button><button id="cancel-edit" class="btn" type="button">Cancel</button><span id="form-error" class="text-danger small" role="alert"></span></div>
    </form>
    <div id="proxy-setting" hidden><label class="form-check form-switch mb-1"><input id="proxy" class="form-check-input" type="checkbox"><span class="form-check-label">Use local proxy</span></label><div class="form-hint">For installations that block direct browser API access. Configure allowed API URLs on the local server first.</div></div>
  </div>
</dialog>`;

// The toolkit-level Projects drawer, opened from its button in the trigger slot. It owns saved project configuration and the session tokens.
export function mountProjects(container, { trigger, hostname, storage, notice }) {
  container.innerHTML = template;
  trigger.innerHTML = triggerTemplate;
  const $ = id => container.querySelector(`#${id}`) || trigger.querySelector(`#${id}`);
  const listeners = [];
  let projects = [];

  const current = () => projects.map(project => ({ ...project, tags: [...project.tags] }));
  function changed() {
    try { writeProjects(storage, projects); } catch { notice('Browser storage is unavailable. Configuration will only be available in this session.'); }
    render();
    for (const listener of listeners) listener(current());
  }
  function render() {
    const entered = projects.filter(project => project.token).length;
    $('token-count').textContent = projects.length ? `${entered} of ${projects.length} tokens` : 'No projects';
    $('token-count').className = `badge ms-2 ${projects.length && entered === projects.length ? 'bg-green-lt' : 'bg-orange-lt'}`;
    $('project-list').replaceChildren();
    if (!projects.length) $('project-list').append(element('p', 'No projects configured yet.', 'hint'));
    for (const project of projects) {
      const row = element('div', undefined, 'list-group-item'), info = element('div');
      info.append(element('div', project.label, 'fw-bold'));
      for (const tag of project.tags) info.append(element('span', tag, 'badge bg-secondary-lt me-1'));
      info.append(element('div', `${project.token ? 'Token available for this session' : 'Token needed'} · ${project.apiUrl}`, 'text-secondary small text-break'));
      const actions = element('div', undefined, 'd-flex flex-wrap gap-2 mt-2');
      if (!project.token) actions.append(button('Enter token', () => { edit(project); $('token').focus(); }, 'btn btn-sm btn-outline-warning'));
      actions.append(button('Edit', () => edit(project), 'btn btn-sm'), button('Remove', () => {
        projects = projects.filter(item => item.id !== project.id);
        if ($('project-id').value === project.id) $('project-form').hidden = true;
        changed();
      }, 'btn btn-sm btn-ghost-danger'));
      row.append(info, actions); $('project-list').append(row);
    }
  }
  // The native modal dialog contains focus, closes on Escape and returns focus to the control that opened it.
  function show(open = true) {
    if (open && !$('projects-drawer').open) $('projects-drawer').showModal();
    if (!open) $('projects-drawer').close();
    $('projects-drawer').className = `offcanvas offcanvas-end${$('projects-drawer').open ? ' show' : ''}`;
  }
  function edit(project = null) {
    show();
    $('project-form').reset();
    $('project-id').value = project?.id || '';
    $('label').value = project?.label || '';
    $('expected-title').value = project?.expectedTitle || '';
    $('tags').value = project?.tags.join(', ') || '';
    $('api-url').value = project?.apiUrl || '';
    $('token').value = project?.token || '';
    $('form-error').textContent = '';
    $('project-form').hidden = false;
    $('label').focus();
  }

  $('project-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const project = { id: $('project-id').value || crypto.randomUUID(), label: $('label').value.trim(), expectedTitle: $('expected-title').value, tags: [...new Set($('tags').value.split(',').map(tag => tag.trim()).filter(Boolean))], apiUrl: validateApiUrl($('api-url').value.trim()), token: $('token').value.trim() };
      if (!project.label || !project.expectedTitle.trim()) throw new Error('Complete the label and expected title.');
      const existing = projects.findIndex(item => item.id === project.id);
      if (existing < 0) projects.push(project); else projects[existing] = project;
      $('project-form').reset(); $('project-form').hidden = true;
      changed();
    } catch (error) { $('form-error').textContent = error.message; }
  });
  $('new-project').addEventListener('click', () => edit());
  $('projects-button').addEventListener('click', () => show());
  $('close-projects').addEventListener('click', () => show(false));
  $('projects-drawer').addEventListener('close', () => { $('projects-drawer').className = 'offcanvas offcanvas-end'; });
  $('cancel-edit').addEventListener('click', () => { $('project-form').hidden = true; $('project-form').reset(); });

  // The proxy is part of the supplied local server, so it is offered only when the page is served from loopback.
  const local = ['127.0.0.1', 'localhost'].includes(hostname);
  $('proxy-setting').hidden = !local;

  try { projects = readProjects(storage).map(project => ({ ...project, token: '' })); } catch { projects = []; notice('Saved configuration could not be loaded. Add your project details again.', true); }
  render();

  return {
    projects: current,
    onProjectsChange: listener => { listeners.push(listener); },
    proxy: () => local && $('proxy').checked,
    // Opens the area, and a new project form when none are configured yet.
    show: (open = true, { addIfEmpty = false } = {}) => { show(open); if (open && addIfEmpty && !projects.length) edit(); },
    setBusy: busy => { $('new-project').disabled = busy; $('projects-body').inert = busy; }
  };
}

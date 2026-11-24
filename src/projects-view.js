import { readProjects, writeProjects } from './projects.js';
import { validateApiUrl } from './api.js';
import { button, element } from './dom.js';

const template = `<section id="configuration" class="panel" aria-labelledby="configuration-heading" hidden>
  <div class="section-heading"><div><h2 id="configuration-heading">Project configuration</h2><p class="hint">Project details are remembered in this browser. Tokens stay in memory until you close or reload the page.</p></div><button id="new-project" class="secondary">Add project</button></div>
  <div id="project-list" class="project-list"></div>
  <form id="project-form" hidden>
    <input id="project-id" type="hidden">
    <div class="form-grid">
      <div><label for="label">Display label</label><input id="label" required placeholder="Example project"></div>
      <div><label for="expected-title">Expected REDCap project title</label><input id="expected-title" required placeholder="Exact title returned by Project Info"><p class="hint">Case and whitespace must match exactly.</p></div>
      <div><label for="tags">Tags (optional)</label><input id="tags" placeholder="DEV, Phase 1"><p class="hint">Separate tags with commas. Tags describe projects and do not restrict comparisons or validate production status.</p></div>
      <div><label for="api-url">REDCap API URL</label><input id="api-url" type="url" required placeholder="https://redcap.example.org/api/"></div>
      <div><label for="token">API token</label><input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste token for this session"><p class="hint">Token is excluded from saved configuration and report downloads.</p></div>
    </div>
    <div class="form-actions"><button class="primary" type="submit">Save project</button><button id="cancel-edit" class="secondary" type="button">Cancel</button><span id="form-error" class="error-text" role="alert"></span></div>
  </form>
</section>`;

// The toolkit-level Projects area. It owns saved project configuration and the session tokens.
export function mountProjects(container, { storage, notice }) {
  container.innerHTML = template;
  const $ = id => container.querySelector(`#${id}`);
  const listeners = [];
  let projects = [];

  const current = () => projects.map(project => ({ ...project, tags: [...project.tags] }));
  function changed() {
    try { writeProjects(storage, projects); } catch { notice('Browser storage is unavailable. Configuration will only be available in this session.'); }
    render();
    for (const listener of listeners) listener(current());
  }
  function render() {
    $('project-list').replaceChildren();
    if (!projects.length) $('project-list').append(element('p', 'No projects configured yet.', 'hint'));
    for (const project of projects) {
      const row = element('div', undefined, 'project-item'), info = element('div');
      info.append(element('strong', project.label));
      for (const tag of project.tags) info.append(' ', element('span', tag, 'badge'));
      info.append(element('p', `${project.token ? 'Token available for this session' : 'Token needed'} · ${project.apiUrl}`, 'hint'));
      const actions = element('div', undefined, 'project-item-actions');
      actions.append(button('Edit', () => edit(project)), button('Remove', () => {
        projects = projects.filter(item => item.id !== project.id);
        if ($('project-id').value === project.id) $('project-form').hidden = true;
        changed();
      }));
      row.append(info, actions); $('project-list').append(row);
    }
  }
  function show(open = true) { $('configuration').hidden = !open; }
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
  $('cancel-edit').addEventListener('click', () => { $('project-form').hidden = true; $('project-form').reset(); });

  try { projects = readProjects(storage).map(project => ({ ...project, token: '' })); } catch { projects = []; notice('Saved configuration could not be loaded. Add your project details again.', true); }
  render();

  return {
    projects: current,
    onProjectsChange: listener => { listeners.push(listener); },
    // Opens the area, and a new project form when none are configured yet.
    show: (open = true, { addIfEmpty = false } = {}) => { show(open); if (open && addIfEmpty && !projects.length) edit(); },
    setBusy: busy => { $('new-project').disabled = busy; $('configuration').inert = busy; }
  };
}

import { containsTokenShape, readProjects, writeProjects } from './projects.js';
import { fetchExport, isLocalHost, validateApiUrl } from './api.js';
import { checkProjectInfo, endpointKey } from './identity.js';
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
      <input id="config-id" type="hidden">
      <div class="mb-3"><label class="form-label" for="api-url">REDCap API URL</label><input id="api-url" class="form-control" type="url" spellcheck="false" required placeholder="https://redcap.example.org/api/"></div>
      <div class="mb-3"><label class="form-label" for="redcap-project-id">REDCap project ID</label><input id="redcap-project-id" class="form-control" inputmode="numeric" spellcheck="false" placeholder="PID shown in REDCap, such as 123"><div class="form-hint">The project title and production status are read from REDCap.</div></div>
      <div class="mb-3"><label class="form-label" for="token">API token</label><input id="token" class="form-control token-mask" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore placeholder="Paste token for this session"><div class="form-hint">Each token is checked against the project ID when saved. Tokens are excluded from saved configuration and report downloads.</div></div>
      <div class="mb-3"><label class="form-label" for="tags">Tags (optional)</label><input id="tags" class="form-control" spellcheck="false" placeholder="Phase 1"><div class="form-hint">Separate tags with commas. A PROD or DEV tag is added from REDCap's production status. Tags describe projects and do not restrict comparisons.</div></div>
      <div class="d-flex flex-wrap gap-2 align-items-center"><button id="save-project" class="btn btn-primary" type="submit">Save project</button><button id="cancel-edit" class="btn" type="button">Cancel</button><span id="form-error" class="text-danger small" role="alert"></span></div>
    </form>
    <div id="proxy-setting" hidden><label class="form-check form-switch mb-1"><input id="proxy" class="form-check-input" type="checkbox"><span class="form-check-label">Use local proxy</span></label><div class="form-hint">For installations that block direct browser API access. Configure allowed API URLs on the local server first.</div></div>
  </div>
</dialog>`;

// The toolkit-level Projects drawer, opened from its button in the trigger slot. It owns saved project configuration and the session tokens.
export function mountProjects(container, { trigger, hostname, storage, apiUrls = null, notice }) {
  container.innerHTML = template;
  trigger.innerHTML = triggerTemplate;
  const $ = id => container.querySelector(`#${id}`) || trigger.querySelector(`#${id}`);
  const listeners = [];
  let projects = [];

  // A saved project may predate the allowlist. It stays listed so it can be edited or removed, but cannot take a token.
  const permitted = apiUrl => { try { validateApiUrl(apiUrl, apiUrls); return true; } catch { return false; } };
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
    if (!projects.length) $('project-list').append(element('p', 'No projects configured yet.', 'text-secondary'));
    for (const project of projects) {
      const row = element('div', undefined, 'list-group-item'), info = element('div');
      const name = element('div', undefined, 'fw-bold');
      name.append(element('span', project.title ?? project.expectedTitle), element('span', project.projectId ? `PID ${project.projectId}` : 'Project ID not checked', 'text-secondary fw-normal small ms-2'));
      info.append(name);
      for (const tag of project.tags) info.append(element('span', tag, 'badge bg-secondary-lt me-1'));
      const blocked = !permitted(project.apiUrl);
      info.append(element('div', `${blocked ? 'Blocked: this API URL is not permitted on this site' : project.token ? 'Token available for this session' : 'Token needed'} · ${project.apiUrl}`, `${blocked ? 'text-danger' : 'text-secondary'} small text-break`));
      const actions = element('div', undefined, 'd-flex flex-wrap gap-2 mt-2');
      if (!project.token && !blocked) actions.append(button('Enter token', () => { edit(project); $('token').focus(); }, 'btn btn-sm btn-outline-warning'));
      actions.append(button('Edit', () => edit(project), 'btn btn-sm'), button('Remove', () => {
        projects = projects.filter(item => item.id !== project.id);
        if ($('config-id').value === project.id) $('project-form').hidden = true;
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
    $('config-id').value = project?.id || '';
    $('api-url').value = project?.apiUrl || '';
    $('redcap-project-id').value = project?.projectId || '';
    $('token').value = project?.token || '';
    $('tags').value = project?.tags.join(', ') || '';
    $('form-error').textContent = '';
    $('project-form').hidden = false;
    $('api-url').focus();
  }

  // Saving checks a token against Project Info before the project or the token is kept.
  $('project-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('form-error').textContent = '';
    try {
      const id = $('config-id').value || crypto.randomUUID(), tags = [...new Set($('tags').value.split(',').map(tag => tag.trim()).filter(Boolean))];
      const apiUrl = validateApiUrl($('api-url').value.trim(), apiUrls), projectId = $('redcap-project-id').value.trim(), token = $('token').value.trim();
      const existing = projects.find(item => item.id === id);
      // A project saved before project IDs were recorded may leave the project ID blank, to be read from its first checked token.
      if (!(existing && !existing.projectId && !projectId) && !/^[1-9]\d*$/.test(projectId)) throw new Error('Enter the REDCap project ID, using digits only.');
      if (tags.some(containsTokenShape)) throw new Error('Tags contains text that looks like a REDCap token. Paste the token into the API token field.');
      const duplicateOf = candidate => projects.find(item => item.id !== id && item.projectId && item.projectId === candidate.projectId && endpointKey(item.apiUrl) === endpointKey(candidate.apiUrl));
      const refuseDuplicate = candidate => { const duplicate = duplicateOf(candidate); if (duplicate) throw new Error(`This project is already saved as ${JSON.stringify(duplicate.title)}.`); };
      refuseDuplicate({ projectId, apiUrl });
      const sameProject = existing && endpointKey(existing.apiUrl) === endpointKey(apiUrl) && (existing.projectId ?? '') === projectId;
      if (sameProject && (!token || token === existing.token)) projects[projects.indexOf(existing)] = { ...existing, tags };
      else {
        // A changed API URL or project ID is a different project, so nothing is carried over from the saved one but its tags.
        if (!token) throw new Error('Enter the API token. It is checked against Project Info before saving.');
        // The list is locked while the check runs. The project is found again by its ID afterwards, in case the list changed anyway.
        $('save-project').disabled = $('new-project').disabled = $('project-list').inert = true;
        const info = await fetchExport({ apiUrl, token }, 'project', { proxy: local && $('proxy').checked, allowed: apiUrls });
        const { project, notices } = checkProjectInfo(sameProject ? { ...existing, tags } : { id, projectId, tags, apiUrl }, info);
        const index = projects.findIndex(item => item.id === id);
        // A project removed during the check stays removed, and its token is not kept.
        if (existing && index < 0) return;
        refuseDuplicate(project);
        if (existing) projects[index] = { ...project, token }; else projects.push({ ...project, token });
        for (const message of notices) notice(message);
      }
      $('project-form').reset(); $('project-form').hidden = true;
      changed();
    } catch (error) {
      // A token that fails the check is not kept anywhere.
      $('token').value = '';
      $('form-error').textContent = error.message;
    } finally { $('save-project').disabled = $('new-project').disabled = $('project-list').inert = false; }
  });
  $('new-project').addEventListener('click', () => edit());
  $('projects-button').addEventListener('click', () => show());
  $('close-projects').addEventListener('click', () => show(false));
  $('projects-drawer').addEventListener('close', () => { $('projects-drawer').className = 'offcanvas offcanvas-end'; });
  $('cancel-edit').addEventListener('click', () => { $('project-form').hidden = true; $('project-form').reset(); });

  // The proxy is part of the supplied local server, so it is offered only when the page is served from loopback.
  const local = isLocalHost(hostname);
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

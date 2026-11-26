import { dictionaryRows } from './dictionary.js';
import { fetchExport } from './api.js';
import { validateIdentity } from './identity.js';
import { demoSnapshots } from './demo.js';
import { element, option } from './dom.js';

// The demo project is offered in the Project select only while it is loaded. It is never added to the project list.
const demoId = 'demo', demoLabel = 'Example project DEV (demo, synthetic)';
const template = `<div class="page-header mt-0 mb-4"><div class="row g-3 align-items-center"><div class="col"><div class="page-pretitle">REDCap data dictionary</div><h1 class="page-title">Data dictionary</h1><p class="text-secondary mb-0 mt-1">Look up field names, types and coded values before entering data. Nothing is sent to REDCap.</p></div><div class="col-auto"><button id="demo" class="btn" type="button">Explore demo</button></div></div></div>
<section class="card" aria-label="Project and instruments"><div class="card-body">
  <div class="row g-3"><div class="col-md-6"><label class="form-label" for="project">Project</label><select id="project" class="form-select"><option value="">Select a project</option></select></div></div>
  <div id="project-status" class="mt-3" role="status"></div>
  <div id="controls" class="mt-3" hidden>
    <fieldset class="mb-3"><legend class="form-label">Instruments</legend><div id="instrument-list"></div><div class="btn-list mt-2"><button id="select-instruments" class="btn btn-sm" type="button">Select all</button><button id="clear-instruments" class="btn btn-sm" type="button">Clear</button></div></fieldset>
    <div class="row g-3 align-items-end mb-3"><div class="col-md-6"><label class="form-label" for="search">Search</label><input id="search" class="form-control" type="search" placeholder="Field name, label or choice" autocomplete="off"></div><div class="col-md-6"><label class="form-check mb-2"><input id="hide-free-text" class="form-check-input" type="checkbox" checked><span class="form-check-label">Hide free-text and non-entry fields</span></label></div></div>
    <p id="empty" class="text-secondary mb-0" hidden></p>
    <div class="table-responsive"><table class="table table-sm table-vcenter mb-0"><thead><tr><th><button id="sort-name" class="table-sort" type="button">Variable</button></th><th><button id="sort-instrument" class="table-sort" type="button">Instrument</button></th><th><button id="sort-label" class="table-sort" type="button">Field label</button></th><th><button id="sort-type" class="table-sort" type="button">Type</button></th><th>Choices</th><th>Required</th><th>Min/Max</th></tr></thead><tbody id="dictionary-rows"></tbody></table></div>
  </div>
</div></section>`;

const sortColumns = ['name', 'instrument', 'label', 'type'];

function mount(container, toolkit) {
  container.innerHTML = template;
  const $ = id => container.querySelector(`#${id}`);
  let snapshot = null, demo = false, loads = 0, loaded = '', sort = null;

  function renderProjects() {
    const current = $('project').value;
    $('project').replaceChildren(option('Select a project', ''));
    if (demo) $('project').append(option(demoLabel, demoId));
    for (const project of toolkit.projects()) $('project').append(option([project.label, ...project.tags].join(' · '), project.id));
    $('project').value = current;
  }
  const chosenInstruments = () => snapshot.instruments.map(row => row.instrument_name).filter(name => $(`instrument-${name}`).checked);
  function renderInstruments() {
    $('instrument-list').replaceChildren(...snapshot.instruments.map(row => {
      const wrapper = element('label', undefined, 'form-check form-check-inline'), box = element('input', undefined, 'form-check-input');
      box.type = 'checkbox'; box.id = `instrument-${row.instrument_name}`; box.checked = true;
      box.addEventListener('change', renderRows);
      wrapper.append(box, element('span', row.instrument_label, 'form-check-label'));
      return wrapper;
    }));
  }
  function tickInstruments(checked) {
    for (const row of snapshot.instruments) $(`instrument-${row.instrument_name}`).checked = checked;
    renderRows();
  }
  function renderRows() {
    const instruments = chosenInstruments();
    const rows = dictionaryRows(snapshot, { instruments, hideFreeText: $('hide-free-text').checked, search: $('search').value, sort });
    $('empty').hidden = rows.length > 0;
    $('empty').textContent = instruments.length ? 'No fields match the search or filter.' : 'Select at least one instrument.';
    $('dictionary-rows').replaceChildren(...rows.map(row => {
      const tr = element('tr'), name = element('td'), instrument = element('td'), choices = element('td');
      name.append(element('code', row.name));
      instrument.append(element('div', row.instrumentLabel), element('div', row.instrument, 'text-secondary small'));
      for (const choice of row.choices) { const line = element('div'); line.append(element('code', choice.code), ` ${choice.label}`); choices.append(line); }
      if (row.checkbox) choices.append(element('div', 'One column per option in uploads', 'text-secondary small'));
      const range = row.min && row.max ? `${row.min} to ${row.max}` : row.min ? `min ${row.min}` : row.max ? `max ${row.max}` : '';
      tr.append(name, instrument, element('td', row.label), element('td', row.type), choices, element('td', row.required ? 'Yes' : ''), element('td', range));
      return tr;
    }));
  }
  function status(text, className = 'text-secondary small') {
    $('project-status').textContent = text;
    $('project-status').className = `mt-3 ${className}`;
  }
  // Project Info must pass the identity check before the remaining exports are requested.
  async function chooseProject() {
    if ($('project').value === demoId) return;
    const config = toolkit.projects().find(project => project.id === $('project').value), load = ++loads;
    loaded = JSON.stringify(config ?? null);
    snapshot = null; demo = false; toolkit.notice('');
    renderProjects();
    $('controls').hidden = true; $('dictionary-rows').replaceChildren(); status('');
    if (!config) return;
    if (!config.token) { toolkit.showProjects(); return status('Enter an API token for this project with Enter token in Projects. Tokens are required again after a page reload.', 'alert alert-warning mb-0'); }
    status('Checking project identity, then reading metadata…');
    try {
      const request = section => fetchExport(config, section, { proxy: toolkit.proxy(), allowed: toolkit.apiUrls });
      const project = await request('project');
      const issues = validateIdentity(config, project);
      if (issues.length) throw new Error(issues.join(' '));
      const [instruments, metadata] = await Promise.all(['instruments', 'metadata'].map(request));
      // A later project choice wins over a slower earlier one.
      if (load !== loads) return;
      snapshot = { project, instruments, metadata };
      renderInstruments(); renderRows();
      $('controls').hidden = false;
      status('Project identity verified · metadata read.', 'text-success small');
    } catch (error) {
      if (load === loads) status(`${error.message} No dictionary has been shown.`, 'alert alert-danger text-pre-wrap text-break mb-0');
    }
  }
  $('project').addEventListener('change', chooseProject);
  // The demo skips the identity check and every export.
  $('demo').addEventListener('click', () => {
    loads++; demo = true; snapshot = demoSnapshots().left;
    renderProjects(); $('project').value = demoId;
    renderInstruments(); renderRows(); $('controls').hidden = false;
    status(`${demoLabel} · synthetic data, no identity check.`);
    toolkit.notice('Demo data only. No connection to REDCap has been made.');
  });
  $('select-instruments').addEventListener('click', () => tickInstruments(true));
  $('clear-instruments').addEventListener('click', () => tickInstruments(false));
  // Each click moves a column through ascending, descending and back to Metadata order. Only the sorted column carries aria-sort.
  for (const column of sortColumns) $(`sort-${column}`).addEventListener('click', () => {
    sort = sort?.column !== column ? { column, direction: 'ascending' } : sort.direction === 'ascending' ? { column, direction: 'descending' } : null;
    for (const other of sortColumns) {
      const button = $(`sort-${other}`), direction = sort?.column === other ? sort.direction : '';
      button.className = `table-sort${{ ascending: ' asc', descending: ' desc' }[direction] ?? ''}`;
      if (direction) button.parentNode.setAttribute('aria-sort', direction); else button.parentNode.removeAttribute('aria-sort');
    }
    renderRows();
  });
  $('hide-free-text').addEventListener('change', renderRows);
  $('search').addEventListener('input', renderRows);
  // Reload when the chosen project's details or token change, for example once a missing token is entered. A removed project resets the Tool.
  toolkit.onProjectsChange(projects => {
    renderProjects();
    if (demo || !loaded || loaded === 'null') return;
    const config = projects.find(project => project.id === JSON.parse(loaded).id);
    if (JSON.stringify(config ?? null) !== loaded) return chooseProject();
  });
  renderProjects();
}

export default { id: 'dictionary', title: 'Data dictionary', mount };

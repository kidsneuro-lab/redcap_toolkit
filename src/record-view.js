import { recordBlocks } from './record.js';
import { fetchExport } from './api.js';
import { validateIdentity } from './identity.js';
import { projectName } from './projects.js';
import { demoSnapshots } from './demo.js';
import { element, option } from './dom.js';

// The demo project is offered in the Project select only while it is loaded. It is never added to the project list.
const demoId = 'demo', demoLabel = 'Example project DEV (demo, synthetic)';
// There is no form element, so the record ID can never be submitted into a URL, even if this script fails.
const template = `<div class="page-header mt-0 mb-4"><div class="row g-3 align-items-center"><div class="col"><div class="page-pretitle">REDCap record</div><h1 class="page-title">Record viewer</h1><p class="text-secondary mb-0 mt-1">See how one existing record was entered, across all instruments, so new data can follow the same conventions. REDCap logs each lookup.</p></div><div class="col-auto"><button id="record-demo" class="btn" type="button">Explore demo</button></div></div></div>
<section class="card" aria-label="Project and record"><div class="card-body">
  <div class="row g-3"><div class="col-md-6"><label class="form-label" for="record-project">Project</label><select id="record-project" class="form-select"><option value="">Select a project</option></select></div></div>
  <div id="record-project-status" class="mt-3" role="status"></div>
  <div id="record-controls" class="mt-3" hidden>
    <div class="row g-3 align-items-end mb-3"><div class="col-md-6"><label class="form-label" for="record-id">Record ID</label><div class="input-group"><input id="record-id" class="form-control" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore><button id="record-view" class="btn btn-primary" type="button">View record</button></div></div>
      <div class="col-md-6"><label class="form-check mb-1"><input id="record-hide-empty" class="form-check-input" type="checkbox" checked><span class="form-check-label">Hide empty fields</span></label><label class="form-check mb-2"><input id="record-show-identifiers" class="form-check-input" type="checkbox"><span class="form-check-label">Show identifiers</span></label></div></div>
    <p class="text-secondary small mb-0">Values are shown as the API exports them: raw codes with their labels, and dates as YYYY-MM-DD whatever the field's display format. API imports use this date format by default.</p>
    <div id="record-status" class="mt-3" role="status"></div>
    <div id="record-blocks"></div>
  </div>
</div></section>`;

const statusColours = { 0: 'red', 1: 'yellow', 2: 'green' };

function mount(container, toolkit) {
  container.innerHTML = template;
  // Every visited Tool stays mounted in one document, so this Tool's element ids carry a prefix that keeps them, and label targets, unique.
  const $ = id => container.querySelector(`#record-${id}`);
  // Record data is held only here, while it is shown. It is never written to storage, the URL or a download.
  let snapshot = null, config = null, rows = null, demo = false, loads = 0, lookups = 0, loaded = '';

  function renderProjects() {
    const current = $('project').value;
    $('project').replaceChildren(option('Select a project', ''));
    if (demo) $('project').append(option(demoLabel, demoId));
    for (const project of toolkit.projects()) $('project').append(option(projectName(project), project.id));
    $('project').value = current;
  }
  function status(id, text, className = 'text-secondary small') {
    $(id).textContent = text;
    $(id).className = `mt-3 ${className}`;
  }
  // Forgets the shown record and drops any lookup still in flight. Identifiers are hidden again for the next record.
  function clearRecord() {
    lookups++; rows = null;
    $('show-identifiers').checked = false;
    $('blocks').replaceChildren(); status('status', '');
  }
  function valueCell(field) {
    const cell = element('td', undefined, 'text-pre-wrap text-break');
    if (field.identifier) cell.append(element('span', 'Identifier', 'badge bg-orange-lt me-2'));
    if (field.absent) { cell.append(element('span', "Not exported with this token's rights", 'text-secondary')); return cell; }
    if (field.empty) { cell.append(element('span', 'Empty', 'text-secondary')); return cell; }
    // A masked value is never put in the page, so it cannot be copied or read by assistive technology.
    if (field.identifier && !$('show-identifiers').checked) { cell.append(element('span', '•••', 'text-secondary')); return cell; }
    for (const { value, label } of field.values) {
      const line = element('div');
      line.append(element('code', value));
      if (label) line.append(` ${label}`);
      cell.append(line);
    }
    if (field.validation) cell.append(element('div', field.validation, 'text-secondary small'));
    return cell;
  }
  function renderRecord() {
    if (!rows) return;
    let blocks;
    try { blocks = recordBlocks(snapshot, rows, { hideEmpty: $('hide-empty').checked }); } catch (error) {
      rows = null; $('blocks').replaceChildren();
      return status('status', `${error.message} No record has been shown.`, 'alert alert-danger text-pre-wrap text-break mb-0');
    }
    $('blocks').replaceChildren(...blocks.map(block => {
      const section = element('section', undefined, 'mt-4'), heading = element('h2', block.label, 'h3 mb-2');
      if (block.instance) heading.append(element('span', `Instance ${block.instance}`, 'badge bg-blue-lt ms-2'));
      if (block.status) heading.append(element('span', `${block.status.label} (${block.status.code})`, `badge bg-${statusColours[block.status.code] ?? 'secondary'}-lt ms-2`));
      section.append(heading);
      if (!block.fields.length) { section.append(element('p', 'No values in this instrument.', 'text-secondary small mb-0')); return section; }
      const table = element('table', undefined, 'table table-sm table-vcenter mb-0'), head = element('tr'), body = element('tbody'), thead = element('thead'), wrapper = element('div', undefined, 'table-responsive');
      for (const title of ['Variable', 'Field label', 'Value']) head.append(element('th', title));
      thead.append(head);
      body.append(...block.fields.map(field => {
        const tr = element('tr'), name = element('td');
        name.append(element('code', field.name));
        tr.append(name, element('td', field.label, 'text-pre-wrap text-break'), valueCell(field));
        return tr;
      }));
      table.append(thead, body); wrapper.append(table); section.append(wrapper);
      return section;
    }));
  }
  // Project Info must pass the identity check before the remaining exports are requested.
  async function chooseProject() {
    if ($('project').value === demoId) return;
    const chosen = toolkit.projects().find(project => project.id === $('project').value), load = ++loads;
    loaded = JSON.stringify(chosen ?? null);
    snapshot = null; config = null; demo = false; toolkit.notice('');
    renderProjects(); clearRecord(); $('id').value = '';
    $('controls').hidden = true; status('project-status', '');
    if (!chosen) return;
    if (!chosen.token) { toolkit.showProjects(); return status('project-status', 'Enter an API token for this project with Enter token in Projects. Tokens are required again after a page reload.', 'alert alert-warning mb-0'); }
    status('project-status', 'Checking project identity, then reading metadata…');
    try {
      const request = section => fetchExport(chosen, section, { proxy: toolkit.proxy(), allowed: toolkit.apiUrls });
      const project = await request('project');
      const issues = validateIdentity(chosen, project);
      if (issues.length) throw new Error(issues.join(' '));
      const [instruments, metadata, fieldNames] = await Promise.all(['instruments', 'metadata', 'fieldNames'].map(request));
      // A later project choice wins over a slower earlier one.
      if (load !== loads) return;
      snapshot = { project, instruments, metadata, fieldNames }; config = chosen;
      $('controls').hidden = false;
      status('project-status', 'Project identity verified · metadata read. Enter a record ID.', 'text-success small');
    } catch (error) {
      if (load === loads) status('project-status', `${error.message} No record can be viewed.`, 'alert alert-danger text-pre-wrap text-break mb-0');
    }
  }
  // Only the typed record ID is requested. The demo looks it up in its one synthetic record instead.
  async function viewRecord() {
    const id = $('id').value.trim();
    clearRecord();
    if (!snapshot) return;
    if (!id) return status('status', 'Enter a record ID.', 'alert alert-warning mb-0');
    const lookup = lookups;
    status('status', 'Reading the record…');
    try {
      const found = demo ? snapshot.record.filter(row => row[snapshot.metadata[0].field_name] === id) : await fetchExport(config, 'record', { record: id, proxy: toolkit.proxy(), allowed: toolkit.apiUrls });
      // A new lookup, project or leaving the Tool wins over a slower earlier lookup.
      if (lookup !== lookups) return;
      // REDCap returns nothing both for a record that does not exist and for one outside the token's Data Access Group.
      if (!found.length) return status('status', 'No record with this ID is available to this token.', 'alert alert-info mb-0');
      rows = found;
      status('status', `Record ${id} · read ${new Date().toLocaleString('en-AU')}.`, 'text-success small');
      renderRecord();
    } catch (error) {
      if (lookup === lookups) status('status', `${error.message} No record has been shown.`, 'alert alert-danger text-pre-wrap text-break mb-0');
    }
  }
  $('project').addEventListener('change', chooseProject);
  // The demo skips the identity check and every export, and shows its synthetic record straight away.
  $('demo').addEventListener('click', () => {
    loads++; demo = true; snapshot = demoSnapshots().left; config = null;
    renderProjects(); $('project').value = demoId;
    $('controls').hidden = false;
    status('project-status', `${demoLabel} · synthetic data, no identity check.`);
    toolkit.notice('Demo data only. No connection to REDCap has been made.');
    $('id').value = snapshot.record[0][snapshot.metadata[0].field_name];
    return viewRecord();
  });
  $('view').addEventListener('click', viewRecord);
  $('id').addEventListener('keydown', event => { if (event.key === 'Enter') return viewRecord(); });
  $('hide-empty').addEventListener('change', renderRecord);
  $('show-identifiers').addEventListener('change', renderRecord);
  // Reload when the chosen project's details or token change, for example once a missing token is entered. A removed project resets the Tool.
  toolkit.onProjectsChange(projects => {
    renderProjects();
    if (demo || !loaded || loaded === 'null') return;
    const chosen = projects.find(project => project.id === JSON.parse(loaded).id);
    if (JSON.stringify(chosen ?? null) !== loaded) return chooseProject();
  });
  renderProjects();
  // Leaving the Tool forgets the record and its ID. The project and its metadata stay loaded.
  return { leave() { clearRecord(); $('id').value = ''; } };
}

export default { id: 'record', title: 'Record viewer', mount };

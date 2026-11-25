import { templateColumns, templateCsv, templateFields } from './template.js';
import { fetchExport } from './api.js';
import { validateIdentity } from './identity.js';
import { demoSnapshots } from './demo.js';
import { download, element, option } from './dom.js';

// The demo project is offered in the Project select only while it is loaded. It is never added to the project list.
const demoId = 'demo', demoLabel = 'Example project DEV (demo, synthetic)';
const template = `<div class="page-header mt-0 mb-4"><div class="row g-3 align-items-center"><div class="col"><div class="page-pretitle">REDCap upload template</div><h1 class="page-title">Upload template</h1><p class="text-secondary mb-0 mt-1">Download a CSV header for importing data into one instrument. Nothing is sent to REDCap.</p></div><div class="col-auto"><button id="demo" class="btn" type="button">Explore demo</button></div></div></div>
<div class="row g-3">
  <div class="col-lg-8"><section class="card" aria-label="Project, instrument and fields"><div class="card-body">
    <div class="row g-3"><div class="col-md-6"><label class="form-label" for="project">Project</label><select id="project" class="form-select"><option value="">Select a project</option></select></div><div class="col-md-6"><label class="form-label" for="instrument">Instrument</label><select id="instrument" class="form-select" disabled><option value="">Select a project first</option></select></div></div>
    <div id="project-status" class="mt-3" role="status"></div>
    <div id="fields" class="mt-3" hidden>
      <div class="form-selectgroup mb-3" role="radiogroup" aria-label="Fields to include"><label class="form-selectgroup-item"><input id="mode-all" class="form-selectgroup-input" type="radio" name="template-mode" value="all" checked><span class="form-selectgroup-label">All importable fields</span></label><label class="form-selectgroup-item"><input id="mode-selected" class="form-selectgroup-input" type="radio" name="template-mode" value="selected"><span class="form-selectgroup-label">Selected fields</span></label></div>
      <div class="table-responsive"><table class="table table-sm table-vcenter mb-0"><thead><tr><th class="w-1"><span class="visually-hidden">Include</span></th><th>Field</th><th>Label</th><th>Type</th><th>Notes</th></tr></thead><tbody id="field-rows"></tbody></table></div>
    </div>
  </div></section></div>
  <div class="col-lg-4"><section class="card" aria-labelledby="preview-heading">
    <div class="card-header"><h2 id="preview-heading" class="card-title">CSV header preview</h2><div class="card-actions"><span id="column-count" class="badge bg-blue-lt"></span></div></div>
    <div class="card-body"><div id="preview" class="font-monospace text-break small mb-3"></div><div id="filename" class="text-secondary small mb-3 text-break"></div><button id="download" class="btn btn-primary w-100" type="button" disabled aria-describedby="download-hint">Download CSV</button><div id="download-hint" class="form-hint mt-2"></div></div>
  </section></div>
</div>`;

function mount(container, toolkit) {
  container.innerHTML = template;
  const $ = id => container.querySelector(`#${id}`);
  let snapshot = null, demo = false, instrument = '', mode = 'all', selected = new Set(), loads = 0, loaded = '';

  function renderProjects() {
    const current = $('project').value;
    $('project').replaceChildren(option('Select a project', ''));
    if (demo) $('project').append(option(demoLabel, demoId));
    for (const project of toolkit.projects()) $('project').append(option([project.label, ...project.tags].join(' · '), project.id));
    $('project').value = current;
  }
  const columns = () => snapshot && instrument ? templateColumns(snapshot, instrument, mode === 'all' ? undefined : [...selected]) : [];
  const filename = () => `${demo ? 'demo_' : ''}${instrument}_upload_template_${new Date().toLocaleDateString('en-CA')}.csv`;
  function renderPreview() {
    let names;
    try { names = columns(); } catch (error) { names = []; status(`${error.message} No template has been produced.`, 'alert alert-danger text-pre-wrap text-break mb-0'); }
    $('preview').textContent = names.join(',');
    $('column-count').textContent = names.length ? `${names.length} columns` : '';
    $('filename').textContent = names.length ? filename() : '';
    const empty = mode === 'selected' && !selected.size;
    $('download').disabled = !names.length || empty;
    $('download-hint').textContent = instrument && empty ? 'Select at least one field.' : '';
  }
  // A checkbox row. Fixed and excluded rows cannot be changed; in All mode every importable row is shown ticked.
  function fieldRow(name, label, type, notes, { fixed = false, reason = '', readonly = false } = {}) {
    const row = element('tr', undefined, fixed || reason ? 'text-secondary' : undefined), box = element('input', undefined, 'form-check-input');
    box.type = 'checkbox'; box.id = `pick-${name}`;
    box.checked = fixed || (!reason && (mode === 'all' || selected.has(name)));
    box.disabled = fixed || !!reason || mode === 'all';
    box.setAttribute('aria-label', fixed ? `${name} is always included` : reason ? `${name} is excluded` : `Include ${name}`);
    box.addEventListener('change', () => { if (box.checked) selected.add(name); else selected.delete(name); renderPreview(); });
    const cell = element('td'), nameCell = element('td');
    cell.append(box);
    nameCell.append(element(reason ? 's' : 'code', name));
    if (readonly) nameCell.append(element('span', '@READONLY', 'badge bg-yellow-lt ms-2'));
    row.append(cell, nameCell, element('td', label), element('td', type), element('td', reason || notes));
    return row;
  }
  function renderFields() {
    $('fields').hidden = !instrument;
    if (!instrument) return $('field-rows').replaceChildren();
    const recordId = snapshot.metadata[0].field_name, repeating = snapshot.repeating.some(row => row.form_name === instrument);
    $('field-rows').replaceChildren(
      fieldRow(recordId, snapshot.metadata[0].field_label, snapshot.metadata[0].field_type, 'Record ID, always first', { fixed: true }),
      ...(repeating ? [fieldRow('redcap_repeat_instrument', '', '', 'Repeating instrument column', { fixed: true }), fieldRow('redcap_repeat_instance', '', '', 'Repeating instrument column', { fixed: true })] : []),
      ...templateFields(snapshot, instrument).map(field => fieldRow(field.name, field.label, field.type, field.columns > 1 ? `${field.columns} columns` : '', { reason: field.excluded, readonly: field.readonly })),
      fieldRow(`${instrument}_complete`, 'Form status', '', '0 Incomplete, 1 Unverified, 2 Complete')
    );
  }
  function renderInstruments() {
    const forms = snapshot ? [...new Set(snapshot.metadata.map(row => row.form_name))] : [];
    $('instrument').replaceChildren(option(snapshot ? 'Select an instrument' : 'Select a project first', ''));
    for (const form of forms) $('instrument').append(option(snapshot.repeating.some(row => row.form_name === form) ? `${form} · repeating` : form, form));
    $('instrument').disabled = !snapshot;
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
    renderInstruments(); chooseInstrument(''); status('');
    if (!config) return;
    if (!config.token) { toolkit.showProjects(); return status('Enter an API token for this project with Enter token in Projects. Tokens are required again after a page reload.', 'alert alert-warning mb-0'); }
    status('Checking project identity, then reading metadata…');
    try {
      const request = section => fetchExport(config, section, { proxy: toolkit.proxy(), allowed: toolkit.apiUrls });
      const project = await request('project');
      const issues = validateIdentity(config, project);
      if (issues.length) throw new Error(issues.join(' '));
      const [metadata, repeating, fieldNames] = await Promise.all(['metadata', 'repeating', 'fieldNames'].map(request));
      // A later project choice wins over a slower earlier one.
      if (load !== loads) return;
      snapshot = { project, metadata, repeating, fieldNames };
      renderInstruments();
      status('Project identity verified · metadata read.', 'text-success small');
    } catch (error) {
      if (load === loads) status(`${error.message} No template has been produced.`, 'alert alert-danger text-pre-wrap text-break mb-0');
    }
  }
  $('project').addEventListener('change', chooseProject);
  // The demo skips the identity check and every export.
  $('demo').addEventListener('click', () => {
    loads++; demo = true; snapshot = demoSnapshots().left;
    renderProjects(); $('project').value = demoId;
    renderInstruments(); chooseInstrument('');
    status(`${demoLabel} · synthetic data, no identity check.`);
    toolkit.notice('Demo data only. No connection to REDCap has been made.');
  });
  // A new instrument or project starts again in All mode with nothing ticked.
  function chooseInstrument(name) {
    instrument = name; mode = 'all'; selected = new Set();
    $('mode-all').checked = true; $('mode-selected').checked = false;
    renderFields(); renderPreview();
  }
  $('instrument').addEventListener('change', () => chooseInstrument($('instrument').value));
  for (const id of ['mode-all', 'mode-selected']) $(id).addEventListener('change', () => { mode = $(id).value; renderFields(); renderPreview(); });
  $('download').addEventListener('click', () => download(new Blob([templateCsv(columns())], { type: 'text/csv' }), filename()));
  // Reload when the chosen project's details or token change, for example once a missing token is entered. A removed project resets the Tool.
  toolkit.onProjectsChange(projects => {
    renderProjects();
    if (demo || !loaded || loaded === 'null') return;
    const config = projects.find(project => project.id === JSON.parse(loaded).id);
    if (JSON.stringify(config ?? null) !== loaded) return chooseProject();
  });
  renderProjects();
}

export default { id: 'template', title: 'Upload template', mount };

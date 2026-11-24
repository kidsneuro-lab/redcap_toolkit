// PROTOTYPE, throwaway. Three Upload template selection flows in the variant A shell, switchable via ?variant=A|B|C.
// Synthetic projects and metadata only. Column rules follow "Upload template: column rules"; checkbox names stand in for exportFieldNames.
const variants = { A: 'Step-by-step wizard', B: 'One form with field table', C: 'Instrument cards with quick download' };
const params = new URLSearchParams(location.search);
let variant = variants[params.get('variant')] ? params.get('variant') : 'A';

const f = (field_name, form_name, field_label, field_type = 'text', extra = {}) => ({ field_name, form_name, field_label, field_type, field_annotation: '', select_choices_or_calculations: '', ...extra });
const metadata = [
  f('record_id', 'enrolment', 'Record ID'),
  f('enrol_intro', 'enrolment', 'Please complete at enrolment.', 'descriptive'),
  f('enrol_date', 'enrolment', 'Date of enrolment', 'text', { field_annotation: '@TODAY @READONLY' }),
  f('consent', 'enrolment', 'Consent obtained?', 'yesno'),
  f('symptoms', 'enrolment', 'Symptoms at enrolment', 'checkbox', { select_choices_or_calculations: '1, Fever | 2, Cough | -9, Unknown' }),
  f('consent_form', 'enrolment', 'Signed consent form', 'file'),
  f('age', 'enrolment', 'Age (years)', 'calc'),
  f('sample_id', 'sample', 'Sample ID'),
  f('collected', 'sample', 'Date collected'),
  f('rna_quality', 'sample', 'RNA quality score'),
  f('sample_label', 'sample', 'Sample label', 'text', { field_annotation: '@CALCTEXT(concat([sample_id], "-", [collected]))' })
];
const instruments = [{ name: 'enrolment', label: 'Enrolment' }, { name: 'sample', label: 'Sample collection' }];
const repeating = new Set(['sample']);
const projects = [
  { id: 'p1', label: 'Example project DEV', tags: ['DEV'], token: true },
  { id: 'p2', label: 'Example project PROD', tags: ['PROD'], token: false },
  { id: 'p3', label: 'Wrong title project', tags: ['TEST'], token: true, identityError: 'Project title mismatch. Expected "Wrong title project"; received "Something else".' }
];

// ---- shared column rules (as decided) ----
const exclusion = field => field.field_type === 'descriptive' ? 'Descriptive text, no data'
  : field.field_type === 'file' ? 'File upload, not importable'
  : field.field_type === 'calc' ? 'Calculated by REDCap'
  : /@CALCTEXT/.test(field.field_annotation) ? 'Calculated by REDCap (@CALCTEXT)' : '';
const exportNames = field => field.field_type !== 'checkbox' ? [field.field_name]
  : field.select_choices_or_calculations.split('|').map(choice => `${field.field_name}___${choice.split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
const instrumentFields = name => metadata.filter(field => field.form_name === name && field.field_name !== metadata[0].field_name);
function columns(s) {
  if (!s.instrument) return [];
  const fields = instrumentFields(s.instrument).filter(field => !exclusion(field) && (s.mode === 'all' || s.selected.has(field.field_name)));
  return [metadata[0].field_name, ...(repeating.has(s.instrument) ? ['redcap_repeat_instrument', 'redcap_repeat_instance'] : []), ...fields.flatMap(exportNames), ...(s.mode === 'all' || s.complete ? [`${s.instrument}_complete`] : [])];
}
const fileName = s => `${s.instrument}_upload_template_${new Date().toISOString().slice(0, 10)}.csv`;
function download(s) {
  const url = URL.createObjectURL(new Blob([columns(s).join(',') + '\r\n'], { type: 'text/csv' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName(s) });
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- state ----
const fresh = () => ({ project: '', status: 'idle', error: '', instrument: '', mode: 'all', selected: new Set(), complete: true, step: 1, expanded: '' });
let s = fresh();
function chooseProject(id) {
  s = { ...fresh(), project: id, step: s.step };
  const project = projects.find(p => p.id === id);
  if (!project) return render();
  if (!project.token) { s.status = 'token'; return render(); }
  s.status = 'loading'; render();
  setTimeout(() => {
    if (project.identityError) { s.status = 'error'; s.error = project.identityError; }
    else s.status = 'ready';
    render();
  }, 600);
}
function chooseInstrument(name) {
  s.instrument = name; s.mode = 'all'; s.complete = true;
  s.selected = new Set(instrumentFields(name).filter(field => !exclusion(field)).map(field => field.field_name));
}

// ---- shared pieces ----
const projectSelect = () => `<label class="form-label" for="project">Project</label><select id="project" class="form-select" data-change="project"><option value="">Select a project</option>${projects.map(p => `<option value="${p.id}" ${s.project === p.id ? 'selected' : ''}>${[p.label, ...p.tags].join(' · ')}</option>`).join('')}</select>`;
const projectStatus = () => ({
  idle: '',
  token: '<div class="alert alert-warning mt-3 mb-0">This project needs an API token. <a href="#" data-action="drawer">Open Projects</a> to enter it.</div>',
  loading: '<div class="d-flex align-items-center gap-2 mt-3 text-secondary"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Checking project identity, then reading metadata…</div>',
  error: `<div class="alert alert-danger mt-3 mb-0">${s.error} No template has been produced.</div>`,
  ready: '<div class="text-success small mt-2">Project identity verified · metadata read.</div>'
})[s.status];
const instrumentSelect = () => `<label class="form-label" for="instrument">Instrument</label><select id="instrument" class="form-select" data-change="instrument" ${s.status === 'ready' ? '' : 'disabled'}><option value="">${s.status === 'ready' ? 'Select an instrument' : 'Select a project first'}</option>${s.status === 'ready' ? instruments.map(i => `<option value="${i.name}" ${s.instrument === i.name ? 'selected' : ''}>${i.label} (${i.name})${repeating.has(i.name) ? ' · repeating' : ''}</option>`).join('') : ''}</select>`;
const modeRadios = () => `<div class="form-selectgroup"><label class="form-selectgroup-item"><input type="radio" name="mode" value="all" class="form-selectgroup-input" data-change="mode" ${s.mode === 'all' ? 'checked' : ''}><span class="form-selectgroup-label">All importable fields</span></label><label class="form-selectgroup-item"><input type="radio" name="mode" value="selected" class="form-selectgroup-input" data-change="mode" ${s.mode === 'selected' ? 'checked' : ''}><span class="form-selectgroup-label">Selected fields</span></label></div>`;
function fieldTable({ compact = false } = {}) {
  const selecting = s.mode === 'selected';
  const fixed = (name, note) => `<tr class="text-secondary"><td><input class="form-check-input" type="checkbox" checked disabled aria-label="${name} always included"></td><td><code>${name}</code></td>${compact ? '' : '<td></td>'}<td colspan="2">${note}</td></tr>`;
  const rows = instrumentFields(s.instrument).map(field => {
    const reason = exclusion(field), names = exportNames(field);
    const flag = /@READONLY/.test(field.field_annotation) ? ' <span class="badge bg-yellow-lt">@READONLY</span>' : '';
    if (reason) return `<tr class="text-secondary"><td><input class="form-check-input" type="checkbox" disabled aria-label="${field.field_name} excluded"></td><td><s>${field.field_name}</s></td>${compact ? '' : `<td>${field.field_label}</td>`}<td>${field.field_type}</td><td>${reason}</td></tr>`;
    return `<tr><td><input class="form-check-input" type="checkbox" data-change="field" value="${field.field_name}" ${!selecting || s.selected.has(field.field_name) ? 'checked' : ''} ${selecting ? '' : 'disabled'} aria-label="Include ${field.field_name}"></td><td><code>${field.field_name}</code>${flag}</td>${compact ? '' : `<td>${field.field_label}</td>`}<td>${field.field_type}</td><td>${names.length > 1 ? `${names.length} columns` : ''}</td></tr>`;
  }).join('');
  return `<div class="table-responsive"><table class="table table-sm table-vcenter mb-0"><thead><tr><th class="w-1"></th><th>Field</th>${compact ? '' : '<th>Label</th>'}<th>Type</th><th>Notes</th></tr></thead><tbody>
    ${fixed(metadata[0].field_name, 'Record ID, always first')}
    ${repeating.has(s.instrument) ? fixed('redcap_repeat_instrument, redcap_repeat_instance', 'Repeating instrument columns') : ''}
    ${rows}
    <tr><td><input class="form-check-input" type="checkbox" data-change="complete" ${s.mode === 'all' || s.complete ? 'checked' : ''} ${selecting ? '' : 'disabled'} aria-label="Include form status"></td><td><code>${s.instrument}_complete</code></td>${compact ? '' : '<td>Form status</td>'}<td colspan="2">0 Incomplete, 1 Unverified, 2 Complete</td></tr>
  </tbody></table></div>`;
}
const preview = () => {
  const cols = columns(s);
  return `<div class="card"><div class="card-header"><h3 class="card-title">CSV header preview</h3><span class="ms-auto badge bg-blue-lt">${cols.length} columns</span></div><div class="card-body">
    ${cols.length ? `<div class="d-flex flex-wrap gap-1 mb-3">${cols.map(c => `<code class="badge bg-secondary-lt">${c}</code>`).join('')}</div><div class="text-secondary small mb-3">${fileName(s)} · header row only · data rows are yours to fill</div>` : '<p class="text-secondary">Choose a project and instrument to see the columns.</p>'}
    <button class="btn btn-primary w-100" type="button" data-action="download" ${cols.length ? '' : 'disabled'}>Download CSV</button>
  </div></div>`;
};

// ---- Variant A: one decision per step ----
function variantA() {
  const steps = ['Project', 'Instrument', 'Fields', 'Download'];
  const canNext = s.step === 1 ? s.status === 'ready' : s.step === 2 ? !!s.instrument : true;
  const body = s.step === 1 ? `${projectSelect()}${projectStatus()}`
    : s.step === 2 ? instrumentSelect()
    : s.step === 3 ? `<div class="mb-3">${modeRadios()}</div>${fieldTable()}`
    : preview();
  return `<div class="card"><div class="card-body">
    <ol class="steps steps-counter mb-4">${steps.map((label, i) => `<li class="step-item ${s.step === i + 1 ? 'active' : ''}">${label}</li>`).join('')}</ol>
    ${body}
    <div class="d-flex justify-content-between mt-4"><button class="btn" type="button" data-action="back" ${s.step === 1 ? 'disabled' : ''}>Back</button>${s.step < 4 ? `<button class="btn btn-primary" type="button" data-action="next" ${canNext ? '' : 'disabled'}>Next</button>` : ''}</div>
  </div></div>`;
}

// ---- Variant B: everything on one form, preview alongside ----
function variantB() {
  return `<div class="row g-3">
    <div class="col-lg-8"><div class="card"><div class="card-body">
      <div class="row g-3 mb-3"><div class="col-md-6">${projectSelect()}</div><div class="col-md-6">${instrumentSelect()}</div></div>
      ${projectStatus()}
      ${s.instrument ? `<div class="my-3">${modeRadios()}</div>${fieldTable()}` : ''}
    </div></div></div>
    <div class="col-lg-4">${preview()}</div>
  </div>`;
}

// ---- Variant C: pick a project, then each instrument is a card with one-click "all" and optional column picking ----
function variantC() {
  const cards = s.status !== 'ready' ? '' : instruments.map(i => {
    const fields = instrumentFields(i.name), importable = fields.filter(field => !exclusion(field)).length;
    const open = s.expanded === i.name;
    return `<div class="col-md-6"><div class="card ${open ? 'border-primary' : ''}"><div class="card-body">
      <div class="d-flex align-items-start"><div><h3 class="card-title mb-1">${i.label}</h3><div class="text-secondary small"><code>${i.name}</code> · ${importable} importable of ${fields.length} fields</div></div>${repeating.has(i.name) ? '<span class="badge bg-purple-lt ms-auto">Repeating</span>' : ''}</div>
      <div class="d-flex gap-2 mt-3"><button class="btn btn-primary" type="button" data-action="quick" data-instrument="${i.name}">Download all columns</button><button class="btn" type="button" data-action="expand" data-instrument="${i.name}" aria-expanded="${open}">${open ? 'Hide fields' : 'Choose fields…'}</button></div>
    </div>${open ? `<div class="card-body border-top">${fieldTable({ compact: true })}</div><div class="card-footer">${preview()}</div>` : ''}</div></div>`;
  }).join('');
  return `<div class="card mb-3"><div class="card-body"><div class="row"><div class="col-md-6">${projectSelect()}</div></div>${projectStatus()}</div></div><div class="row g-3">${cards}</div>`;
}

// ---- shell (variant A from "Toolkit shell") ----
function render() {
  const tokens = projects.filter(p => p.token).length;
  document.getElementById('root').innerHTML = `<div class="page">
    <header class="navbar navbar-expand-md"><div class="container-xl">
      <a class="navbar-brand pe-md-3" href="#">REDCap Toolkit</a>
      <div class="navbar-nav flex-row order-md-last"><button class="btn" type="button" data-action="drawer">Projects <span class="badge bg-orange-lt ms-2">${tokens} of ${projects.length} tokens</span></button></div>
      <nav aria-label="Tools" class="navbar-collapse"><ul class="navbar-nav"><li class="nav-item"><a class="nav-link" href="#">Schema comparison</a></li><li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Upload template</a></li></ul></nav>
    </div></header>
    <div class="page-wrapper"><div class="page-header"><div class="container-xl"><div class="page-pretitle">REDCap Toolkit</div><h2 class="page-title">Upload template</h2><p class="text-secondary mb-0">Download a CSV header for importing data into one instrument. Nothing is sent to REDCap.</p></div></div>
    <div class="page-body"><div class="container-xl">${{ A: variantA, B: variantB, C: variantC }[variant]()}</div></div></div>
  </div>`;
  document.getElementById('proto-label').textContent = `${variant} (${variants[variant]})`;
}
function setVariant(step) {
  const keys = Object.keys(variants);
  variant = keys[(keys.indexOf(variant) + step + keys.length) % keys.length];
  s = fresh();
  history.replaceState(null, '', `?variant=${variant}`);
  render();
}
document.addEventListener('change', event => {
  const t = event.target, kind = t.dataset.change;
  if (kind === 'project') return chooseProject(t.value);
  if (kind === 'instrument') { if (t.value) chooseInstrument(t.value); else s.instrument = ''; }
  if (kind === 'mode') s.mode = t.value;
  if (kind === 'field') t.checked ? s.selected.add(t.value) : s.selected.delete(t.value);
  if (kind === 'complete') s.complete = t.checked;
  render();
});
document.addEventListener('click', event => {
  const t = event.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  if (action === 'drawer') { event.preventDefault(); alert('PROTOTYPE: opens the Projects drawer from the shell.'); return; }
  if (action === 'download') return download(s);
  if (action === 'next') s.step++;
  if (action === 'back') s.step--;
  if (action === 'quick') { chooseInstrument(t.dataset.instrument); download(s); }
  if (action === 'expand') { const name = t.dataset.instrument; if (s.expanded === name) s.expanded = ''; else { chooseInstrument(name); s.mode = 'selected'; s.expanded = name; } }
  render();
});
document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key === 'ArrowLeft') setVariant(-1);
  if (event.key === 'ArrowRight') setVariant(1);
});
document.getElementById('proto-prev').addEventListener('click', () => setVariant(-1));
document.getElementById('proto-next').addEventListener('click', () => setVariant(1));
render();

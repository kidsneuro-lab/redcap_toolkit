import { compareSnapshots, sections } from './compare.js';
import { validateIdentity, validatePair } from './identity.js';
import { projectName } from './projects.js';
import { fetchExport } from './api.js';
import { demoSnapshots } from './demo.js';
import { button, download, element, option } from './dom.js';
import { icon } from './icons.js';

const titles = { project: 'Project settings', instruments: 'Instruments', repeating: 'Repeating instruments', metadata: 'Field metadata' };
const statusLabels = { changed: 'Changed', unchanged: 'Unchanged', 'reference-only': 'Reference only', 'comparison-only': 'Comparison only' };
// Badge colours carry no clinical severity. They only tell presence and change apart.
const statusBadges = { changed: 'bg-yellow-lt', unchanged: 'bg-green-lt', 'reference-only': 'bg-yellow-lt', 'comparison-only': 'bg-blue-lt' };
const sensitiveProjectInfo = new Set(['project_grant_number', 'project_irb_number', 'project_notes', 'project_pi_email', 'project_pi_firstname', 'project_pi_lastname']);
const omittedValue = '[omitted from download]';

function omitProjectInfo(report) {
  const snapshots = Object.fromEntries(Object.entries(report.snapshots).map(([side, snapshot]) => [
    side,
    { ...snapshot, project: Object.fromEntries(Object.entries(snapshot.project).map(([key, value]) => [key, sensitiveProjectInfo.has(key) ? omittedValue : value])) }
  ]));
  const omittedProjectInfoProperties = [];
  const project = report.sections.project.map(row => {
    if (!sensitiveProjectInfo.has(row.id)) return row;
    omittedProjectInfoProperties.push(row.id);
    const left = snapshots.reference.project[row.id], right = snapshots.comparison.project[row.id];
    return { ...row, left, right, changes: row.changes.map(change => ({ ...change, left, right })) };
  });
  return { ...report, coverage: { ...report.coverage, omittedProjectInfoProperties }, snapshots, sections: { ...report.sections, project } };
}

const template = `<div class="page-header mt-0 mb-4 d-print-none"><div class="row g-3 align-items-center"><div class="col"><div class="page-pretitle">REDCap schema comparison</div><h1 class="page-title">Compare with confidence.</h1><p class="text-secondary mb-0 mt-1">Review project settings, instruments and field definitions side by side.</p></div><div class="col-auto"><button id="compare-demo" class="btn" type="button">Explore demo</button></div></div></div>
<section class="card mb-4 d-print-none" aria-labelledby="compare-comparison-heading">
  <div class="card-header"><h2 id="compare-comparison-heading" class="card-title">Choose your projects</h2><div class="card-actions"><button id="compare-manage" class="btn btn-link" type="button" aria-haspopup="dialog">Manage projects <span id="compare-project-count" class="ms-1"></span></button></div></div>
  <div class="card-body"><div class="row g-3 align-items-center"><div class="col-md"><label class="form-label" for="compare-reference">Reference project</label><select id="compare-reference" class="form-select"><option value="">Select a project</option></select><div class="form-hint">Values appear on the left.</div></div><div class="col-md-auto d-none d-md-block text-secondary" aria-hidden="true">vs</div><div class="col-md"><label class="form-label" for="compare-comparison">Comparison project</label><select id="compare-comparison" class="form-select"><option value="">Select a project</option></select><div class="form-hint">Values appear on the right.</div></div></div></div>
  <div class="card-footer text-end"><button id="compare-compare" class="btn btn-primary" type="button">Compare projects</button></div>
</section>
<section id="compare-status-panel" class="card mb-4 d-print-none" aria-label="Comparison progress" hidden><div class="card-header"><h2 id="compare-status-title" class="card-title">Fetching schema</h2><div class="card-actions"><button id="compare-cancel-compare" class="btn" type="button">Cancel comparison</button></div></div><div id="compare-progress" class="card-body row g-3"></div></section>
<section id="compare-empty-state" class="empty"><div class="empty-icon">${icon('arrows-diff')}</div><h2 class="empty-title">Your schema review starts here</h2><p class="empty-subtitle text-secondary">Add your projects, then run a comparison.<br>Or explore the demo to see how differences are reported.</p><div class="empty-action"><button id="compare-empty-add" class="btn btn-primary" type="button">Set up projects</button></div></section>
<section id="compare-report" aria-labelledby="compare-report-heading" hidden>
  <div class="row g-3 align-items-center mb-3"><div class="col"><div id="compare-report-kind" class="page-pretitle">Comparison report</div><h2 id="compare-report-heading" class="h1 mb-1">Schema comparison</h2><div id="compare-report-context" class="text-secondary"></div></div><div class="col-auto d-print-none">
    <label class="form-check"><input id="compare-include-sensitive-project-info" class="form-check-input" type="checkbox"><span class="form-check-label">Include sensitive Project Info values in download</span></label>
    <button id="compare-download" class="btn" type="button">${icon('download', 'me-1')}Download report</button>
  </div></div>
  <div id="compare-identities" class="row g-3"></div>
  <p class="text-secondary small my-3">Coverage: project information, instrument definitions, repeating configuration and field metadata. Survey setup is not checked. Review against your change specification is manual. Exports are retrieved separately and are not an atomic snapshot.</p>
  <div id="compare-summary" class="row g-3"></div>
  <div class="row g-3 align-items-end my-3 d-print-none"><div class="col-md"><label class="form-label" for="compare-search">Search report</label><input id="compare-search" class="form-control" type="search" placeholder="Field, property or value"></div><div class="col-md-4 col-lg-3"><label class="form-label" for="compare-instrument-filter">Instrument</label><select id="compare-instrument-filter" class="form-select"><option value="">All instruments</option></select></div><div class="col-md-auto"><label class="form-check mb-2"><input id="compare-differences-only" class="form-check-input" type="checkbox" checked><span class="form-check-label">Differences only</span></label></div></div>
  <div class="card">
    <div class="card-header d-print-none"><div id="compare-tabs" class="nav nav-tabs card-header-tabs" role="tablist" aria-label="Report sections"></div></div>
    <div id="compare-results" class="card-body" role="tabpanel" tabindex="0"></div>
  </div>
</section>`;

function mount(container, toolkit) {
  container.innerHTML = template;
  // Every visited Tool stays mounted in one document, so this Tool's element ids carry a prefix that keeps them, and label targets, unique.
  const $ = id => container.querySelector(`#compare-${id}`);
  const notice = toolkit.notice;
  let report = null, activeSection = 'project', controller = null;

  function invalidate() {
    report = null;
    $('report').hidden = true;
    $('empty-state').hidden = false;
  }
  function renderProjects(projects) {
    $('project-count').textContent = `(${projects.length})`;
    for (const id of ['reference', 'comparison']) {
      const select = $(id), selected = select.value;
      select.replaceChildren(option('Select a project', ''));
      for (const project of projects) select.append(option(projectName(project), project.id));
      select.value = projects.some(project => project.id === selected) ? selected : '';
    }
  }
  $('manage').addEventListener('click', () => toolkit.showProjects());
  $('empty-add').addEventListener('click', () => toolkit.showProjects(true, { addIfEmpty: true }));
  for (const id of ['reference', 'comparison']) $(id).addEventListener('change', () => { invalidate(); notice(''); });
  toolkit.onProjectsChange(projects => { invalidate(); renderProjects(projects); });

  function setBusy(busy) {
    for (const id of ['compare', 'demo', 'reference', 'comparison', 'manage', 'empty-add']) $(id).disabled = busy;
    toolkit.setBusy(busy);
    $('status-panel').hidden = !busy;
    $('compare').textContent = busy ? 'Comparing…' : 'Compare projects';
  }

  async function runComparison() {
    if (controller) return;
    const selected = [$('reference').value, $('comparison').value].map(id => toolkit.projects().find(project => project.id === id));
    if (selected.some(project => !project)) return notice('Select a reference project and a comparison project.', true);
    if (selected[0].id === selected[1].id) return notice('Select two distinct projects.', true);
    if (selected.some(project => !project.token)) { toolkit.showProjects(); return notice('Enter an API token for each selected project with Enter token in Projects. Tokens are required again after a page reload.', true); }
    invalidate(); notice('');
    const configs = selected.map(project => ({ ...project }));
    controller = new AbortController();
    const signal = controller.signal, startedAt = new Date().toISOString();
    const timeout = setTimeout(() => controller?.abort(new Error('Comparison timed out after 90 seconds. Check connectivity and try again.')), 90000);
    const progressNodes = configs.map(config => {
      const node = element('div', undefined, 'col-md-6');
      node.append(element('strong', config.title));
      const progress = element('p', 'Project Info: checking identity…', 'text-secondary mb-0');
      progress.setAttribute('aria-live', 'polite'); node.append(progress); return { node, progress };
    });
    $('progress').replaceChildren(...progressNodes.map(item => item.node));
    setBusy(true);
    try {
      const snapshots = [{}, {}], timings = [{}, {}];
      const request = async (i, section) => {
        const value = await fetchExport(configs[i], section, { signal, proxy: toolkit.proxy(), allowed: toolkit.apiUrls });
        timings[i][section] = new Date().toISOString(); return value;
      };
      const infoResults = await Promise.allSettled(configs.map((_, i) => request(i, 'project')));
      const failures = [];
      for (const [i, result] of infoResults.entries()) {
        if (result.status === 'rejected') { failures.push(`${configs[i].title}: ${result.reason.message}`); continue; }
        snapshots[i].project = result.value;
        const issues = validateIdentity(configs[i], result.value);
        if (issues.length) failures.push(`${configs[i].title}: ${issues.join(' ')}`);
        else progressNodes[i].progress.textContent = 'Project identity verified.';
      }
      if (failures.length) throw new Error(failures.join('\n'));
      validatePair(configs[0], snapshots[0].project, configs[1], snapshots[1].project);
      const tasks = configs.flatMap((_, i) => ['instruments', 'repeating', 'metadata'].map(section => ({ i, section })));
      const completed = [0, 0];
      const responses = await Promise.allSettled(tasks.map(async ({ i, section }) => {
        const value = await request(i, section);
        progressNodes[i].progress.textContent = `Identity verified · ${++completed[i]} of 3 schema exports received.`;
        return value;
      }));
      for (const [index, result] of responses.entries()) {
        const { i, section } = tasks[index];
        if (result.status === 'fulfilled') snapshots[i][section] = result.value;
        else failures.push(`${configs[i].title} / ${titles[section]}: ${result.reason.message}`);
      }
      if (signal.aborted) throw signal.reason;
      if (failures.length) throw new Error(`Comparison incomplete. No match result has been produced.\n${failures.join('\n')}`);
      displayReport(snapshots[0], snapshots[1], configs, { startedAt, completedAt: new Date().toISOString(), exportsRetrievedAt: timings, demo: false });
    } catch (error) {
      notice(signal.aborted ? signal.reason?.message || 'Comparison cancelled.' : error.message, true);
    } finally { clearTimeout(timeout); controller = null; setBusy(false); }
  }
  $('compare').addEventListener('click', runComparison);
  $('cancel-compare').addEventListener('click', () => controller?.abort(new Error('Comparison cancelled. No match result has been produced.')));

  function displayReport(left, right, configs, provenance) {
    const comparison = compareSnapshots(left, right);
    // Explicitly select safe configuration fields. Never copy the token into the report.
    report = { version: 1, ...provenance, coverage: { classicProjectsOnly: true, surveySetup: false, specificationCheck: 'manual', atomicSnapshot: false, omittedProjectInfoProperties: [] }, projects: configs.map((config, i) => ({ title: config.title, tags: [...config.tags], apiUrl: config.apiUrl, projectId: [left, right][i].project.project_id, validation: provenance.demo ? 'demo data' : 'project ID verified' })), snapshots: { reference: left, comparison: right }, ...comparison };
    $('include-sensitive-project-info').checked = false;
    $('empty-state').hidden = true; $('report').hidden = false;
    $('report-kind').textContent = provenance.demo ? 'Demo report · synthetic data' : 'Comparison report';
    $('report-heading').textContent = 'Schema comparison';
    $('report-context').textContent = `${configs[0].title} compared with ${configs[1].title} · ${new Date(provenance.completedAt).toLocaleString('en-AU')}`;
    $('identities').replaceChildren(...report.projects.map((project, i) => {
      const column = element('div', undefined, 'col-md-6'), card = element('div', undefined, 'card card-body h-100 text-break');
      card.append(element('span', [i ? 'Comparison' : 'Reference', ...project.tags].join(' · '), 'badge bg-azure-lt align-self-start mb-2'), element('strong', project.title), element('div', `Project ID ${project.projectId} · ${project.validation}`, 'text-secondary small'));
      column.append(card); return column;
    }));
    const forms = [...new Set([...left.instruments, ...right.instruments].map(row => row.instrument_name))].sort();
    $('instrument-filter').replaceChildren(option('All instruments', ''));
    forms.forEach(form => $('instrument-filter').append(option(form, form)));
    $('search').value = ''; $('differences-only').checked = true;
    activeSection = 'project'; renderReport();
    const unexpected = projectUnexpectedCount();
    const schemaChanges = ['instruments', 'repeating', 'metadata'].some(section => report.counts[section].entities);
    notice(provenance.demo ? 'Demo data only. No connection to REDCap has been made.' : schemaChanges || unexpected ? 'Comparison complete. Differences are available for review.' : 'No unexpected differences found in the exported settings. Survey setup and specification compliance have not been checked.');
  }
  function projectUnexpectedCount() { return report.sections.project.filter(row => row.status !== 'unchanged' && !row.expected).length; }
  function setSection(section, focus = false) { activeSection = section; renderReport(); if (focus) $(`tab-${section}`).focus(); }
  function renderReport() {
    if (!report) return;
    $('summary').replaceChildren(...sections.map(section => {
      const count = report.counts[section];
      const column = element('div', undefined, 'col-6 col-lg-3'), card = button('', () => setSection(section), `card card-body card-link h-100 w-100 text-start${activeSection === section ? ' card-active' : ''}`);
      card.append(element('div', titles[section], 'subheader'), element('div', String(count.entities), 'h1 my-2'), element('div', section === 'project' ? `${projectUnexpectedCount()} unexpected · ${count.entities - projectUnexpectedCount()} expected` : `changed or unmatched · ${count.properties} changed properties`, 'text-secondary small'));
      column.append(card); return column;
    }));
    $('tabs').replaceChildren(...sections.map((section, index) => {
      const tab = button(titles[section], () => setSection(section), `nav-link${activeSection === section ? ' active' : ''}`);
      tab.id = `compare-tab-${section}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(activeSection === section)); tab.setAttribute('aria-controls', 'compare-results'); tab.tabIndex = activeSection === section ? 0 : -1;
      tab.addEventListener('keydown', event => {
        const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (direction || ['Home', 'End'].includes(event.key)) { event.preventDefault(); setSection(sections[event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : (index + direction + sections.length) % sections.length], true); }
      });
      return tab;
    }));
    $('results').setAttribute('aria-labelledby', `compare-tab-${activeSection}`);
    renderRows();
  }
  function formatValue(value, present = true) {
    if (!present) return 'Not present';
    if (value === '') return '"" (empty string)';
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }
  function valueNode(value, present) {
    if (!present) return element('span', 'Not present', 'text-secondary fst-italic');
    const text = formatValue(value), pre = element('div', text, 'font-monospace text-pre-wrap text-break');
    if (text.length > 400) { const details = element('details'); details.append(element('summary', `Expand value (${text.length} characters)`, 'small text-primary'), pre); return details; }
    return pre;
  }
  function rowMatchesInstrument(row, form) {
    if (!form || activeSection === 'project') return true;
    return activeSection === 'metadata' ? row.left?.form_name === form || row.right?.form_name === form : row.instrument === form;
  }
  function renderRows() {
    if (!report) return;
    const query = $('search').value.toLowerCase(), form = $('instrument-filter').value, differencesOnly = $('differences-only').checked;
    $('instrument-filter').disabled = activeSection === 'project';
    const rows = report.sections[activeSection].filter(row => (!differencesOnly || row.status !== 'unchanged') && rowMatchesInstrument(row, form) && (!query || JSON.stringify(row).toLowerCase().includes(query)));
    const note = activeSection === 'project' ? 'Expected differences remain visible. Other changed properties require review; the app does not assign clinical severity.' : activeSection === 'instruments' ? 'Instrument status includes changes to its fields. Field counts may overlap when a field moves between instruments.' : activeSection === 'metadata' ? 'Reference only and comparison only describe presence, not the history of an addition or deletion. Order positions are among shared fields within the same instrument.' : 'Repeating instruments are matched by form name. An empty successful export means none are configured.';
    $('results').replaceChildren(element('p', `${rows.length} of ${report.sections[activeSection].length} entries shown. ${note}`, 'text-secondary small'));
    if (!rows.length) { $('results').append(element('p', 'No entries match the current filters.', 'text-secondary mb-0')); return; }
    for (const row of rows) {
      const details = element('details', undefined, 'card mb-2');
      const summary = element('summary', undefined, 'card-body py-2');
      summary.append(element('span', row.id, 'font-monospace fw-bold text-break me-2'), element('span', statusLabels[row.status], `badge ${statusBadges[row.status]} me-2`));
      if (row.expected && row.status !== 'unchanged') summary.append(element('span', 'Expected difference', 'badge bg-secondary-lt me-2'));
      summary.append(element('span', activeSection === 'instruments' ? `${row.fieldChanges} changed or unmatched fields` : `${row.changes.length} changed properties`, 'text-secondary small'));
      const table = element('table', undefined, 'table table-sm card-table'), head = element('thead'), heading = element('tr');
      for (const text of ['Property', `Reference · ${report.projects[0].title}`, `Comparison · ${report.projects[1].title}`]) { const th = element('th', text, `text-wrap${text === 'Property' ? ' w-25' : ''}`); th.scope = 'col'; heading.append(th); }
      head.append(heading); table.append(head);
      const body = element('tbody');
      let values = row.changes;
      if (!values.length) {
        if (activeSection === 'project') values = [{ property: row.id, left: row.left, right: row.right, leftPresent: Object.hasOwn(report.snapshots.reference.project, row.id), rightPresent: Object.hasOwn(report.snapshots.comparison.project, row.id) }];
        else values = [...new Set([...Object.keys(row.left || {}), ...Object.keys(row.right || {})])].map(property => ({ property, left: row.left?.[property], right: row.right?.[property], leftPresent: !!row.left && Object.hasOwn(row.left, property), rightPresent: !!row.right && Object.hasOwn(row.right, property) }));
      }
      for (const change of values) {
        const tr = element('tr'), key = element('th', change.property, 'text-break'); key.scope = 'row'; tr.append(key);
        for (const side of ['left', 'right']) { const td = element('td', undefined, 'text-break'); td.append(valueNode(change[side], change[`${side}Present`])); tr.append(td); }
        body.append(tr);
      }
      table.append(body); const scroll = element('div', undefined, 'table-responsive border-top'); scroll.append(table); details.append(summary, scroll); $('results').append(details);
    }
  }
  for (const id of ['search', 'instrument-filter', 'differences-only']) $(id).addEventListener(id === 'search' ? 'input' : 'change', renderRows);
  $('demo').addEventListener('click', () => {
    const { left, right } = demoSnapshots();
    const configs = [left, right].map((snapshot, i) => ({ title: snapshot.project.project_title, projectId: String(snapshot.project.project_id), tags: [i ? 'PROD' : 'DEV'], apiUrl: 'https://demo.invalid/api/' }));
    const now = new Date().toISOString();
    displayReport(left, right, configs, { demo: true, startedAt: now, completedAt: now });
  });
  $('download').addEventListener('click', () => {
    if (!report) return;
    const downloadReport = $('include-sensitive-project-info').checked ? report : omitProjectInfo(report);
    download(new Blob([JSON.stringify(downloadReport, null, 2)], { type: 'application/json' }), `redcap-comparison-${report.demo ? 'demo-' : ''}${report.completedAt.replace(/[:.]/g, '-')}.json`);
  });

  renderProjects(toolkit.projects());
}

export default { id: 'compare', title: 'Schema comparison', mount };

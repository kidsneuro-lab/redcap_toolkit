import { compareSnapshots, sections } from './compare.js';
import { validateIdentity, validatePair } from './identity.js';
import { fetchExport } from './api.js';
import { demoSnapshots } from './demo.js';
import { button, download, element, option } from './dom.js';

const titles = { project: 'Project settings', instruments: 'Instruments', repeating: 'Repeating instruments', metadata: 'Field metadata' };
const statusLabels = { changed: 'Changed', unchanged: 'Unchanged', 'reference-only': 'Reference only', 'comparison-only': 'Comparison only' };
// projects-slot and notice-slot keep toolkit-level parts in their current place on the page until the Projects drawer replaces them.
const template = `<div class="page-heading"><div><p class="eyebrow">REDCap schema comparison</p><h1>Compare with confidence.</h1><p class="lede">Review project settings, instruments and field definitions side by side.</p></div><button id="demo" class="secondary">Explore demo</button></div>
<section class="panel comparison-panel" aria-labelledby="comparison-heading">
  <div class="section-heading"><h2 id="comparison-heading">Choose your projects</h2><button id="manage" class="text-button" aria-expanded="false" aria-controls="configuration">Manage projects <span id="project-count"></span></button></div>
  <div class="selection-grid"><div><label for="reference">Reference project</label><select id="reference"><option value="">Select a project</option></select><p class="hint">Values appear on the left.</p></div><span class="versus" aria-hidden="true">vs</span><div><label for="comparison">Comparison project</label><select id="comparison"><option value="">Select a project</option></select><p class="hint">Values appear on the right.</p></div><button id="compare" class="primary">Compare projects</button></div>
  <div class="connection-row"><label class="checkbox-label"><input id="proxy" type="checkbox"> Use local proxy</label><span class="hint">For installations that block direct browser API access. Configure allowed API URLs on the local server first.</span></div>
</section>
<div id="projects-slot"></div>
<section id="status-panel" class="panel" aria-label="Comparison progress" hidden><div class="section-heading"><h2 id="status-title">Fetching schema</h2><button id="cancel-compare" class="secondary">Cancel comparison</button></div><div id="progress" class="progress-grid"></div></section>
<div id="notice-slot"></div>
<section id="empty-state" class="empty-state"><div class="empty-symbol" aria-hidden="true">≍</div><h2>Your schema review starts here</h2><p>Add your projects, then run a comparison.<br>Or explore the demo to see how differences are reported.</p><button id="empty-add" class="secondary">Set up projects</button></section>
<section id="report" aria-labelledby="report-heading" hidden>
  <div class="report-heading"><div><p id="report-kind" class="eyebrow">Comparison report</p><h2 id="report-heading">Schema comparison</h2><p id="report-context" class="hint"></p></div><button id="download" class="secondary">Download report</button></div>
  <div id="identities" class="identity-grid"></div>
  <p class="coverage">Coverage: project information, instrument definitions, repeating configuration and field metadata. Survey setup is not checked. Review against your change specification is manual. Exports are retrieved separately and are not an atomic snapshot.</p>
  <div id="summary" class="summary-grid"></div>
  <div class="report-controls"><div><label for="search">Search report</label><input id="search" type="search" placeholder="Field, property or value"></div><div><label for="instrument-filter">Instrument</label><select id="instrument-filter"><option value="">All instruments</option></select></div><label class="checkbox-label"><input id="differences-only" type="checkbox" checked> Differences only</label></div>
  <div id="tabs" class="tabs" role="tablist" aria-label="Report sections"></div>
  <div id="results" class="panel results-panel" role="tabpanel" tabindex="0"></div>
</section>`;

function mount(container, toolkit) {
  container.innerHTML = template;
  const $ = id => container.querySelector(`#${id}`);
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
      for (const project of projects) select.append(option([project.label, ...project.tags].join(' · '), project.id));
      select.value = projects.some(project => project.id === selected) ? selected : '';
    }
  }
  function showProjects(open = true, options) {
    toolkit.showProjects(open, options);
    $('manage').setAttribute('aria-expanded', String(open));
  }
  $('manage').addEventListener('click', () => showProjects($('manage').getAttribute('aria-expanded') !== 'true'));
  $('empty-add').addEventListener('click', () => showProjects(true, { addIfEmpty: true }));
  for (const id of ['reference', 'comparison', 'proxy']) $(id).addEventListener('change', () => { invalidate(); notice(''); });
  toolkit.onProjectsChange(projects => { invalidate(); renderProjects(projects); });

  function setBusy(busy) {
    for (const id of ['compare', 'demo', 'reference', 'comparison', 'proxy', 'manage', 'empty-add']) $(id).disabled = busy;
    toolkit.setBusy(busy);
    $('status-panel').hidden = !busy;
    $('compare').textContent = busy ? 'Comparing…' : 'Compare projects';
  }

  async function runComparison() {
    if (controller) return;
    const selected = [$('reference').value, $('comparison').value].map(id => toolkit.projects().find(project => project.id === id));
    if (selected.some(project => !project)) return notice('Select a reference project and a comparison project.', true);
    if (selected[0].id === selected[1].id) return notice('Select two distinct projects.', true);
    if (selected.some(project => !project.token)) { showProjects(); return notice('Enter an API token for each selected project using Edit. Tokens are required again after a page reload.', true); }
    invalidate(); notice('');
    const configs = selected.map(project => ({ ...project }));
    controller = new AbortController();
    const signal = controller.signal, startedAt = new Date().toISOString();
    const timeout = setTimeout(() => controller?.abort(new Error('Comparison timed out after 90 seconds. Check connectivity and try again.')), 90000);
    const progressNodes = configs.map(config => {
      const node = element('div', undefined, 'progress-project');
      node.append(element('strong', config.label));
      const progress = element('p', 'Project Info: checking identity…');
      progress.setAttribute('aria-live', 'polite'); node.append(progress); return { node, progress };
    });
    $('progress').replaceChildren(...progressNodes.map(item => item.node));
    setBusy(true);
    try {
      const snapshots = [{}, {}], timings = [{}, {}];
      const request = async (i, section) => {
        const value = await fetchExport(configs[i], section, { signal, proxy: $('proxy').checked });
        timings[i][section] = new Date().toISOString(); return value;
      };
      const infoResults = await Promise.allSettled(configs.map((_, i) => request(i, 'project')));
      const failures = [];
      for (const [i, result] of infoResults.entries()) {
        if (result.status === 'rejected') { failures.push(`${configs[i].label}: ${result.reason.message}`); continue; }
        snapshots[i].project = result.value;
        const issues = validateIdentity(configs[i], result.value);
        if (issues.length) failures.push(`${configs[i].label}: ${issues.join(' ')}`);
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
        else failures.push(`${configs[i].label} / ${titles[section]}: ${result.reason.message}`);
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
    report = { version: 1, ...provenance, coverage: { classicProjectsOnly: true, surveySetup: false, specificationCheck: 'manual', atomicSnapshot: false }, projects: configs.map((config, i) => ({ label: config.label, expectedTitle: config.expectedTitle, tags: [...config.tags], apiUrl: config.apiUrl, projectId: [left, right][i].project.project_id, validation: provenance.demo ? 'demo data' : 'title verified' })), snapshots: { reference: left, comparison: right }, ...comparison };
    $('empty-state').hidden = true; $('report').hidden = false;
    $('report-kind').textContent = provenance.demo ? 'Demo report · synthetic data' : 'Comparison report';
    $('report-heading').textContent = 'Schema comparison';
    $('report-context').textContent = `${configs[0].label} compared with ${configs[1].label} · ${new Date(provenance.completedAt).toLocaleString('en-AU')}`;
    $('identities').replaceChildren(...report.projects.map((project, i) => {
      const card = element('div', undefined, 'identity');
      card.append(element('span', [i ? 'Comparison' : 'Reference', ...project.tags].join(' · '), 'badge'), element('strong', project.label), element('p', `Project ID ${project.projectId} · ${project.validation}`, 'hint'));
      return card;
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
      const card = button('', () => setSection(section), `summary-card${activeSection === section ? ' active' : ''}`);
      card.append(element('span', titles[section]), element('strong', String(count.entities)), element('span', section === 'project' ? `${projectUnexpectedCount()} unexpected · ${count.entities - projectUnexpectedCount()} expected` : `changed or unmatched · ${count.properties} changed properties`));
      return card;
    }));
    $('tabs').replaceChildren(...sections.map((section, index) => {
      const tab = button(titles[section], () => setSection(section));
      tab.id = `tab-${section}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(activeSection === section)); tab.setAttribute('aria-controls', 'results'); tab.tabIndex = activeSection === section ? 0 : -1;
      tab.addEventListener('keydown', event => {
        const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (direction || ['Home', 'End'].includes(event.key)) { event.preventDefault(); setSection(sections[event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : (index + direction + sections.length) % sections.length], true); }
      });
      return tab;
    }));
    $('results').setAttribute('aria-labelledby', `tab-${activeSection}`);
    renderRows();
  }
  function formatValue(value, present = true) {
    if (!present) return 'Not present';
    if (value === '') return '"" (empty string)';
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }
  function valueNode(value, present) {
    if (!present) return element('span', 'Not present', 'missing');
    const text = formatValue(value), pre = element('pre', text);
    if (text.length > 400) { const details = element('details', undefined, 'value-details'); details.append(element('summary', `Expand value (${text.length} characters)`), pre); return details; }
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
    $('results').replaceChildren(element('p', `${rows.length} of ${report.sections[activeSection].length} entries shown. ${note}`, 'result-note'));
    if (!rows.length) { $('results').append(element('p', 'No entries match the current filters.', 'hint')); return; }
    for (const row of rows) {
      const details = element('details', undefined, 'result-row');
      const summary = element('summary');
      summary.append(element('span', row.id, 'entity-id'), element('span', statusLabels[row.status], `badge ${row.status}`));
      if (row.expected && row.status !== 'unchanged') summary.append(element('span', 'Expected difference', 'badge expected'));
      summary.append(element('span', activeSection === 'instruments' ? `${row.fieldChanges} changed or unmatched fields` : `${row.changes.length} changed properties`, 'row-description'));
      const table = element('table'), head = element('thead'), heading = element('tr');
      for (const text of ['Property', `Reference · ${report.projects[0].label}`, `Comparison · ${report.projects[1].label}`]) { const th = element('th', text); th.scope = 'col'; heading.append(th); }
      head.append(heading); table.append(head);
      const body = element('tbody');
      let values = row.changes;
      if (!values.length) {
        if (activeSection === 'project') values = [{ property: row.id, left: row.left, right: row.right, leftPresent: Object.hasOwn(report.snapshots.reference.project, row.id), rightPresent: Object.hasOwn(report.snapshots.comparison.project, row.id) }];
        else values = [...new Set([...Object.keys(row.left || {}), ...Object.keys(row.right || {})])].map(property => ({ property, left: row.left?.[property], right: row.right?.[property], leftPresent: !!row.left && Object.hasOwn(row.left, property), rightPresent: !!row.right && Object.hasOwn(row.right, property) }));
      }
      for (const change of values) {
        const tr = element('tr'), key = element('th', change.property); key.scope = 'row'; tr.append(key);
        for (const side of ['left', 'right']) { const td = element('td'); td.append(valueNode(change[side], change[`${side}Present`])); tr.append(td); }
        body.append(tr);
      }
      table.append(body); const scroll = element('div', undefined, 'table-scroll'); scroll.append(table); details.append(summary, scroll); $('results').append(details);
    }
  }
  for (const id of ['search', 'instrument-filter', 'differences-only']) $(id).addEventListener(id === 'search' ? 'input' : 'change', renderRows);
  $('demo').addEventListener('click', () => {
    const { left, right } = demoSnapshots();
    const configs = [left, right].map((snapshot, i) => ({ label: snapshot.project.project_title, expectedTitle: snapshot.project.project_title, tags: [i ? 'PROD' : 'DEV'], apiUrl: 'https://demo.invalid/api/' }));
    const now = new Date().toISOString();
    displayReport(left, right, configs, { demo: true, startedAt: now, completedAt: now });
  });
  $('download').addEventListener('click', () => {
    if (!report) return;
    download(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `redcap-comparison-${report.demo ? 'demo-' : ''}${report.completedAt.replace(/[:.]/g, '-')}.json`);
  });

  renderProjects(toolkit.projects());
}

export default { id: 'compare', title: 'Schema comparison', mount };

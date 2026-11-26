import test from 'node:test';
import assert from 'node:assert/strict';
import { installDocument } from './dom.js';
import compareView from '../src/compare-view.js';
import templateView from '../src/template-view.js';
import dictionaryView from '../src/dictionary-view.js';
import recordView from '../src/record-view.js';

// Every visited Tool stays mounted in one document, so each Tool is mounted into the same body with its demo loaded, which also renders data-driven ids.
async function mountAllTools() {
  const document = installDocument();
  const toolkit = { projects: () => [], onProjectsChange: () => {}, proxy: () => false, apiUrls: null, notice: () => {}, showProjects: () => {}, setBusy: () => {} };
  const containers = {};
  for (const tool of [compareView, templateView, dictionaryView, recordView]) {
    const container = document.createElement('div');
    document.body.append(container);
    tool.mount(container, toolkit);
    await container.querySelector(`#${tool.id}-demo`).click();
    containers[tool.id] = container;
  }
  // An instrument must be chosen before Upload template lists its field checkboxes.
  const instrument = containers.template.querySelector('#template-instrument');
  instrument.value = 'sample';
  await instrument.dispatch('change');
  return { document, containers };
}

test('no element id appears twice across the mounted Tools', async () => {
  const { document } = await mountAllTools();
  const ids = [...document.body.descendants()].map(node => node.id).filter(Boolean);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
});

test('every label and ARIA id reference points at an element in the same Tool', async () => {
  const { containers } = await mountAllTools();
  const unresolved = [];
  for (const [tool, container] of Object.entries(containers)) {
    const nodes = [...container.descendants()], ids = new Set(nodes.map(node => node.id).filter(Boolean));
    for (const node of nodes) for (const name of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
      for (const id of node.getAttribute?.(name)?.split(/\s+/).filter(Boolean) ?? []) if (!ids.has(id)) unresolved.push(`${tool}: ${name}="${id}"`);
    }
  }
  assert.deepEqual(unresolved, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshots } from '../src/compare.js';
import { demoSnapshots } from '../src/demo.js';

test('identical complete schemas have no differences', () => {
  const { left } = demoSnapshots();
  const report = compareSnapshots(left, structuredClone(left));
  for (const section of Object.values(report.counts)) assert.deepEqual(section, { entities: 0, properties: 0 });
});

test('demo identifies expected project differences, field changes and missing repeating configuration', () => {
  const { left, right } = demoSnapshots(), report = compareSnapshots(left, right);
  assert.equal(report.counts.project.entities, 3);
  assert.ok(report.sections.project.filter(row => row.status === 'changed').every(row => row.expected));
  assert.equal(report.counts.metadata.entities, 2);
  assert.equal(report.sections.metadata.find(row => row.id === 'consent').changes[0].property, 'required_field');
  assert.equal(report.sections.metadata.find(row => row.id === 'rna_quality').status, 'reference-only');
  assert.equal(report.sections.repeating[0].status, 'reference-only');
  assert.equal(report.sections.instruments.find(row => row.id === 'sample').fieldChanges, 1);
});

test('insertion does not produce false reorder differences', () => {
  const { left } = demoSnapshots(), right = structuredClone(left);
  right.metadata.splice(1, 0, { ...right.metadata[1], field_name: 'new_field' });
  const result = compareSnapshots(left, right);
  assert.equal(result.counts.metadata.entities, 1);
  assert.equal(result.sections.metadata.find(row => row.id === 'new_field').status, 'comparison-only');
});

test('field reorder is reported separately from a field moving instruments', () => {
  const { left } = demoSnapshots(), right = structuredClone(left);
  [right.metadata[0], right.metadata[1]] = [right.metadata[1], right.metadata[0]];
  right.metadata[2].form_name = 'enrolment';
  const result = compareSnapshots(left, right);
  assert.equal(result.sections.metadata.find(row => row.id === 'record_id').changes[0].property, 'relative_field_order');
  const moved = result.sections.metadata.find(row => row.id === 'sample_id');
  assert.equal(moved.status, 'changed');
  assert.equal(moved.changes[0].property, 'form_name');
  assert.ok(result.sections.instruments.every(row => row.fieldChanges > 0));
});

test('instrument order, label, membership and field summaries are all compared', () => {
  const { left } = demoSnapshots(), right = structuredClone(left);
  right.instruments.reverse();
  right.instruments[0].instrument_label = 'Updated sample label';
  right.instruments.push({ instrument_name: 'followup', instrument_label: 'Follow-up' });
  const report = compareSnapshots(left, right);
  assert.equal(report.counts.instruments.entities, 3);
  assert.equal(report.sections.instruments.find(row => row.id === 'followup').status, 'comparison-only');
  assert.ok(report.sections.instruments.find(row => row.id === 'sample').changes.some(change => change.property === 'relative_instrument_order'));
});

test('exact text, empty versus absent and new API properties are preserved', () => {
  const { left } = demoSnapshots(), right = structuredClone(left);
  right.metadata[0].field_label += ' ';
  delete right.metadata[0].field_annotation;
  right.metadata[0].future_api_property = '';
  const changes = compareSnapshots(left, right).sections.metadata[0].changes;
  assert.equal(changes.length, 3);
  assert.equal(changes.find(change => change.property === 'field_annotation').rightPresent, false);
  assert.equal(changes.find(change => change.property === 'future_api_property').leftPresent, false);
});

test('a field rename is a removal and addition', () => {
  const { left } = demoSnapshots(), right = structuredClone(left);
  right.metadata[1].field_name = 'consent_v2';
  const rows = compareSnapshots(left, right).sections.metadata;
  assert.equal(rows.find(row => row.id === 'consent').status, 'reference-only');
  assert.equal(rows.find(row => row.id === 'consent_v2').status, 'comparison-only');
});

test('duplicate keys and longitudinal repeating configuration are rejected', () => {
  const { left } = demoSnapshots(), right = structuredClone(left);
  right.metadata.push(right.metadata[0]);
  assert.throws(() => compareSnapshots(left, right), /duplicate field_name/);
  right.metadata.pop(); right.repeating[0].event_name = 'event_1_arm_1';
  assert.throws(() => compareSnapshots(left, right), /classic projects/);
});

test('repeating custom labels are compared and successful empty exports are supported', () => {
  const { left } = demoSnapshots(), right = structuredClone(left);
  right.repeating[0].custom_form_label = '[sample_id] ([collected])';
  assert.equal(compareSnapshots(left, right).sections.repeating[0].changes[0].property, 'custom_form_label');
  left.repeating = []; right.repeating = [];
  assert.equal(compareSnapshots(left, right).counts.repeating.entities, 0);
});

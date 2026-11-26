import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSnapshots } from '../src/demo.js';
import { recordBlocks } from '../src/record.js';

const { left: snapshot } = demoSnapshots();
const all = { hideEmpty: false };
const field = (blocks, block, name) => blocks[block].fields.find(row => row.name === name);

test('a record shows one block per instrument in Instruments order and one per repeating instance, with its status', () => {
  const blocks = recordBlocks(snapshot, snapshot.record, all);
  assert.deepEqual(blocks.map(block => [block.label, block.instance, block.status]), [
    ['Enrolment', '', { code: '2', label: 'Complete' }],
    ['Sample collection', '1', { code: '2', label: 'Complete' }],
    ['Sample collection', '2', { code: '1', label: 'Unverified' }]
  ]);
  // Fields keep Metadata order. The descriptive field holds no data and is left out.
  assert.deepEqual(blocks[1].fields.map(row => row.name), ['sample_id', 'collected', 'freezer_events', 'days_to_process', 'gel_image', 'quality_band', 'lab_code', 'rna_quality']);
});

test('instances are ordered numerically and a status that was not exported or is blank is shown as none', () => {
  const rows = structuredClone(snapshot.record);
  rows[1].redcap_repeat_instance = 10;
  delete rows[0].enrolment_complete;
  rows[2].sample_complete = '';
  const blocks = recordBlocks(snapshot, rows, all);
  assert.deepEqual(blocks.map(block => [block.instance, block.status]), [['', null], ['2', null], ['10', { code: '2', label: 'Complete' }]]);
});

test('coded values keep their raw code with its label, and checkboxes give their ticked codes through the field names export', () => {
  const blocks = recordBlocks(snapshot, snapshot.record, all);
  assert.deepEqual(field(blocks, 0, 'consent').values, [{ value: '1', label: 'Yes' }]);
  assert.deepEqual(field(blocks, 1, 'freezer_events').values, [{ value: '1', label: 'Thawed' }, { value: '2', label: 'Relabelled' }]);
  assert.deepEqual(field(blocks, 2, 'freezer_events').values, [{ value: '-9', label: 'Not recorded' }]);
  // Text values carry no label, even when they look like a code.
  assert.deepEqual(field(blocks, 1, 'rna_quality').values, [{ value: '8.1', label: '' }]);
});

test('validated text fields carry their validation type, and file fields are read although the field names export omits them', () => {
  const blocks = recordBlocks(snapshot, snapshot.record, all);
  assert.equal(field(blocks, 1, 'collected').validation, 'date_ymd');
  assert.deepEqual(field(blocks, 1, 'collected').values, [{ value: '2026-03-04', label: '' }]);
  assert.equal(field(blocks, 1, 'sample_id').validation, '');
  assert.deepEqual(field(blocks, 1, 'gel_image').values, [{ value: '[document]', label: '' }]);
});

test('a field missing from the export is not exported, which is distinct from an empty value', () => {
  const rows = structuredClone(snapshot.record);
  delete rows[0].initials;
  for (const name of ['freezer_events___1', 'freezer_events___2', 'freezer_events____9']) delete rows[2][name];
  const blocks = recordBlocks(snapshot, rows, all);
  assert.deepEqual([field(blocks, 0, 'initials').absent, field(blocks, 0, 'initials').empty], [true, false]);
  assert.deepEqual([field(blocks, 2, 'freezer_events').absent, field(blocks, 2, 'freezer_events').empty], [true, false]);
  assert.deepEqual([field(blocks, 2, 'lab_code').absent, field(blocks, 2, 'lab_code').empty], [false, true]);
  // An unticked checkbox is empty, not absent.
  const unticked = structuredClone(snapshot.record);
  unticked[2].freezer_events____9 = '0';
  const checkbox = field(recordBlocks(snapshot, unticked, all), 2, 'freezer_events');
  assert.deepEqual([checkbox.absent, checkbox.empty], [false, true]);
});

test('hiding empty fields keeps the record ID, values and fields that were not exported', () => {
  const rows = structuredClone(snapshot.record);
  rows[0].record_id = '';
  delete rows[2].lab_code;
  const blocks = recordBlocks(snapshot, rows, { hideEmpty: true });
  assert.deepEqual(blocks[0].fields.map(row => row.name), ['record_id', 'consent', 'initials']);
  assert.deepEqual(blocks[2].fields.map(row => row.name), ['sample_id', 'collected', 'freezer_events', 'days_to_process', 'quality_band', 'lab_code', 'rna_quality']);
});

test('identifier fields are flagged for masking', () => {
  const blocks = recordBlocks(snapshot, snapshot.record, all);
  assert.deepEqual(blocks[0].fields.filter(row => row.identifier).map(row => row.name), ['initials']);
});

test('a checkbox missing from the field names export stops the record rather than showing it unticked', () => {
  const incomplete = { ...snapshot, fieldNames: snapshot.fieldNames.filter(row => row.original_field_name !== 'freezer_events') };
  assert.throws(() => recordBlocks(incomplete, snapshot.record, all), /no column for freezer_events/);
});

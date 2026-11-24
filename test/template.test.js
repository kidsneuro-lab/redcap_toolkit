import test from 'node:test';
import assert from 'node:assert/strict';
import { templateColumns, templateCsv } from '../src/template.js';
import { demoSnapshots } from '../src/demo.js';

// A synthetic classic project. Export field names are hand-written, as REDCap returns them.
const field = (field_name, form_name, field_type = 'text', extras = {}) => ({ field_name, form_name, field_type, field_label: field_name, field_annotation: '', select_choices_or_calculations: '', ...extras });
const exported = (original_field_name, export_field_name = original_field_name, choice_value = '') => ({ original_field_name, choice_value, export_field_name });
const project = {
  metadata: [field('record_id', 'enrolment'), field('consent', 'enrolment', 'yesno'), field('sample_id', 'sample'), field('collected', 'sample'), field('symptoms', 'follow_up', 'checkbox', { select_choices_or_calculations: '1, Cough | 2, Fever | -9, Not recorded' }),
    field('instructions', 'visit', 'descriptive'), field('weight', 'visit'), field('bmi', 'visit', 'calc', { select_choices_or_calculations: '[weight]/4' }), field('scan', 'visit', 'file'), field('signature', 'visit', 'file', { text_validation_type_or_show_slider_number: 'signature' }),
    field('bmi_band', 'visit', 'text', { field_annotation: '@HIDDEN @CALCTEXT(if([bmi] > 25, "high", "normal"))' }), field('site', 'visit', 'text', { field_annotation: '@READONLY' })],
  repeating: [{ form_name: 'sample', custom_form_label: '' }],
  fieldNames: [exported('record_id'), exported('consent'), exported('sample_id'), exported('collected'), exported('symptoms', 'symptoms___1', '1'), exported('symptoms', 'symptoms___2', '2'), exported('symptoms', 'symptoms____9', '-9'),
    exported('weight'), exported('bmi'), exported('bmi_band'), exported('site')]
};

test('All mode puts the record ID first and the instrument status column last', () => {
  assert.deepEqual(templateColumns(project, 'enrolment'), ['record_id', 'consent', 'enrolment_complete']);
});

test('a repeating instrument gets the record ID and repeat columns even though it does not contain the record ID', () => {
  assert.deepEqual(templateColumns(project, 'sample'), ['record_id', 'redcap_repeat_instrument', 'redcap_repeat_instance', 'sample_id', 'collected', 'sample_complete']);
});

test('a checkbox expands to one column per choice, with a negative code as REDCap names it', () => {
  assert.deepEqual(templateColumns(project, 'follow_up'), ['record_id', 'symptoms___1', 'symptoms___2', 'symptoms____9', 'follow_up_complete']);
});

test('descriptive, file, signature, calc and @CALCTEXT fields are excluded and @READONLY fields are kept', () => {
  assert.deepEqual(templateColumns(project, 'visit'), ['record_id', 'weight', 'site', 'visit_complete']);
});

test('Selected mode keeps Metadata order whatever order fields were ticked, with a ticked status column last', () => {
  assert.deepEqual(templateColumns(project, 'visit', ['visit_complete', 'site', 'weight']), ['record_id', 'weight', 'site', 'visit_complete']);
  assert.deepEqual(templateColumns(project, 'visit', ['site']), ['record_id', 'site']);
});

test('Selected mode with nothing ticked still gives the record ID and, for a repeating instrument, the repeat columns', () => {
  assert.deepEqual(templateColumns(project, 'sample', []), ['record_id', 'redcap_repeat_instrument', 'redcap_repeat_instance']);
  assert.deepEqual(templateColumns(project, 'enrolment', []), ['record_id']);
});

test('an importable field missing from exportFieldNames stops the template rather than dropping its column', () => {
  const incomplete = { ...project, fieldNames: project.fieldNames.filter(row => row.original_field_name !== 'site') };
  assert.throws(() => templateColumns(incomplete, 'visit'), /site/);
  assert.deepEqual(templateColumns(incomplete, 'visit', ['weight']), ['record_id', 'weight']);
});

test('the CSV is one comma-separated header row ending in CRLF, encoded as UTF-8 without a BOM', () => {
  const csv = templateCsv(templateColumns(project, 'sample'));
  assert.equal(csv, 'record_id,redcap_repeat_instrument,redcap_repeat_instance,sample_id,collected,sample_complete\r\n');
  assert.deepEqual([...new TextEncoder().encode(csv).slice(0, 3)], [0x72, 0x65, 0x63]);
});

test('the demo DEV project exercises every column rule', () => {
  const { left } = demoSnapshots();
  assert.deepEqual(templateColumns(left, 'sample'), ['record_id', 'redcap_repeat_instrument', 'redcap_repeat_instance', 'sample_id', 'collected', 'freezer_events___1', 'freezer_events___2', 'freezer_events____9', 'lab_code', 'rna_quality', 'sample_complete']);
  assert.deepEqual(templateColumns(left, 'enrolment'), ['record_id', 'consent', 'enrolment_complete']);
});

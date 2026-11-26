import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaryRows } from '../src/dictionary.js';

// Synthetic exports, as REDCap returns them: Metadata in form order, Instruments with labels.
const field = (field_name, form_name, field_label, extras = {}) => ({ field_name, form_name, field_type: 'text', field_label, select_choices_or_calculations: '', text_validation_type_or_show_slider_number: '', text_validation_min: '', text_validation_max: '', required_field: '', ...extras });
const snapshot = {
  instruments: [{ instrument_name: 'enrolment', instrument_label: 'Enrolment' }, { instrument_name: 'visit', instrument_label: 'Clinic visit' }],
  metadata: [
    field('record_id', 'enrolment', 'Record ID'),
    field('sex', 'enrolment', 'Sex at birth', { field_type: 'radio', select_choices_or_calculations: '1, Female | 2, Male | -9, Not recorded', required_field: 'y' }),
    field('visit_date', 'visit', 'Visit date', { text_validation_type_or_show_slider_number: 'date_dmy', text_validation_min: '2020-01-01', text_validation_max: 'today' }),
    field('clinician', 'visit', 'Clinician name'),
    field('comments', 'visit', 'Comments', { field_type: 'notes' }),
    field('instructions', 'visit', 'Measure twice.', { field_type: 'descriptive' }),
    field('photo', 'visit', 'Photo', { field_type: 'file' }),
    field('bmi', 'visit', 'BMI', { field_type: 'calc', select_choices_or_calculations: '[weight]/([height]^2)' }),
    field('symptoms', 'visit', 'Symptoms', { field_type: 'checkbox', select_choices_or_calculations: '1, Fever, high | 2, Cough' }),
    field('consent', 'visit', 'Consent given?', { field_type: 'yesno' }),
    field('fasting', 'visit', 'Fasting?', { field_type: 'truefalse' })
  ]
};
const all = { instruments: ['enrolment', 'visit'], hideFreeText: false, search: '', sort: null };
const names = rows => rows.map(row => row.name);

test('rows follow Metadata order for the chosen instruments, with the agreed columns', () => {
  assert.deepEqual(names(dictionaryRows(snapshot, { ...all, instruments: ['enrolment'] })), ['record_id', 'sex']);
  const [, sex, visitDate] = dictionaryRows(snapshot, all);
  assert.deepEqual(sex, { name: 'sex', instrument: 'enrolment', instrumentLabel: 'Enrolment', label: 'Sex at birth', type: 'radio', choices: [{ code: '1', label: 'Female' }, { code: '2', label: 'Male' }, { code: '-9', label: 'Not recorded' }], checkbox: false, required: true, min: '', max: '' });
  assert.deepEqual(visitDate, { name: 'visit_date', instrument: 'visit', instrumentLabel: 'Clinic visit', label: 'Visit date', type: 'text (date_dmy)', choices: [], checkbox: false, required: false, min: '2020-01-01', max: 'today' });
});

test('the free-text filter hides fields with no entry constraint, but never the record ID', () => {
  assert.deepEqual(names(dictionaryRows(snapshot, { ...all, hideFreeText: true })), ['record_id', 'sex', 'visit_date', 'symptoms', 'consent', 'fasting']);
  assert.equal(dictionaryRows(snapshot, all).length, snapshot.metadata.length);
});

test('choices keep commas inside labels, checkbox fields carry the upload hint and yes/no types show their fixed codes', () => {
  const rows = Object.fromEntries(dictionaryRows(snapshot, all).map(row => [row.name, row]));
  assert.deepEqual(rows.symptoms.choices, [{ code: '1', label: 'Fever, high' }, { code: '2', label: 'Cough' }]);
  assert.equal(rows.symptoms.checkbox, true);
  assert.deepEqual(rows.consent.choices, [{ code: '1', label: 'Yes' }, { code: '0', label: 'No' }]);
  assert.deepEqual(rows.fasting.choices, [{ code: '1', label: 'True' }, { code: '0', label: 'False' }]);
  assert.deepEqual(rows.bmi.choices, []);
});

test('search matches any part of the field name, field label or a choice label, ignoring case', () => {
  const search = text => names(dictionaryRows(snapshot, { ...all, search: text }));
  assert.deepEqual(search('VISIT_'), ['visit_date']);
  assert.deepEqual(search('clinic'), ['clinician']);
  assert.deepEqual(search('female'), ['sex']);
  assert.deepEqual(search('  '), names(dictionaryRows(snapshot, all)));
  assert.deepEqual(search('no such field'), []);
});

test('rows sort by a column in either direction, ties keep Metadata order and the Instrument column sorts by label', () => {
  const sorted = (column, direction, instruments = all.instruments) => names(dictionaryRows(snapshot, { ...all, instruments, sort: { column, direction } }));
  assert.deepEqual(sorted('name', 'ascending', ['enrolment', 'visit']).slice(0, 4), ['bmi', 'clinician', 'comments', 'consent']);
  assert.deepEqual(sorted('label', 'descending').slice(0, 3), ['visit_date', 'symptoms', 'sex']);
  assert.deepEqual(sorted('type', 'ascending').slice(0, 3), ['bmi', 'symptoms', 'instructions']);
  // "Clinic visit" sorts before "Enrolment", although visit sorts after enrolment by name.
  assert.deepEqual(sorted('instrument', 'ascending').slice(0, 2), ['visit_date', 'clinician']);
  assert.deepEqual(sorted('instrument', 'descending'), ['record_id', 'sex', 'visit_date', 'clinician', 'comments', 'instructions', 'photo', 'bmi', 'symptoms', 'consent', 'fasting']);
});

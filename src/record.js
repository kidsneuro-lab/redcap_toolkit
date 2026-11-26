// Record viewer rules. Pure: no DOM, storage or network.
import { choices } from './dictionary.js';

const statuses = { 0: 'Incomplete', 1: 'Unverified', 2: 'Complete' };
const coded = new Set(['radio', 'dropdown', 'checkbox', 'yesno', 'truefalse']);

// One field's value in one exported row. A field whose columns are all missing from the row was not exported with the token's rights,
// which is kept distinct from an empty value. Only a checkbox has several columns, named by the field names export.
function fieldValue(row, field, fieldNames) {
  const checkbox = field.field_type === 'checkbox';
  const columns = checkbox ? fieldNames.filter(column => column.original_field_name === field.field_name) : [{ export_field_name: field.field_name }];
  // An incomplete export must not make a ticked choice look unticked.
  if (!columns.length) throw new Error(`The field names export has no column for ${field.field_name}.`);
  const present = columns.filter(column => Object.hasOwn(row, column.export_field_name));
  if (!present.length) return { absent: true, empty: false, values: [] };
  const labels = new Map(choices(field).map(choice => [choice.code, choice.label]));
  // A ticked checkbox choice exports '1'. The checkbox's value is the ticked codes.
  const values = checkbox ? present.filter(column => row[column.export_field_name] === '1').map(column => column.choice_value) : [row[field.field_name]].filter(value => value !== '' && value !== null);
  return { absent: false, empty: !values.length, values: values.map(value => ({ value: String(value), label: coded.has(field.field_type) ? labels.get(String(value)) ?? '' : '' })) };
}

// The record's values, one block per instrument in Instruments order and one per repeating instance, with fields in Metadata order.
// Descriptive fields hold no data and are left out. The record ID, the first Metadata field, is never hidden as empty.
export function recordBlocks({ instruments, metadata, fieldNames }, rows, { hideEmpty }) {
  const recordId = metadata[0].field_name;
  const base = rows.find(row => !row.redcap_repeat_instrument);
  return instruments.flatMap(({ instrument_name: name, instrument_label: label }) => {
    const repeats = rows.filter(row => row.redcap_repeat_instrument === name).sort((a, b) => Number(a.redcap_repeat_instance) - Number(b.redcap_repeat_instance));
    const sources = repeats.length ? repeats : base ? [base] : [];
    return sources.map(row => {
      const status = row[`${name}_complete`];
      const fields = metadata.filter(field => field.form_name === name && field.field_type !== 'descriptive').map(field => ({
        name: field.field_name, label: field.field_label, type: field.field_type, identifier: field.identifier === 'y',
        validation: field.field_type === 'text' ? field.text_validation_type_or_show_slider_number || '' : '',
        ...fieldValue(row, field, fieldNames)
      })).filter(field => !hideEmpty || !field.empty || field.name === recordId);
      return { instrument: name, label, instance: repeats.length ? String(row.redcap_repeat_instance) : '', status: status === undefined || status === '' ? null : { code: String(status), label: statuses[status] ?? '' }, fields };
    });
  });
}

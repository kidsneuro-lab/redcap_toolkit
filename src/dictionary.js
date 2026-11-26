// Data dictionary rules. Pure: no DOM, storage or network.

// Only these types list codes in select_choices_or_calculations. Calc and slider use the same property for other things.
const choiceTypes = new Set(['radio', 'dropdown', 'checkbox']);
// "1, Female | 2, Male": the first comma separates the code, so labels may contain commas.
const parseChoices = text => text.split('|').map(item => item.trim()).filter(Boolean).map(item => {
  const comma = item.indexOf(',');
  return comma < 0 ? { code: item, label: '' } : { code: item.slice(0, comma).trim(), label: item.slice(comma + 1).trim() };
});
// REDCap exports no choices for these types, but their codes are fixed.
const fixedChoices = { yesno: '1, Yes | 0, No', truefalse: '1, True | 0, False' };
const choices = row => fixedChoices[row.field_type] ? parseChoices(fixedChoices[row.field_type]) : choiceTypes.has(row.field_type) ? parseChoices(row.select_choices_or_calculations || '') : [];

// Fields with no code or format to get right, or that take no entered value. Validated text keeps its format rule, so it stays.
const freeText = row => ['notes', 'descriptive', 'file', 'calc'].includes(row.field_type) || (row.field_type === 'text' && !row.text_validation_type_or_show_slider_number);

// The rows to display, in Metadata order. The record ID, the first Metadata field, is never hidden by the free-text filter.
export function dictionaryRows({ instruments, metadata }, view) {
  const labels = new Map(instruments.map(row => [row.instrument_name, row.instrument_label]));
  const shown = row => view.instruments.includes(row.form_name) && (!view.hideFreeText || row === metadata[0] || !freeText(row));
  const search = view.search.trim().toLowerCase();
  const found = row => !search || [row.name, row.label, ...row.choices.map(choice => choice.label)].some(text => text.toLowerCase().includes(search));
  const rows = metadata.filter(shown).map(row => ({
    name: row.field_name, instrument: row.form_name, instrumentLabel: labels.get(row.form_name) ?? row.form_name, label: row.field_label,
    type: row.text_validation_type_or_show_slider_number && row.field_type === 'text' ? `text (${row.text_validation_type_or_show_slider_number})` : row.field_type,
    choices: choices(row),
    checkbox: row.field_type === 'checkbox', required: row.required_field === 'y', min: row.text_validation_min || '', max: row.text_validation_max || ''
  })).filter(found);
  if (!view.sort) return rows;
  // Array sort is stable, so ties keep Metadata order. Numeric collation puts q2 before q10.
  const key = row => view.sort.column === 'instrument' ? row.instrumentLabel : row[view.sort.column];
  const sign = view.sort.direction === 'descending' ? -1 : 1;
  return rows.sort((a, b) => sign * key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: 'base' }));
}

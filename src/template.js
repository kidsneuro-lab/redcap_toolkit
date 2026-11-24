// Upload template rules. Pure: no DOM, storage or network.

// Fields that cannot take imported values: no data, a file, or a value REDCap recalculates. @READONLY only limits data entry, so it stays.
const excluded = field => ['descriptive', 'file', 'calc'].includes(field.field_type) || /@CALCTEXT\b/.test(field.field_annotation || '');

// Columns for one instrument, in Metadata order. Names come from REDCap's exportFieldNames export.
// Without `selected` (All mode) every importable field is included. With it (Selected mode), only the listed field names and status column.
export function templateColumns({ metadata, repeating, fieldNames }, instrument, selected) {
  const chosen = name => !selected || selected.includes(name);
  const recordId = metadata[0].field_name;
  const repeat = repeating.some(row => row.form_name === instrument) ? ['redcap_repeat_instrument', 'redcap_repeat_instance'] : [];
  const fields = metadata.filter(row => row.form_name === instrument && row.field_name !== recordId && !excluded(row) && chosen(row.field_name));
  const names = field => {
    const columns = fieldNames.filter(row => row.original_field_name === field.field_name).map(row => row.export_field_name);
    // An incomplete export must not produce a template that looks complete.
    if (!columns.length) throw new Error(`The field names export has no column for ${field.field_name}.`);
    return columns;
  };
  const status = `${instrument}_complete`;
  return [recordId, ...repeat, ...fields.flatMap(names), ...(chosen(status) ? [status] : [])];
}

// One header row, CRLF line ending. The browser encodes a Blob string as UTF-8 without a BOM.
export const templateCsv = columns => `${columns.join(',')}\r\n`;

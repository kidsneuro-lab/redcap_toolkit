export const sections = ['project', 'instruments', 'repeating', 'metadata'];
const expectedProjectKeys = new Set(['project_id', 'project_title', 'in_production', 'creation_time', 'production_time']);
const has = (object, key) => Object.hasOwn(object, key);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function index(rows, key, label) {
  const result = new Map();
  for (const row of rows) {
    const id = row[key];
    if (typeof id !== 'string' || !id) throw new Error(`${label} has a missing ${key}.`);
    if (result.has(id)) throw new Error(`${label} has duplicate ${key}: ${id}.`);
    result.set(id, row);
  }
  return result;
}

function properties(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().filter(key => !has(left, key) || !has(right, key) || !same(left[key], right[key])).map(property => ({ property, left: left[property], right: right[property], leftPresent: has(left, property), rightPresent: has(right, property) }));
}

function compareRows(leftRows, rightRows, key, label) {
  const left = index(leftRows, key, label);
  const right = index(rightRows, key, label);
  return [...new Set([...left.keys(), ...right.keys()])].map(id => {
    const a = left.get(id), b = right.get(id);
    const status = !a ? 'comparison-only' : !b ? 'reference-only' : 'unchanged';
    const changes = a && b ? properties(a, b) : [];
    return { id, instrument: a?.form_name || b?.form_name || id, status: changes.length ? 'changed' : status, left: a, right: b, changes };
  });
}

// Compare relative order of shared entities so one insertion does not mark every later entity as moved.
function addOrderChanges(rows, leftIds, rightIds, property) {
  const common = new Set(leftIds.filter(id => rightIds.includes(id)));
  const a = leftIds.filter(id => common.has(id)), b = rightIds.filter(id => common.has(id));
  for (const row of rows) {
    if (!common.has(row.id)) continue;
    const left = a.indexOf(row.id), right = b.indexOf(row.id);
    if (left !== right) {
      row.changes.push({ property, left: left + 1, right: right + 1, leftPresent: true, rightPresent: true });
      row.status = 'changed';
    }
  }
}

export function compareSnapshots(left, right) {
  const project = [...new Set([...Object.keys(left.project), ...Object.keys(right.project)])].sort().map(id => {
    const changes = properties(has(left.project, id) ? { [id]: left.project[id] } : {}, has(right.project, id) ? { [id]: right.project[id] } : {});
    return { id, instrument: '', status: changes.length ? 'changed' : 'unchanged', expected: expectedProjectKeys.has(id), changes, left: left.project[id], right: right.project[id] };
  });
  const metadata = compareRows(left.metadata, right.metadata, 'field_name', 'Metadata');
  for (const form of new Set([...left.metadata, ...right.metadata].map(row => row.form_name))) {
    const rows = metadata.filter(row => row.left?.form_name === form && row.right?.form_name === form);
    addOrderChanges(rows, left.metadata.filter(row => row.form_name === form).map(row => row.field_name), right.metadata.filter(row => row.form_name === form).map(row => row.field_name), 'relative_field_order');
  }
  const instruments = compareRows(left.instruments, right.instruments, 'instrument_name', 'Instruments');
  addOrderChanges(instruments, left.instruments.map(row => row.instrument_name), right.instruments.map(row => row.instrument_name), 'relative_instrument_order');
  for (const row of instruments) {
    row.instrument = row.id;
    row.fieldChanges = metadata.filter(field => field.status !== 'unchanged' && (field.left?.form_name === row.id || field.right?.form_name === row.id)).length;
    if (row.fieldChanges && row.status === 'unchanged') row.status = 'changed';
  }
  for (const snapshot of [left, right]) {
    if (snapshot.repeating.some(row => !row.form_name || row.event_name)) throw new Error('Repeating events or event-specific configuration were returned. Only classic projects are supported.');
  }
  const repeating = compareRows(left.repeating, right.repeating, 'form_name', 'Repeating instruments');
  const result = { project, instruments, repeating, metadata };
  const counts = Object.fromEntries(sections.map(section => [section, { entities: result[section].filter(row => row.status !== 'unchanged').length, properties: result[section].reduce((sum, row) => sum + row.changes.length, 0) }]));
  return { sections: result, counts };
}

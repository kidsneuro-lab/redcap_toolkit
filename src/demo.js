export function demoSnapshots() {
  const field = (field_name, form_name, field_label, extras = {}) => ({ field_name, form_name, field_type: 'text', field_label, required_field: '', branching_logic: '', field_annotation: '', ...extras });
  const left = {
    project: { project_id: 101, project_title: 'Example project DEV', in_production: 0, is_longitudinal: 0, surveys_enabled: 1, project_language: 'English', purpose: 2 },
    instruments: [{ instrument_name: 'enrolment', instrument_label: 'Enrolment' }, { instrument_name: 'sample', instrument_label: 'Sample collection' }],
    repeating: [{ form_name: 'sample', custom_form_label: '[sample_id]' }],
    metadata: [field('record_id', 'enrolment', 'Record ID'), field('consent', 'enrolment', 'Consent obtained?', { field_type: 'yesno', required_field: 'y' }), field('sample_id', 'sample', 'Sample ID'), field('collected', 'sample', 'Date collected', { text_validation_type_or_show_slider_number: 'date_ymd' }), field('rna_quality', 'sample', 'RNA quality score', { text_validation_min: '0', text_validation_max: '10' })]
  };
  const right = structuredClone(left);
  right.project = { ...right.project, project_id: 202, project_title: 'Example project PROD', in_production: 1 };
  right.instruments[1].instrument_label = 'Samples';
  right.repeating = [];
  right.metadata[1].required_field = '';
  right.metadata.pop();
  return { left, right };
}

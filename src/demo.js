export function demoSnapshots() {
  const field = (field_name, form_name, field_label, extras = {}) => ({ field_name, form_name, field_type: 'text', field_label, required_field: '', branching_logic: '', field_annotation: '', ...extras });
  const left = {
    project: { project_id: 101, project_title: 'Example project DEV', in_production: 0, is_longitudinal: 0, surveys_enabled: 1, project_language: 'English', purpose: 2, project_pi_lastname: 'Example-Reference' },
    instruments: [{ instrument_name: 'enrolment', instrument_label: 'Enrolment' }, { instrument_name: 'sample', instrument_label: 'Sample collection' }],
    repeating: [{ form_name: 'sample', custom_form_label: '[sample_id]' }],
    metadata: [field('record_id', 'enrolment', 'Record ID'), field('consent', 'enrolment', 'Consent obtained?', { field_type: 'yesno', required_field: 'y' }), field('initials', 'enrolment', 'Participant initials', { identifier: 'y' }), field('sample_id', 'sample', 'Sample ID'), field('collected', 'sample', 'Date collected', { text_validation_type_or_show_slider_number: 'date_ymd' }),
      // Upload template special cases. They sit before the last field so the PROD copy below still drops rna_quality.
      field('freezer_events', 'sample', 'Freezer events', { field_type: 'checkbox', select_choices_or_calculations: '1, Thawed | 2, Relabelled | -9, Not recorded' }), field('handling_note', 'sample', 'Handle samples on ice.', { field_type: 'descriptive' }),
      field('days_to_process', 'sample', 'Days to processing', { field_type: 'calc', select_choices_or_calculations: 'datediff([collected], "today", "d")' }), field('gel_image', 'sample', 'Gel image', { field_type: 'file' }),
      field('quality_band', 'sample', 'Quality band', { field_annotation: '@CALCTEXT(if([rna_quality] >= 7, "pass", "review"))' }), field('lab_code', 'sample', 'Laboratory code', { field_annotation: '@READONLY' }),
      field('rna_quality', 'sample', 'RNA quality score', { text_validation_min: '0', text_validation_max: '10' })],
    // Hand-written as REDCap returns exportFieldNames: checkbox choices expanded, calc listed, descriptive and file absent.
    fieldNames: [['record_id'], ['consent'], ['initials'], ['sample_id'], ['collected'], ['freezer_events', '1', 'freezer_events___1'], ['freezer_events', '2', 'freezer_events___2'], ['freezer_events', '-9', 'freezer_events____9'], ['days_to_process'], ['quality_band'], ['lab_code'], ['rna_quality']].map(([original_field_name, choice_value = '', export_field_name = original_field_name]) => ({ original_field_name, choice_value, export_field_name }))
  };
  // One synthetic record for Record viewer, as REDCap exports it flat and raw: a base row, then a row per repeating instance.
  // The base row carries the repeating instrument's columns empty. The descriptive field has no column.
  const sampleColumns = values => ({ sample_id: '', collected: '', freezer_events___1: '0', freezer_events___2: '0', freezer_events____9: '0', days_to_process: '', gel_image: '', quality_band: '', lab_code: '', rna_quality: '', sample_complete: '', ...values });
  left.record = [
    { record_id: 'SYN-001', redcap_repeat_instrument: '', redcap_repeat_instance: '', consent: '1', initials: 'ZZ', enrolment_complete: '2', ...sampleColumns() },
    { record_id: 'SYN-001', redcap_repeat_instrument: 'sample', redcap_repeat_instance: 1, consent: '', initials: '', enrolment_complete: '', ...sampleColumns({ sample_id: 'SYN-S-01', collected: '2026-03-04', freezer_events___1: '1', freezer_events___2: '1', days_to_process: '12', gel_image: '[document]', quality_band: 'pass', lab_code: 'LAB-07', rna_quality: '8.1', sample_complete: '2' }) },
    { record_id: 'SYN-001', redcap_repeat_instrument: 'sample', redcap_repeat_instance: 2, consent: '', initials: '', enrolment_complete: '', ...sampleColumns({ sample_id: 'SYN-S-02', collected: '2026-04-15', freezer_events____9: '1', days_to_process: '3', quality_band: 'review', rna_quality: '6.4', sample_complete: '1' }) }
  ];
  const right = structuredClone(left);
  // Only the DEV project carries field names, for Upload template and Record viewer, and a record. Schema comparison does not compare them.
  delete right.fieldNames;
  delete right.record;
  right.project = { ...right.project, project_id: 202, project_title: 'Example project PROD', in_production: 1, project_pi_lastname: 'Example-Comparison' };
  right.instruments[1].instrument_label = 'Samples';
  right.repeating = [];
  right.metadata[1].required_field = '';
  right.metadata.pop();
  return { left, right };
}

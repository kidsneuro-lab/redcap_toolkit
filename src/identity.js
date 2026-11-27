export function booleanFlag(value) {
  if ([true, 1, '1'].includes(value)) return true;
  if ([false, 0, '0'].includes(value)) return false;
  throw new Error('Unrecognised boolean flag returned by REDCap.');
}

export function validateIdentity(config, info) {
  // A project saved before project IDs were recorded is only identified once the Projects drawer has checked a token for it.
  if (!config.projectId) return ['This project has no recorded project ID. Enter its token in Projects to check it.'];
  const issues = [];
  if (info.is_longitudinal !== undefined && booleanFlag(info.is_longitudinal)) issues.push('This project is longitudinal. This app supports classic projects only.');
  if (info.project_id === undefined || info.project_id === null || String(info.project_id) === '') issues.push('Project Info did not return a project ID.');
  else if (String(info.project_id) !== config.projectId) issues.push(`Project ID mismatch. Expected ${config.projectId}; received ${info.project_id}.`);
  return issues;
}

export function endpointKey(value) {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}

export function validatePair(leftConfig, left, rightConfig, right) {
  if (endpointKey(leftConfig.apiUrl) === endpointKey(rightConfig.apiUrl) && String(left.project_id) === String(right.project_id)) throw new Error('Both selections resolve to the same REDCap project.');
}

// Checks a token's Project Info against a project configuration from the Projects drawer, and returns the configuration refreshed from it.
// The title and the PROD or DEV tag come from REDCap. A tag is set only when the production status is new or has changed.
export function checkProjectInfo(config, info) {
  if (info.project_id === undefined || info.project_id === null || String(info.project_id) === '') throw new Error('Project Info did not return a project ID.');
  // A project saved before project IDs were recorded is matched on its old expected title one last time, then identified by project ID.
  const { label, expectedTitle, ...rest } = config;
  if (!config.projectId) {
    if (info.project_title !== expectedTitle) throw new Error(`This token belongs to ${JSON.stringify(info.project_title)}, not the saved title ${JSON.stringify(expectedTitle)}.`);
  } else if (String(info.project_id) !== config.projectId) throw new Error(`This token belongs to project ID ${info.project_id}, not ${config.projectId}.`);
  if (info.is_longitudinal !== undefined && booleanFlag(info.is_longitudinal)) throw new Error('This project is longitudinal. This app supports classic projects only.');
  let inProduction;
  try { inProduction = booleanFlag(info.in_production); } catch { throw new Error('Project Info returned an unrecognised production status.'); }
  const tags = config.inProduction === inProduction ? config.tags : [...config.tags.filter(tag => !['PROD', 'DEV'].includes(tag.toUpperCase())), inProduction ? 'PROD' : 'DEV'];
  const notices = [];
  if (config.title !== undefined && config.title !== info.project_title) notices.push(`Title changed from ${JSON.stringify(config.title)} to ${JSON.stringify(info.project_title)}.`);
  if (config.inProduction !== undefined && config.inProduction !== inProduction) notices.push(inProduction ? `${config.title} moved to production. Its DEV tag is now PROD.` : `${config.title} moved back to development. Its PROD tag is now DEV.`);
  return { project: { ...rest, projectId: String(info.project_id), title: info.project_title, inProduction, tags }, notices };
}

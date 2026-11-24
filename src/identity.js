export function booleanFlag(value) {
  if ([true, 1, '1'].includes(value)) return true;
  if ([false, 0, '0'].includes(value)) return false;
  throw new Error('Unrecognised boolean flag returned by REDCap.');
}

export function validateIdentity(config, info) {
  const issues = [];
  if (info.project_title !== config.expectedTitle) issues.push(`Project title mismatch. Expected ${JSON.stringify(config.expectedTitle)}; received ${JSON.stringify(info.project_title)}.`);
  if (info.is_longitudinal !== undefined && booleanFlag(info.is_longitudinal)) issues.push('This project is longitudinal. This app supports classic projects only.');
  if (info.project_id === undefined || info.project_id === null || String(info.project_id) === '') issues.push('Project Info did not return a project ID.');
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

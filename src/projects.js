import { validateApiUrl } from './api.js';

const storageKey = 'redcap-toolkit.projects.v1';
const oldStorageKey = 'redcap-comparator.projects.v1';

export function containsTokenShape(text) {
  return /(?:^|[^\p{L}\p{N}])(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{64})(?=$|[^\p{L}\p{N}])/u.test(text);
}

// Explicitly select safe configuration fields. Never save the token.
// A project saved before project IDs were recorded keeps its expected title until the Projects drawer checks a token for it.
const savedFields = ({ id, projectId, title, inProduction, expectedTitle, tags, apiUrl }) => projectId ? { id, projectId, title, inProduction, tags, apiUrl } : { id, expectedTitle, tags, apiUrl };

export function writeProjects(storage, projects) {
  storage.setItem(storageKey, JSON.stringify(projects.map(savedFields)));
}

export function readProjects(storage) {
  const current = storage.getItem(storageKey), old = current === null ? storage.getItem(oldStorageKey) : null;
  if (old !== null) {
    const projects = parseProjects(old);
    // Remove the old key only after the new save succeeds, so a failed save is retried on the next load.
    try {
      writeProjects(storage, projects);
      storage.removeItem(oldStorageKey);
    } catch {}
    return projects;
  }
  return parseProjects(current);
}

function parseProjects(value) {
  const saved = JSON.parse(value || '[]');
  if (!Array.isArray(saved)) throw new Error('Saved configuration is not a list.');
  const ids = new Set();
  return saved.map(config => {
    const text = key => typeof config[key] === 'string' && config[key];
    const checked = config.projectId !== undefined ? text('projectId') && typeof config.title === 'string' && typeof config.inProduction === 'boolean' : text('expectedTitle');
    if (!checked || !text('id') || !text('apiUrl') || ids.has(config.id)) throw new Error('Saved configuration is incomplete or duplicated.');
    ids.add(config.id);
    const tags = config.tags ?? [config.phase, config.environment].filter(Boolean);
    if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) throw new Error('Saved tags are not a list of text.');
    return savedFields({ ...config, tags: [...new Set(tags.map(tag => tag.trim()).filter(Boolean))], apiUrl: validateApiUrl(config.apiUrl) });
  });
}

// How Tool pickers name a project. The project ID tells apart projects that share a title.
export function projectName(project) {
  return [project.projectId ? `${project.title} (PID ${project.projectId})` : `${project.expectedTitle} (project ID not checked)`, ...project.tags].join(' · ');
}

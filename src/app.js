import { mountProjects } from './projects-view.js';
import { mountRouter } from './router.js';
import { notice } from './dom.js';
import compareView from './compare-view.js';

// Startup only. This is the one module that looks up elements from the page.
const $ = id => document.getElementById(id);
const showNotice = (message, error = false) => notice($('notice'), message, error);
const projects = mountProjects($('projects'), { trigger: $('projects-trigger'), hostname: location.hostname, storage: localStorage, notice: showNotice });
const toolkit = { projects: projects.projects, onProjectsChange: projects.onProjectsChange, proxy: projects.proxy, notice: showNotice, showProjects: projects.show, setBusy: projects.setBusy };
// Schema comparison is listed first, so it is the default route. A new Tool is one more entry here.
const router = mountRouter({ nav: $('tool-links'), outlet: $('tools'), tools: [compareView], toolkit });

// The narrow-screen navbar toggle, in place of Tabler's JavaScript collapse.
const showTools = open => { $('navbar-tools').classList.toggle('show', open); $('nav-toggle').setAttribute('aria-expanded', String(open)); };
$('nav-toggle').addEventListener('click', () => showTools($('nav-toggle').getAttribute('aria-expanded') !== 'true'));
addEventListener('hashchange', () => { showTools(false); router.show(location.hash); });
router.show(location.hash);

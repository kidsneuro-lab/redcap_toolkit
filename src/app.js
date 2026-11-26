import { mountProjects } from './projects-view.js';
import { mountRouter } from './router.js';
import { notice } from './dom.js';
import compareView from './compare-view.js';
import templateView from './template-view.js';
import dictionaryView from './dictionary-view.js';
import recordView from './record-view.js';
import faqView from './faq-view.js';

// Startup only. This is the one module that looks up elements from the page.
const $ = id => document.getElementById(id);
const showNotice = (message, error = false) => notice($('notice'), message, error);
// The API URLs a token may be sent to, when the server that published the page lists them. Without the list, any HTTPS URL.
const apiUrls = document.querySelector('meta[name="redcap-api-urls"]')?.content.split(' ').filter(Boolean) ?? null;
const projects = mountProjects($('projects'), { trigger: $('projects-trigger'), hostname: location.hostname, storage: localStorage, apiUrls, notice: showNotice });
const toolkit = { projects: projects.projects, onProjectsChange: projects.onProjectsChange, proxy: projects.proxy, apiUrls, notice: showNotice, showProjects: projects.show, setBusy: projects.setBusy };
// Schema comparison is listed first, so it is the default route. A new Tool is one more entry here. The FAQ is a page, linked beside Projects.
const router = mountRouter({ nav: $('tool-links'), pageNav: $('page-links'), outlet: $('tools'), tools: [compareView, templateView, dictionaryView, recordView], pages: [faqView], toolkit });

// The narrow-screen navbar toggle, in place of Tabler's JavaScript collapse.
const showTools = open => { $('navbar-tools').classList.toggle('show', open); $('nav-toggle').setAttribute('aria-expanded', String(open)); };
$('nav-toggle').addEventListener('click', () => showTools($('nav-toggle').getAttribute('aria-expanded') !== 'true'));
addEventListener('hashchange', () => { showTools(false); router.show(location.hash); });
router.show(location.hash);

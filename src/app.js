import { mountProjects } from './projects-view.js';
import { notice } from './dom.js';
import compareView from './compare-view.js';

// Startup only. This is the one module that looks up elements from the page.
const $ = id => document.getElementById(id);
const showNotice = (message, error = false) => notice($('notice'), message, error);
const projects = mountProjects($('projects'), { storage: localStorage, notice: showNotice });
const toolkit = { projects: projects.projects, onProjectsChange: projects.onProjectsChange, notice: showNotice, showProjects: projects.show, setBusy: projects.setBusy };
compareView.mount($('tool'), toolkit);
// Until the Projects drawer arrives, keep the Projects area and notice where they appeared before the split.
$('projects-slot').replaceWith($('projects'));
$('notice-slot').replaceWith($('notice'));

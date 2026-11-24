// Outline icons from @tabler/icons 3.52.0 (MIT, vendor/tabler-icons/3.52.0/LICENSE): arrows-diff, download, key and plus.
const paths = {
  'arrows-diff': '<path d="M11 16h10"/><path d="M11 16l4 4"/><path d="M11 16l4 -4"/><path d="M13 8h-10"/><path d="M13 8l-4 4"/><path d="M13 8l-4 -4"/>',
  download: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/>',
  key: '<path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0"/><path d="M15 9h.01"/>',
  plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>'
};

export const icon = (name, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

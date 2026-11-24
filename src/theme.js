// A classic script loaded in <head> before the stylesheets, so the theme is set before first paint.
// A stored choice wins. Otherwise the page follows the system colour scheme, which Tabler's CSS does not do on its own.
(() => {
  const key = 'redcap-toolkit.theme', root = document.documentElement, media = matchMedia('(prefers-color-scheme: dark)');
  const stored = () => { try { return localStorage.getItem(key); } catch { return null; } };
  const sync = () => document.getElementById('theme-toggle')?.setAttribute('aria-pressed', String(root.getAttribute('data-bs-theme') === 'dark'));
  const apply = theme => { root.setAttribute('data-bs-theme', theme); sync(); };
  apply(stored() || (media.matches ? 'dark' : 'light'));
  media.addEventListener('change', () => { if (!stored()) apply(media.matches ? 'dark' : 'light'); });
  document.addEventListener('DOMContentLoaded', sync);
  document.addEventListener('click', event => {
    if (!event.target.closest('#theme-toggle')) return;
    const theme = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, theme); } catch {}
    apply(theme);
  });
})();

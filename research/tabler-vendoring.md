# Tabler: vendoring facts for a CSS-only, buildless use

Research for [issue #3](https://github.com/h-joshi/redcap_toolkit/issues/3), checked on 2026-11-24 against the npm tarballs, the tabler/tabler and tabler/tabler-icons GitHub repositories and docs.tabler.io.

## Answer in brief

- Pin `@tabler/core@1.7.5` (MIT) and vendor one file: `dist/css/tabler.min.css` (683,730 bytes, about 85 KB gzipped), plus a copy of the MIT `LICENSE` from the release tag.
- Do not vendor `tabler.min.js` (151,907 bytes) or `tabler-theme.min.js`. Every component the shell needs renders from CSS alone. The only behaviours we lose are the navbar collapse toggle on narrow screens, dropdowns, dismissible alerts and Bootstrap's tab panel keyboard handling. Each is a few lines of our own plain JavaScript, or can be avoided by design.
- Dark mode is a `data-bs-theme="dark"` attribute on `<html>`. The CSS does not follow `prefers-color-scheme` on its own, so a short inline script of our own sets the attribute.
- Icons are a separate MIT package, `@tabler/icons@3.52.0`. Paste the handful of outline SVGs we use inline (about 0.4 to 0.5 KB each) rather than vendoring the 516 KB webfont.
- Browser floor rises to Chrome/Edge 123, Firefox 128 and Safari 17.5.

## Version and licence

| Package | Latest | Published | Licence | Source |
| --- | --- | --- | --- | --- |
| `@tabler/core` | 1.7.5 | 2026-11-12 | MIT | `npm view @tabler/core`; GitHub release tag `@tabler/core@1.7.5` |
| `@tabler/icons` | 3.52.0 | 2026-11-14 | MIT | `npm view @tabler/icons`; GitHub release `v3.52.0` |

- The `@tabler/core` 1.x line moves quickly (1.7.0 on 2026-10-20, then four patch releases to 1.7.5), so pinning an exact version matters.
- The `@tabler/core` npm tarball has no `LICENSE` file. The licence is stated in `package.json` (`"license": "MIT"`), in a preserved `/*! ... */` banner at the top of `tabler.min.css` and in [`LICENSE` at the release tag](https://github.com/tabler/tabler/blob/%40tabler/core%401.7.5/LICENSE) ("Copyright (c) 2018-2026 The Tabler Authors"). Keep the banner and vendor that `LICENSE` next to the CSS.
- `@tabler/icons` ships its own `LICENSE` (MIT, "Copyright (c) 2020-2026 Paweł Kuna"). Each inline SVG keeps the `icon-tabler-*` class names, but MIT still asks for the notice, so vendor that `LICENSE` too.

## Which files to vendor

From the `@tabler/core@1.7.5` tarball (`dist/`):

| File | Raw bytes | gzip -9 | Needed? |
| --- | --- | --- | --- |
| `css/tabler.min.css` | 683,730 | 85,098 | Yes. The whole framework, including dark mode selectors |
| `css/tabler.css` | 790,298 | 90,866 | No. Unminified copy, only for reading |
| `css/tabler-themes.min.css` | 7,206 | 1,590 | No. Only for the `data-bs-theme-primary`, `-base`, `-radius` and `-font` switches |
| `css/tabler-flags`, `-payments`, `-socials`, `-marketing`, `-vendors` | 4 to 62 KB each | | No |
| `js/tabler.min.js` | 151,907 | 43,529 | No (see below) |
| `js/tabler-theme.min.js` | 1,402 | 751 | No. We replace it with our own few lines |

- `tabler.min.css` is self-contained. It has no `@import` and no `@font-face`; its only `url()` values are inline `data:image/svg+xml` URIs (select chevrons, check marks, close button). The font stack is the system UI stack (`system-ui, -apple-system, ... sans-serif`), so no web font files are needed.
- There is no smaller official "core only" build. Trimming the CSS would need a Sass build from `scss/`, which conflicts with staying buildless. At about 85 KB gzipped, the full file is acceptable.
- Suggested layout: `vendor/tabler/1.7.5/tabler.min.css` and `vendor/tabler/1.7.5/LICENSE`. Record the integrity hash so an upgrade or tampering is visible: `sha384-BY4EnLpEeqBnDZno/u4SjmwHqbv1/U9as69Q0Jk/zeaDJ8iV10NK7FP+6fFEGW4i` (SHA-256 `d1708c69e6b07a5a3138b8549bf64e00cd9d18c130b9b2ba2d9e294956f7c564`), computed from the npm tarball.
- `server.js` serves only an explicit `staticFiles` allowlist, so the vendored CSS path must be added there (AGENTS.md already requires this).
- The installation docs say not to load Bootstrap's own JS alongside Tabler's, because Tabler 1.7 bundles its own TypeScript fork of the Bootstrap components (`js/src/bootstrap/`) ([installation](https://docs.tabler.io/ui/getting-started/installation)). This only matters if Tabler JS is ever added.

## What works without Tabler's JS

The docs say the CSS "handles layout and components" while the script "adds the interactive parts such as dropdowns and modals" ([installation](https://docs.tabler.io/ui/getting-started/installation)). The `js/tabler.ts` entry point confirms the JS only initialises behaviour: Bootstrap's Alert, Button, Carousel, Collapse, Dropdown, Modal, NavOverflow, Offcanvas, Popover, ScrollSpy, Tab, Toast and Tooltip, plus Tabler extras (autosize, clipboard, datepicker, input mask, sortable and similar).

| Component | CSS only? | Notes |
| --- | --- | --- |
| Page layout, cards, badges, buttons | Yes | Pure classes |
| Tables (`.table`, `.table-responsive`) | Yes | Pure classes |
| Forms, native `<select class="form-select">`, checkboxes, switches | Yes | Chevrons and checks are data URIs in the CSS |
| Static alerts | Yes | Only the dismiss button (`data-bs-dismiss="alert"`) needs JS |
| Navbar on wide screens | Yes | `.navbar-expand-md .navbar-collapse { display: flex !important }` at 768 px and above |
| Navbar on narrow screens | No | `.collapse:not(.show) { display: none }`, so below the breakpoint the links stay hidden until something adds `.show`. Replace the Collapse plugin with our own click handler that toggles `.show` and `aria-expanded`, or skip `.collapse` so links always show |
| Tabs as navigation links (`.nav-tabs`, `.nav-link`) | Yes | Fits our hash routes (`#/compare`, `#/template`): plain links with `aria-current="page"` set by our router |
| Tab panels (`.tab-content > .tab-pane`) | Partly | CSS shows only `.active` panes. Switching, `aria-selected`, roving `tabindex` and arrow, Home and End keys come from Bootstrap's Tab plugin (`js/src/bootstrap/tab.ts`) and would need our own code |
| Dropdowns | No | Need the Dropdown plugin and Popper. Avoid, or use `<details>` or our own toggle |
| Modals, offcanvas, tooltips, popovers, toasts | No | Avoid, or use native `<dialog>` and `title` |
| Searchable select | No | Tabler uses Tom Select, a third-party library ([advanced select](https://docs.tabler.io/ui/plugins/advanced-select)). Use a native `<select>` |

## Dark mode

- Tabler switches colour mode with a `data-bs-theme` attribute on `<html>` (or any element). `tabler.min.css` contains `[data-bs-theme=dark]` rules and `color-scheme: dark`, but no `prefers-color-scheme` media query, so the CSS alone never follows the operating system setting.
- `tabler-theme.js` provides the "auto" behaviour: it reads `?theme=` from the URL or `tabler-theme` from `localStorage`, otherwise checks `prefers-color-scheme`, sets `data-bs-theme`, and listens for OS changes. The docs say to load it synchronously as the first thing in `<body>` to avoid a flash of the light theme ([colour modes](https://github.com/tabler/tabler/blob/dev/docs/content/ui/getting-started/color-modes.mdx)).
- The script also loops over eleven other settings (`theme-primary`, `layout`, `navbar-position` and others), copying any matching URL parameter into `localStorage`. We need none of that, so our own few lines (read a stored choice, fall back to `matchMedia('(prefers-color-scheme: dark)')`, set the attribute, listen for `change`) are smaller and keep storage under our control. It must run before first paint, so it should be a small classic inline or blocking script, not the deferred module.
- Per-element dark sections also work without JS, for example `<header class="navbar" data-bs-theme="dark">`.

## Icons

- Icons are a separate package, `@tabler/icons` (5,491 outline and 1,054 filled SVGs at 3.52.0). `@tabler/core` does not include them, but its CSS styles them through the `.icon` class (1.25 rem, `stroke-width: 1.5`).
- Options from the [icons docs](https://docs.tabler.io/icons) and [SVG static files](https://docs.tabler.io/icons/static-files/svg):
  - Inline SVG copied from `icons/outline/<name>.svg`. Each is 0.36 to 0.54 KB for typical icons (home, database, sun, moon, check, alert-triangle, file-download, arrows-diff). Uses `stroke="currentColor"`, so it follows text colour and dark mode.
  - SVG sprite (`@tabler/icons-sprite`) with `<use href="...#tabler-name">`: the full sprite is large and would need trimming by hand.
  - Webfont (`@tabler/icons-webfont`): `tabler-icons.woff2` alone is 516 KB plus a 247 KB CSS file. Far too heavy for a few icons.
- Recommendation: paste the dozen or so SVGs we need inline into `index.html` (or a small `<template>` set), add `class="icon"` and `aria-hidden="true"`, and drop the `width`, `height` and `stroke-width` attributes if we want `.icon` sizing to apply. Record the icon names and version 3.52.0 in a comment, and vendor the icons `LICENSE`.

## Accessibility caveats

- Tabler's own [navbar docs](https://github.com/tabler/tabler/blob/dev/docs/content/ui/layout/navbars.mdx) recommend wrapping each navigation region in `<nav aria-label="...">` and marking the current page with `aria-current="page"`, but the sample markup does neither: it uses `<header class="navbar">` with a bare `<ul class="navbar-nav">` and marks the current item only with `.active` on the `<li>`. Add the `<nav>` and `aria-current` ourselves.
- The toggler relies on Bootstrap to manage `aria-expanded` ("Bootstrap manages `aria-expanded`"). Without Tabler's JS our handler must update it and keep `aria-controls` pointing at the collapsing element.
- The [navs and tabs docs](https://github.com/tabler/tabler/blob/dev/docs/content/ui/layout/navs-tabs.mdx) say to use `role="tablist"` only when links switch panels on the same page. For our hash-routed Tools, `.nav-tabs` should stay a list of links in a `<nav>` with `aria-current="page"`, not ARIA tabs, which removes the need for arrow-key handling.
- Icon-only controls need an `aria-label` on the button or link, not the SVG ([icon docs](https://github.com/tabler/tabler/blob/dev/docs/content/ui/components/icon.mdx)).
- The docs note that some primary colours do not reach WCAG AA contrast with white text. Keep the default blue unless contrast is rechecked ([colour modes](https://github.com/tabler/tabler/blob/dev/docs/content/ui/getting-started/color-modes.mdx)).
- The CSS honours `prefers-reduced-motion: reduce` throughout (105 rules).

## Browser support

The [`.browserslistrc` at the 1.7.5 tag](https://github.com/tabler/tabler/blob/%40tabler/core%401.7.5/.browserslistrc) sets the floor at Chrome and Edge 123, Firefox 128, Safari and iOS 17.5, Opera 109 and Samsung Internet 27, because the CSS uses `light-dark()`, `@property`, `:has()`, `color-mix()` and relative `oklch(from ...)` with no fallback. Older browsers will render a broken layout rather than degrade gracefully. This is a new constraint compared with the current hand-written `styles.css` and should be stated in the README.

## Sources

- npm registry: `npm view @tabler/core`, `npm view @tabler/icons`, `npm view @tabler/icons-webfont`, and `npm pack` tarballs of `@tabler/core@1.7.5`, `@tabler/icons@3.52.0` and `@tabler/icons-webfont@3.52.0` (file sizes, CSS and JS contents measured locally).
- GitHub: [tabler/tabler](https://github.com/tabler/tabler) (release `@tabler/core@1.7.5`, `LICENSE`, `.browserslistrc`, `core/js/tabler.ts`, `core/js/src/bootstrap/tab.ts`, `core/js/tabler-theme.ts`, docs sources under `docs/content/ui/`) and [tabler/tabler-icons](https://github.com/tabler/tabler-icons) (release `v3.52.0`, MIT).
- docs.tabler.io: [installation](https://docs.tabler.io/ui/getting-started/installation), [icons](https://docs.tabler.io/icons), [SVG static files](https://docs.tabler.io/icons/static-files/svg).

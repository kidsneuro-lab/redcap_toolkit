# Working instructions

## Communication

- Always use Australian English when responding in English, including documentation and user-facing text.
- Challenge factual errors, weak assumptions and bugs directly before building on them. Disagree when there is a concrete reason, without inventing objections.
- Prioritise accuracy over confidence. State uncertainty explicitly and verify claims that depend on changing information or uncertain recollection.
- Ask for clarification when plausible interpretations would materially change the work. Infer routine details from the existing context.
- Correct mistakes plainly, without excessive apologies or hedging.
- Explain non-obvious technical reasoning and the evidence behind conclusions.
- Do not wrap code lines to satisfy a line-length limit.

## Scope and sources

This app has two Tools for classic REDCap projects, without longitudinal events or arms: Schema comparison compares the schemas of any two projects, and Upload template produces a header-only CSV for importing data into one instrument.

- Preserve the single-page HTML, CSS and plain JavaScript implementation. Keep it buildless, with the vendored Tabler CSS in `vendor/` as its only third-party file and no Tabler JavaScript, unless the user requests a change that warrants another approach.
- Read [README.md](README.md) before changing setup, deployment, storage or report behaviour. Use `package.json` as the source of truth for runnable commands.
- Keep version 1 focused on five exports: Project Info, Instruments, Repeating Instruments and Events, and Metadata for Schema comparison, and Project Info, Metadata, Repeating Instruments and Events, and Export Field Names (`exportFieldNames`) for Upload template. Survey setup, XML comparison, events, arms and saved baseline comparison require an explicit scope change.
- Describe agreement only within the exported settings. Current schema equality cannot establish change history, a prior baseline or compliance with a change specification. Specification review remains manual.

## Read-only REDCap access

- Every REDCap operation must be a read-only export. Never call API methods that import, delete, rename, lock or otherwise change project data, settings, users or files, in application code, the proxy, tests or live checks.
- Generated files such as upload templates are downloads for people to use elsewhere. The app must not submit them to REDCap.

## Implementation boundaries

- Keep comparison rules in `src/compare.js`, Upload template column rules in `src/template.js` and identity rules in `src/identity.js`, all independent of the DOM, storage and network. Keep saved project configuration in `src/projects.js`, with storage passed in.
- Keep API requests and response validation in `src/api.js`. Keep the Projects drawer, session tokens and the proxy switch in `src/projects-view.js`, hash routing in `src/router.js`, comparison orchestration, filters and report downloads in `src/compare-view.js`, and Upload template orchestration, field selection and CSV downloads in `src/template-view.js`.
- Each Tool view exports `{ id, title, mount(container, toolkit) }` and reaches projects, tokens, notices and the Projects area only through `toolkit`. Views touch the DOM only inside `mount`. `src/app.js` is startup only and the one module that looks up elements from the page.
- Keep `server.js` optional for static hosting. When adding a browser module or asset, update its explicit static-file allowlist so the local server can serve it.
- Render exported labels, logic, annotations and HTML as text. Preserve keyboard access and explicit reference and comparison labels.

## Comparison rules

- Validate both projects before requesting their remaining schema exports. Require exact configured title matches. Tags are optional descriptive labels and must not validate production status.
- Reject duplicate underlying projects and longitudinal configuration. Allow any two distinct classic projects regardless of tags or comparison group.
- Match instruments by `instrument_name`, repeating instruments by `form_name`, and fields globally by `field_name`. A field moving between instruments is a change. A renamed field is a reference-only field and a comparison-only field.
- Compare the union of exported property names. Preserve exact text and distinguish an absent property, an empty string and `null`.
- Compare relative order among shared entities. Adding a field alone must not mark later shared fields as reordered.
- Include field differences in instrument summaries. Keep entity counts separate from changed-property counts.
- Keep expected identity and lifecycle differences inspectable. Treat other project-setting differences as requiring review rather than assigning unsupported clinical severity.
- Treat a successful empty repeating export as no repeating instruments. Treat failed, malformed or incomplete exports as an incomplete comparison, never a match.
- Keep retrieval times and coverage limitations in reports. Separate API exports are not an atomic snapshot.

## Storage and credentials

- Store project configuration in browser local storage. Keep API tokens in session memory and exclude tokens from persisted configuration, report downloads, logs and URLs.
- Keep fixtures and demo data synthetic. Use authorised credentials only for a specifically authorised live integration check.
- Preserve HTTPS API requests with form-encoded POST bodies and redirect refusal.
- Keep the local proxy bound to loopback, restricted to explicitly allowed API URLs and the five read-only export operations. Preserve host and origin checks and generic upstream error messages.
- Treat CORS as a server permission requirement. Use the optional proxy when needed rather than weakening browser security.

## Verification and delivery

- For behaviour changes, run `npm test` and add meaningful regression coverage for changed comparison or API contracts. Documentation-only changes need a content and link check rather than an application test run.
- Exercise the demo and affected interactions in a browser when available. Server handler tests do not establish browser rendering, actual socket behaviour or live REDCap compatibility.
- Report which checks passed and which could not run. Describe environment restrictions as verification limits, not permanent project requirements.
- Update the README when setup, storage, security boundaries, report semantics or supported scope changes.

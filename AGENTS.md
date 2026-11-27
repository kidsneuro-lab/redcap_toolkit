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

This app has four Tools for classic REDCap projects, without longitudinal events or arms: Schema comparison compares the schemas of any two projects, Upload template produces a header-only CSV for importing data into one instrument, Data dictionary shows the fields of selected instruments for correct data entry, and Record viewer shows one entered record across all instruments. A FAQ page, which is not a Tool, shows `FAQ.md`.

- Preserve the single-page HTML, CSS and plain JavaScript implementation. Keep it buildless, with the vendored Tabler CSS in `vendor/` as its only third-party file and no Tabler JavaScript, unless the user requests a change that warrants another approach.
- Read [README.md](README.md) before changing setup, deployment, storage or report behaviour. Use `package.json` as the source of truth for runnable commands.
- Keep version 1 focused on six exports: Project Info, Instruments, Repeating Instruments and Events, and Metadata for Schema comparison; Project Info, Metadata, Repeating Instruments and Events, and Export Field Names (`exportFieldNames`) for Upload template; Project Info, Instruments and Metadata for Data dictionary; and Project Info, Instruments, Metadata, Export Field Names and Records (`record`) for Record viewer. Survey setup, XML comparison, events, arms and saved baseline comparison require an explicit scope change.
- Describe agreement only within the exported settings. Current schema equality cannot establish change history, a prior baseline or compliance with a change specification. Specification review remains manual.

## Read-only REDCap access

- Every REDCap operation must be a read-only export. Never call API methods that import, delete, rename, lock or otherwise change project data, settings, users or files, in application code, the proxy, tests or live checks.
- Generated files such as upload templates are downloads for people to use elsewhere. The app must not submit them to REDCap.
- A Records export names exactly one record, with `type=flat` and `rawOrLabel=raw`, and is refused in `src/api.js` and the proxy otherwise. Never add a whole-project, multi-record, filtered or record-listing export.

## Implementation boundaries

- Keep comparison rules in `src/compare.js`, Upload template column rules in `src/template.js`, Data dictionary rules in `src/dictionary.js`, Record viewer rules in `src/record.js`, FAQ markdown rules in `src/faq.js` and identity rules in `src/identity.js`, all independent of the DOM, storage and network. Keep saved project configuration in `src/projects.js`, with storage passed in.
- Keep API requests and response validation in `src/api.js`. Keep the Projects drawer, session tokens and the proxy switch in `src/projects-view.js`, hash routing in `src/router.js`, comparison orchestration, filters and report downloads in `src/compare-view.js`, Upload template orchestration, field selection and CSV downloads in `src/template-view.js`, Data dictionary orchestration, instrument selection, filter, search and sorting in `src/dictionary-view.js`, Record viewer orchestration, record lookup, toggles and clearing in `src/record-view.js`, and the FAQ page in `src/faq-view.js`.
- Each Tool view exports `{ id, title, mount(container, toolkit) }`, where `mount` may return `{ leave }` for state that must be cleared when the Tool is hidden, and reaches projects, tokens, notices and the Projects area only through `toolkit`. Views touch the DOM only inside `mount`. `src/app.js` is startup only and the one module that looks up elements from the page.
- Keep `server.js` optional for static hosting. When adding a browser module or asset, update its explicit static-file allowlist so the local server can serve it.
- Pages that are not Tools, such as the FAQ, are passed to the router as `pages` and linked beside Projects, not in the Tools menu.
- Keep `FAQ.md` within the markdown subset listed in its opening comment. Render it as text-only elements, never as HTML, and allow only HTTPS, relative and `#/` route links.
- Render exported labels, logic, annotations and HTML as text. Preserve keyboard access and explicit reference and comparison labels.

## Comparison rules

- Identify a saved project by its API URL and REDCap project ID. Validate both projects' project IDs before requesting their remaining schema exports. The title comes from Project Info and is for display only; a title change must not block a Tool.
- Check every token against Project Info in the Projects drawer before keeping it. Only the drawer refreshes saved titles, production status and the derived PROD or DEV tag; Tools never write to saved configuration.
- Tags are descriptive labels. The derived PROD or DEV tag records the last checked production status; tags must not restrict comparisons.
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
- Record data may identify people. Keep record values and record IDs in page memory only while shown, and never write them to storage, URLs, logs, downloads, tests or fixtures other than synthetic ones.
- Keep fixtures and demo data synthetic. Use authorised credentials only for a specifically authorised live integration check.
- Preserve HTTPS API requests with form-encoded POST bodies and redirect refusal.
- Keep the local proxy bound to loopback, restricted to explicitly allowed API URLs, the six read-only export operations and their permitted parameters. Preserve host and origin checks and generic upstream error messages.
- Treat CORS as a server permission requirement. Use the optional proxy when needed rather than weakening browser security.

## Verification and delivery

- For behaviour changes, run `npm test` and add meaningful regression coverage for changed comparison or API contracts. Documentation-only changes need a content and link check rather than an application test run.
- Exercise the demo and affected interactions in a browser when available. Server handler tests do not establish browser rendering, actual socket behaviour or live REDCap compatibility.
- Report which checks passed and which could not run. Describe environment restrictions as verification limits, not permanent project requirements.
- Update the README when setup, storage, security boundaries, report semantics or supported scope changes.

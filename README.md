# REDCap Toolkit

A single-page app using HTML, CSS and plain JavaScript, with read-only tools for classic REDCap projects. **Schema comparison** compares schemas from any two classic REDCap projects. **Upload template** produces a header-only CSV for importing data into one instrument of a project. **Data dictionary** shows the fields of one or more instruments so values can be entered correctly. **Record viewer** shows one record's values across all instruments so new data can follow existing conventions. No framework, build step or package installation is required.

The interface uses [Tabler](https://tabler.io) 1.7.5 CSS, vendored in `vendor/tabler/1.7.5/` with its MIT licence (sha384 `BY4EnLpEeqBnDZno/u4SjmwHqbv1/U9as69Q0Jk/zeaDJ8iV10NK7FP+6fFEGW4i`). Tabler's JavaScript is not used. The few icons are inline outline SVGs from `@tabler/icons` 3.52.0, whose MIT licence is in `vendor/tabler-icons/3.52.0/`.

The **FAQ** page, linked beside Projects, shows [FAQ.md](FAQ.md): the REDCap version the toolkit was tested against, common errors and a summary of its security measures.

Supported browsers: Chrome and Edge 123, Firefox 128 and Safari 17.5 or later. Tabler's CSS relies on `light-dark()`, `:has()`, `color-mix()` and relative colours without fallbacks.

## Run locally

Requires Node.js 22 or later.

```sh
npm start
```

Open <http://127.0.0.1:4173>. Tools are listed in the navbar and each has its own address, such as `#/compare`. Select **Explore demo** to try the complete report using synthetic data without contacting REDCap. The moon button switches between light and dark themes; until you choose, the page follows your system setting, and your choice is remembered in this browser.

Use the **Projects** button in the navbar to add each project. It shows how many session tokens are entered, in orange while any is missing and green when all are entered. A Tool that needs a missing token opens the Projects drawer. Enter the HTTPS API URL, the REDCap project ID (PID) and the API token. Saving requests Project Info with that token and keeps the project only when Project Info returns the same project ID for a classic project. The title shown in the drawer and the Tools comes from Project Info, and a `PROD` or `DEV` tag is added from its production status. A token that fails the check is discarded, and a project with the same API URL and project ID as one already saved is refused. Optionally add comma-separated tags such as a study name. The token needs API export privileges for the requested exports. Select any two distinct projects as reference and comparison, then select **Compare projects**. Tags do not restrict pairings.

Each token entered later, such as after a reload, is checked the same way. If the title has changed in REDCap, the saved title is updated and a notice says so. If the production status has changed, any `PROD` or `DEV` tag is replaced and a notice says so. The tag is added only when the status changes, so a tag you remove stays removed while the status is the same. Tags can be edited without a token. Changing a project's API URL or project ID makes it a different project, so its token is checked again before saving. The Tools only check the project ID and that the project is classic; they never change saved configuration.

Project configuration (API URL, project ID, title, production status and tags) is saved in browser local storage. Existing phase/group and environment labels are loaded as tags and saved in that format on the next configuration change. Projects saved before project IDs were recorded keep their expected title, drop their display label and are listed as **Project ID not checked**. A Tool cannot use one until its token is entered in the Projects drawer; that first check also requires the old expected title to match exactly, then records the project ID. Configuration saved by earlier versions under `redcap-comparator.projects.v1` moves to `redcap-toolkit.projects.v1` on the next load; the old entry is removed only after the new one is saved. Tokens are kept in memory and must be entered again after a reload. The token field is masked but is not a password field, has autocomplete off and asks common password manager extensions to ignore it, so that it is not saved with your passwords. Spellcheck is off in every project field, so their text is not sent to a cloud spellcheck service. Tokens are excluded from saved configuration and downloaded reports. Project removal is immediate. Use the same host and port to return to the same browser configuration.

The Projects form refuses to save a tag containing a standalone run of exactly 32 or 64 hexadecimal characters. Paste REDCap tokens into the **API token** field.

## Direct API access and the optional proxy

The default mode sends form-encoded HTTPS POST requests directly from the browser to REDCap. Your REDCap installation must permit the app's origin through CORS. The app cannot bypass browser restrictions. Serve the page over HTTP locally or HTTPS internally; do not open `index.html` as a file.

If direct access is blocked, stop the server and restart with an explicit allowlist of the REDCap API URLs. These are endpoint URLs, not tokens.

```sh
REDCAP_API_URLS='https://redcap.example.org/api/' npm start
```

Separate multiple API URLs with commas. Then enable **Use local proxy** in the Projects drawer.

`REDCAP_API_URLS` is also the allowlist of URLs that may receive a token, whether or not the proxy is used. When it is set, the page's Content Security Policy permits connections only to those URLs' origins and a project cannot be saved with any other API URL. A saved project with another URL is shown as blocked and offers no token entry. No request containing a token is made to an unlisted URL. Without the variable, any HTTPS API URL is accepted, as before. The switch appears only when the page is served from `127.0.0.1` or `localhost`. The proxy forwards only the six read-only export operations (Project Info, Instruments, Repeating Instruments and Events, Metadata, Export Field Names and Records), which the Tools share, to the configured HTTPS URLs. It refuses any parameter it does not expect, and a Records request unless it names exactly one record with `type=flat` and `rawOrLabel=raw`. It refuses redirects, checks request origins and binds to loopback. Tokens pass through memory and are not logged or written to disk. Do not expose this development server to the network. Internal hosting should use a managed server with equivalent restrictions and HTTPS.

The static page and `src/` modules can also be hosted without Node. In that case direct browser access is required unless the host provides the optional `/api/export` contract. The **Use local proxy** option is intended for the supplied local server.

## Record data

The other exports return project schema and settings only. The Records export, used by the Record viewer, returns participant data, which may identify people.

- Each request names exactly one record ID that the person typed. `src/api.js` and the proxy both refuse a Records request without exactly one record, so the toolkit cannot export a whole project, list record IDs or filter records.
- Values are requested raw (`rawOrLabel=raw`) in the flat format. REDCap applies the token's user rights, including Data Access Groups and export restrictions.
- REDCap writes each Records export to the project's Logging, so every lookup is visible to project users and auditors.
- Record values and record IDs are held in page memory only while shown. They are never written to browser storage, URLs, logs or downloads.

## GitHub Pages

Every push to `main` that passes the **Test** workflow is released to GitHub Pages by the **Release** workflow, which can also be run manually. It publishes exactly the files in the static-file allowlist in `server.js`, so a new browser module or asset must be added there. Pages must be enabled with **GitHub Actions** as the source.

- **Public site and repository.** The published site and its source repository are both public, so the FAQ's links to this README work for anyone. The page holds no secrets; tokens exist only in the visitor's browser memory.
- **Fewer security headers.** Pages cannot send custom headers, so the Content Security Policy and `no-referrer` policy are set with `<meta>` tags in `index.html`. `frame-ancestors` and `X-Content-Type-Options: nosniff` cannot be set this way, so the hosted page can be framed by other sites and does not have MIME sniffing disabled. The local server sends the full headers.
- **Shared browser storage.** Every Pages site under the same `<account>.github.io` origin shares local storage, so another Pages site on the account could read saved project configuration (API URLs, project IDs, titles, production status and tags, never tokens). Project titles may be sensitive. Do not host untrusted Pages sites under the same account.
- **No proxy.** The **Use local proxy** switch is hidden on the hosted page. If a request fails at the network level there, the page says "This REDCap may not allow requests from this site. Run the toolkit locally with the proxy (see README)." In that case follow [Direct API access and the optional proxy](#direct-api-access-and-the-optional-proxy).

## What the report means

- Project Info must return each project's saved project ID. Identity failure blocks the remaining exports. A title change does not. Downloaded reports record each project's title, tags, API URL and project ID, with validation `project ID verified`.
- The same underlying project cannot be compared with itself. Longitudinal projects and event-specific repeating configuration are rejected.
- Project settings compare the union of returned properties. Project ID, title, production flag, creation time and production time are marked as expected identity or lifecycle differences. They remain visible. Other differences require manual review; the app does not assign clinical severity.
- Instruments are matched by `instrument_name`. Labels, order and field change summaries are compared.
- Repeating instruments are matched by `form_name`, including custom repeat labels. A successful empty export means no repeating instruments.
- Fields are matched globally by `field_name`. All exported properties, instrument membership and relative order among shared fields are compared. Inserting a field does not by itself reorder existing fields. Renaming a field appears as a reference-only field and a comparison-only field.
- Text comparisons are exact. Missing properties, empty strings and null values are distinct. The app does not normalise whitespace, branching logic, choices or embedded HTML. Exported HTML is displayed as text.
- Counts distinguish changed or unmatched entities from changed properties. Whole entities present on only one side are not counted as individual changed properties. Instrument counts also include instruments whose field definitions differ.
- Failed or malformed exports produce an incomplete comparison, never a match. A comparison times out after 90 seconds. Proxy upstream requests time out after 30 seconds.

Reference-only and comparison-only describe presence, not change history. Current project exports cannot prove the baseline used, the process by which a change was applied or compliance with a change specification. Review against the specification remains manual.

Survey setup, XML, events, arms, instrument-event mappings and saved baseline comparisons are outside version 1. The four exports are separate requests, not an atomic snapshot. Avoid making schema changes while a comparison runs. Downloaded JSON includes both source schemas, differences, project identities, validation status and retrieval times. Treat those reports according to your organisation's information-handling requirements.

By default, **Download report** replaces the principal investigator's first name, surname and email address, IRB number, grant number and project notes with `[omitted from download]` wherever those Project Info properties appear in the exported snapshots and comparison rows. The JSON records which properties were omitted in `coverage.omittedProjectInfoProperties` and retains property presence, change status and counts. The on-screen comparison still shows the original values.

To include the original values in the JSON, tick **Include sensitive Project Info values in download** before selecting **Download report**. The option starts unticked for every comparison. Other exported fields, such as project titles and field annotations, may still contain sensitive information.

## Upload template

Open **Upload template** in the navbar (`#/template`) and choose a project. Its Project Info must return the saved project ID before Metadata, Repeating Instruments and Events and Export Field Names are requested; a project without a session token opens the Projects drawer instead. Choose an instrument, then **All importable fields** or **Selected fields**. The field table lists every field of the instrument in Metadata order, with excluded fields struck through and their reason, `@READONLY` fields badged and the number of columns each checkbox produces. In Selected fields nothing is ticked at first, including `<instrument>_complete`, and **Download CSV** stays disabled until a field is ticked. Ticked fields are kept when you switch between the two modes and cleared when you change instrument or project. The preview shows the header row, column count and filename, `<instrument>_upload_template_<YYYY-MM-DD>.csv`, which never contains the project title.

**Explore demo** loads the synthetic "Example project DEV (demo, synthetic)" without contacting REDCap. It is not added to your projects, and its downloads start with `demo_`.

The CSV is a template only. Fill in data rows and import it with REDCap's Data Import Tool yourself; this app never sends data to REDCap.

### Upload template columns

- Column names come from REDCap's Export Field Names (`exportFieldNames`) export, so checkbox columns are named exactly as REDCap names them, for example `symptoms____9` for code `-9`. An importable field missing from that export stops the template rather than leaving out its column.
- The record ID is always the first column, even when the chosen instrument does not contain it.
- `redcap_repeat_instrument` and `redcap_repeat_instance` follow the record ID only when the chosen instrument is repeating.
- Descriptive, file upload, signature, calculated and `@CALCTEXT` fields are left out because REDCap cannot import values into them. `@READONLY` fields are kept: the tag limits data entry, not import.
- `<instrument>_complete` is the last column. With selected fields, columns follow Metadata order whatever order they were ticked in.
- The CSV is one header row, comma-separated, with a CRLF line ending, in UTF-8 without a byte order mark.
- `redcap_data_access_group` is not included. For a project with Data Access Groups, add that column by hand after the record ID (and repeat columns) if you need it.

## Data dictionary

Open **Data dictionary** in the navbar (`#/dictionary`) and choose a project. Its Project Info must return the saved project ID before Instruments and Metadata are requested; a project without a session token opens the Projects drawer instead. A failed or malformed export shows an error and no table. **Explore demo** shows the synthetic demo project without contacting REDCap.

All instruments are ticked at first. Untick instruments, or use **Select all** and **Clear**, to narrow the table. Each row shows the variable name, the instrument label and name, the field label, the type with any validation, for example `text (date_dmy)`, the choices as code and label, whether the field is required and any minimum and maximum. Labels and choices are shown as text, never as HTML. Yes/no and true/false fields show their fixed codes, which REDCap does not export. Checkbox fields note that an upload has one column per option; Upload template gives their exact column names.

**Hide free-text and non-entry fields** is ticked at first. It hides notes fields, text fields without validation and descriptive, file upload or calculated fields, so the table shows the fields whose codes or formats must be entered exactly. Validated text fields, such as dates and numbers, stay visible, and the record ID is always shown. **Search** matches any part of a field name, field label or choice label, ignoring case.

Select the Variable, Instrument, Field label or Type heading to sort by it. The first selection sorts ascending, the second descending and the third returns to Metadata order. Instrument sorts by label. The table cannot be downloaded; REDCap's own data dictionary download has the complete file.

## Record viewer

Open **Record viewer** in the navbar (`#/record`) and choose a project. Its Project Info must return the saved project ID before Instruments, Metadata and Export Field Names are requested; a project without a session token opens the Projects drawer instead. Type a record ID and select **View record** or press Enter. Only then is the record requested, and only that one record (see [Record data](#record-data)). There is no list of records to choose from. **Explore demo** shows a synthetic record without contacting REDCap.

The record is shown as one block per instrument, in instrument order, with fields in Metadata order. Each instance of a repeating instrument has its own block. A block heading shows the instrument status with its code, for example "Complete (2)". A repeating instrument with no instances is shown as one block of empty fields, because the toolkit does not read the repeating setup for this Tool.

- Values are shown as the API exports them: coded values as the raw code with its label, for example `2 Female`, and checkboxes as their ticked codes. Dates are always `YYYY-MM-DD` whatever the field's display format, which is the API's default import format. Validated text fields show their validation type.
- **Hide empty fields** is ticked at first. The record ID is always shown.
- Fields marked as identifiers in the data dictionary are masked until **Show identifiers** is ticked, which resets for each lookup. The masked value is not put in the page. This guards against a value being seen over a shoulder or a shared screen. It is not access control; the token's user rights decide what REDCap returns.
- A field missing from the export, for example because the token's user rights remove identifiers, is shown as "Not exported with this token's rights", never as empty.
- REDCap returns nothing both for a record that does not exist and for one outside the token's Data Access Group, so either shows "No record with this ID is available to this token".
- The shown record and its ID are cleared on a new lookup, on choosing another project and on leaving the Tool. There is no download or copy button.

## Verification

```sh
npm test
```

The dependency-free tests cover comparison semantics, Upload template column rules, Data dictionary filter, search, choice and sort rules, Record viewer blocks, values and absent fields, FAQ markdown parsing, including that `FAQ.md` uses only the supported syntax, identity checks, Projects drawer token checks, PROD and DEV tags, optional tags, legacy configuration migration, report downloads, malformed API responses, credential handling and the actual server/proxy request handler using a synthetic upstream, and that the GitHub Pages site publishes exactly the files the page loads. View tests mount the router, the Projects drawer, Schema comparison, Upload template, Data dictionary, Record viewer and the FAQ page into one shared minimal fake DOM (`test/dom.js`) with synthetic storage and exports; they do not establish browser rendering or live REDCap compatibility. Handler tests do not bind a network port, so they can run in restricted sandboxes. Live REDCap verification requires your installation and authorised tokens. Browser rendering and interaction should also be checked on the browsers used by your team.

## Licence

REDCap Toolkit is released under the [MIT licence](LICENSE). The vendored Tabler CSS and the Tabler Icons are also MIT licensed, with their licences in `vendor/`. Report issues on [GitHub](https://github.com/kidsneuro-lab/redcap_toolkit/issues), linked by the GitHub icon beside the FAQ.

## Files

- `LICENSE`: the MIT licence for this project.
- `FAQ.md`: the FAQ page's content, fetched by the page at runtime. Only the markdown listed in its opening comment is supported.
- `index.html` and `toolkit.css`: single-page interface. `toolkit.css` holds the few rules the vendored Tabler CSS lacks.
- `vendor/`: Tabler CSS and the Tabler and Tabler Icons licences.
- `src/app.js`: startup only. Mounts the Projects drawer and the router and connects Tools through `toolkit`.
- `src/router.js`: hash routes and navbar links. Each Tool, and the FAQ page, is mounted on its first visit, then hidden and shown, and a Tool that asks is told when it is hidden; unknown routes open Schema comparison.
- `src/theme.js`: sets the light or dark theme before first paint. A classic script, because the CSP blocks inline scripts.
- `src/projects-view.js`: the Projects button and drawer: saved project configuration, session tokens and the proxy switch.
- `src/icons.js`: inline Tabler icons used by the views.
- `src/compare-view.js`: the Schema comparison Tool: comparison orchestration, filters and report downloads.
- `src/template-view.js`: the Upload template Tool: identity check, exports, field selection, preview and CSV download.
- `src/dictionary-view.js`: the Data dictionary Tool: identity check, exports, instrument selection, filter, search and sorting.
- `src/record-view.js`: the Record viewer Tool: identity check, exports, record lookup, empty field and identifier toggles, and clearing the record.
- `src/faq-view.js`: the FAQ page: fetches `FAQ.md` and shows it as text-only elements.
- `src/dom.js`: small DOM helpers used by the views.
- `src/compare.js`: pure comparison rules.
- `src/template.js`: pure Upload template column rules and CSV serialisation.
- `src/dictionary.js`: pure Data dictionary rules: which fields are shown, choice parsing, search and sort order.
- `src/record.js`: pure Record viewer rules: blocks per instrument and instance, values with labels, and absent versus empty fields.
- `src/faq.js`: pure FAQ rules: the supported markdown subset, allowed links and reporting of unsupported syntax.
- `src/identity.js`: pure project identity rules.
- `src/projects.js`: reading and writing saved project configuration, with storage passed in.
- `src/api.js`: API requests and response validation.
- `src/demo.js`: synthetic demonstration data.
- `server.js`: local static server, optional restricted proxy and the file list published to GitHub Pages.
- `test/`: repeatable automated checks.

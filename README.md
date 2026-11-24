# REDCap schema comparator

A single-page app using HTML, CSS and plain JavaScript. Compares schemas from any two classic REDCap projects. No framework, build step or package installation is required.

## Run locally

Requires Node.js 22 or later.

```sh
npm start
```

Open <http://127.0.0.1:4173>. Select **Explore demo** to try the complete report using synthetic data without contacting REDCap.

Use **Manage projects** to add each project. Set the exact expected REDCap title, HTTPS API URL and API token. Optionally add comma-separated tags such as DEV, PROD or a study name. The token needs API export privileges for the requested exports. Select any two distinct projects as reference and comparison, then select **Compare projects**. Tags do not restrict pairings or validate REDCap production status.

Project configuration, including tags, is saved in browser local storage. Existing phase/group and environment labels are loaded as tags and saved in that format on the next configuration change. Configuration saved by earlier versions under `redcap-comparator.projects.v1` moves to `redcap-toolkit.projects.v1` on the next load; the old entry is removed only after the new one is saved. Tokens are kept in memory and must be entered again after a reload. Tokens are excluded from saved configuration and downloaded reports. Project removal is immediate. Use the same host and port to return to the same browser configuration.

## Direct API access and the optional proxy

The default mode sends form-encoded HTTPS POST requests directly from the browser to REDCap. Your REDCap installation must permit the app's origin through CORS. The app cannot bypass browser restrictions. Serve the page over HTTP locally or HTTPS internally; do not open `index.html` as a file.

If direct access is blocked, stop the server and restart with an explicit allowlist of the REDCap API URLs. These are endpoint URLs, not tokens.

```sh
REDCAP_API_URLS='https://redcap.example.org/api/' npm start
```

Separate multiple API URLs with commas. Then enable **Use local proxy** in the page. The proxy forwards only the four schema export operations to the configured HTTPS URLs, refuses redirects, checks request origins and binds to loopback. Tokens pass through memory and are not logged or written to disk. Do not expose this development server to the network. Internal hosting should use a managed server with equivalent restrictions and HTTPS.

The static page and `src/` modules can also be hosted without Node. In that case direct browser access is required unless the host provides the optional `/api/export` contract. The **Use local proxy** option is intended for the supplied local server.

## What the report means

- Project Info must match each project's configured title exactly. Identity failure blocks the remaining exports.
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

## Verification

```sh
npm test
```

The dependency-free tests cover comparison semantics, identity checks, optional tags, legacy configuration migration, report downloads, malformed API responses, credential handling and the actual server/proxy request handler using a synthetic upstream. View tests mount the Projects area and Schema comparison into one shared minimal fake DOM (`test/dom.js`) with synthetic storage and exports; they do not establish browser rendering or live REDCap compatibility. Handler tests do not bind a network port, so they can run in restricted sandboxes. Live REDCap verification requires your installation and authorised tokens. Browser rendering and interaction should also be checked on the browsers used by your team.

## Files

- `index.html` and `styles.css`: single-page interface.
- `src/app.js`: startup only. Mounts the Projects area and the Schema comparison Tool and connects them through `toolkit`.
- `src/projects-view.js`: the Projects area: saved project configuration and session tokens.
- `src/compare-view.js`: the Schema comparison Tool: comparison orchestration, filters and report downloads.
- `src/dom.js`: small DOM helpers used by the views.
- `src/compare.js`: pure comparison rules.
- `src/identity.js`: pure project identity rules.
- `src/projects.js`: reading and writing saved project configuration, with storage passed in.
- `src/api.js`: API requests and response validation.
- `src/demo.js`: synthetic demonstration data.
- `server.js`: local static server and optional restricted proxy.
- `test/`: repeatable automated checks.

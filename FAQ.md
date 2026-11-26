<!--
This file is shown on the FAQ page of the toolkit. The page supports only this markdown:
- # page title, ## section, ### question
- paragraphs, with lines of one paragraph joined
- single-level bullet lists starting with "- "
- `inline code`, **bold** and [links](https://example.org)
Links may only be https://, relative or #/ routes in the toolkit. Anything else is shown as plain text, and `npm test` fails until it is fixed.
-->
# Frequently asked questions

## Compatibility

### Which REDCap versions does the toolkit work with?

Tested against REDCap 17.5.3 with classic projects (no longitudinal events or arms). Other versions may work but have not been tested.

## Troubleshooting

### Schema comparison shows "HTTP 400. Check API permissions and connectivity."

Schema comparison and Upload template export Repeating Instruments and Events (`repeatingFormsEvents`). On REDCap 17.5.3 that export needs the token's user to have both of these privileges in the project:

- **API Export**
- **Project Setup/Design**

Ask someone with User Rights access in the project to grant both, then try again.

## Security

### What does the toolkit do to keep projects and data safe?

- Every request to REDCap is a read-only export. The toolkit never imports, changes or deletes anything in a project.
- API tokens are kept in page memory only. They are never saved, downloaded or put in a URL, and must be entered again after a reload.
- Record viewer shows one record at a time. Record values and record IDs are never saved or downloaded.
- The page's Content Security Policy limits where it can connect. When the server lists allowed API URLs, a token can be sent only to those URLs.
- The optional local proxy listens only on this computer and forwards only the read-only exports the Tools use.
- The hosted GitHub Pages site cannot send every security header and shares browser storage with other Pages sites on the same account.

The README has the details: [Direct API access and the optional proxy](https://github.com/kidsneuro-lab/redcap_toolkit/blob/main/README.md#direct-api-access-and-the-optional-proxy), [Record data](https://github.com/kidsneuro-lab/redcap_toolkit/blob/main/README.md#record-data) and [GitHub Pages](https://github.com/kidsneuro-lab/redcap_toolkit/blob/main/README.md#github-pages).

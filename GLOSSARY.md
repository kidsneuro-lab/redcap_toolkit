# REDCap Toolkit

A browser-based set of read-only tools for working with the schemas of classic REDCap projects.

## Language

**Tool**:
One self-contained capability of the toolkit, reached from the navbar.
_Avoid_: Page, module, feature

**Schema comparison**:
The Tool that reports differences between the exported schemas of two classic REDCap projects.
_Avoid_: Comparator, diff

**Upload template**:
The Tool that produces a downloadable CSV of column headers for importing data into one instrument, or selected fields of it, in a configured project.
_Avoid_: Import template, samplesheet

**Data dictionary**:
The Tool that shows the fields of selected instruments in a configured project, with their types, choices and limits, so values can be entered correctly.
_Avoid_: Codebook, field list

**FAQ page**:
A page, not a Tool, linked beside Projects, that shows the answers in `FAQ.md` to common questions about compatibility, errors and security.
_Avoid_: Help Tool, docs

**Project configuration**:
A saved description of one REDCap project: API URL, project ID, the title and production status from its last checked Project Info, and tags. It is identified by its API URL and project ID, and never includes the API token.
_Avoid_: Connection, profile

**Reference project**:
The project whose values appear on the left of a Schema comparison.
_Avoid_: Baseline, source

**Comparison project**:
The project whose values appear on the right of a Schema comparison.
_Avoid_: Target

# REDCap Data Import Template: exact column format

Research for [issue #4](https://github.com/h-joshi/redcap_toolkit/issues/4) (child of map issue #2). Throwaway branch, never merged.

Question: what does REDCap's own Data Import Template (classic project, CSV, records in rows) contain, and how can each column be derived from the Metadata export for a single-instrument upload template?

No real REDCap instance or credentials were used. REDCap's source code and its built-in API help are not publicly available, so the evidence is the REDCap Help & FAQ text (as mirrored by an institution), institutional training material, Vanderbilt-maintained client libraries and live-server fixtures and doctests in client libraries.

## Evidence key

- **Verified**: stated by a REDCap FAQ text or shown by live-server output captured in a client library.
- **Corroborated**: stated by client library source or documentation written against REDCap, not by REDCap itself.
- **Inference**: reasoning from the above. Needs a check against a sandbox project before it is relied on.

## Sources

| Ref | Source | Trust and version notes |
| --- | --- | --- |
| S1 | REDCap Help & FAQ, Data Import Tool, Field Types and Repeating Instruments sections, mirrored at [FAU help desk](https://helpdesk.fau.edu/TDClient/2061/Portal/KB/PrintArticle?ID=141506) | Text of the official in-app FAQ. Undated and versionless. The mirror's checkbox example has lost underscores in transcription (shows `race_1` and `race__2`); the same page elsewhere uses `race___2`. |
| S2 | [redcapAPI `constants.R`](https://github.com/vubiostat/redcapAPI/blob/main/R/constants.R), [`checkbox_suffixes.R`](https://github.com/vubiostat/redcapAPI/blob/main/R/checkbox_suffixes.R), [`fieldChoiceMapping.R`](https://github.com/vubiostat/redcapAPI/blob/main/R/fieldChoiceMapping.R), [`importRecords.R`](https://github.com/vubiostat/redcapAPI/blob/main/R/importRecords.R) | Maintained by Vanderbilt Biostatistics. Current `main`. |
| S3 | [redcapAPI `exportFieldNames` docs](https://search.r-project.org/CRAN/refmans/redcapAPI/html/exportFieldNames.html) and [`syncUnderscoreCodings`](https://search.r-project.org/CRAN/refmans/redcapAPI/html/syncUnderscoreCodings.html) | Paraphrases the REDCap API help. Exclusion list appears dated (see calc conflict below). |
| S4 | [REDCapR `redcap-variables.R`](https://github.com/OuhscBbmc/REDCapR/blob/main/R/redcap-variables.R), [`redcap-metadata-coltypes.R`](https://github.com/OuhscBbmc/REDCapR/blob/main/R/redcap-metadata-coltypes.R), [`metadata-utilities.R`](https://github.com/OuhscBbmc/REDCapR/blob/main/R/metadata-utilities.R) | Docs say "As of REDCap version 6.14.2" calc, file and descriptive are not returned by `exportFieldNames`. |
| S5 | [REDCapR live fixture `variables/default.R`](https://github.com/OuhscBbmc/REDCapR/blob/main/inst/test-data/specific-redcapr/variables/default.R) with its project [`simple/metadata.csv`](https://github.com/OuhscBbmc/REDCapR/blob/main/inst/test-data/projects/simple/metadata.csv) | Captured `exportFieldNames` output from a live test server, committed 2020-09-27 (REDCap 10.x era). |
| S6 | [PyCap `field_names.py`](https://github.com/redcap-tools/PyCap/blob/master/redcap/methods/field_names.py), [`records.py`](https://github.com/redcap-tools/PyCap/blob/master/redcap/methods/records.py), [`base.py`](https://github.com/redcap-tools/PyCap/blob/master/redcap/methods/base.py) | Docstring examples are doctests run against a live REDCap test server. |
| S7 | UConn CRC, [Data Import Tool guide](https://health.uconn.edu/clinical-research-center/wp-content/uploads/sites/50/2023/06/DATA-IMPORT-TOOL.pdf) (2023) | Institutional guide with screenshots of the real Data Import Tool page. |
| S8 | REDCap Knowledge Base (community, Bas de Veer): [Export Field Names](https://bdeveer.github.io/REDCap_KB_RAG/RC-API-06_Export-Field-Names/), [Record Data CSV Import](https://bdeveer.github.io/REDCap_KB_RAG/RC-IMP-04_Record-Data-CSV-Import/) | Third party. States live testing against REDCap 17.5.6 for Export Field Names; import page reviewed against 17.5.4 Standard and 17.3.18 LTS changelogs only. |

## What the template is

- The Data Import Tool page offers two downloads: "Download your Data Import Template (with records in rows)" and "(with records in columns)". The template is a header-only CSV of variable names for the whole project. **Verified** (S7 screenshot; S8).
- The template's column set is the project's export/import field names, the same names returned by the API method `exportFieldNames` plus the system columns described below. **Corroborated** (S3, S8; S7 screenshot shows `record_id, diagnosis, my_first_instrument_complete, v_stroke_date, ...`).

## Column rules

### Record ID column

- Must be the first column. FAQ: "The only requirement is that the record identifier (e.g., Subject ID) be the first field." **Verified** (S1, S7).
- The record ID field is the first field in the Metadata export. **Corroborated**: PyCap sets `def_field = field_names[0]` from metadata (S6); REDCapR: "The first field should always be the 'record' identifier" (S4).
- It must be present in a single-instrument template even when it belongs to another instrument. **Inference** from the first-column rule.

### Ordinary fields and order

- Fields appear in Metadata order, grouped by instrument, with `<instrument>_complete` after each instrument's last field. **Verified** (S5 live output: `... sex, demographics_complete, height, ...`; S7 screenshot).
- For non-checkbox fields the export name equals `field_name`. **Corroborated** (S3, S8).

### Checkbox expansion to `field___code`

- Each choice becomes its own column named `field_name` + `___` (three underscores) + converted code, holding `1` (checked) or `0` (unchecked). **Verified** (S1, S5: `race___1` to `race___6`).
- Parsing codes from `select_choices_or_calculations`: split on `|`, trim each item, take the text before the first comma as the code. **Corroborated** (S2 `fieldChoiceMapping` splits on `[|]` then `([^,]*),(.*)`; S4 `checkbox_choices` splits on `|` then `^(.+?),\s*+(.*)$`). Legacy items with no comma use the whole item as code (S2). Labels may contain commas; a label containing `|` breaks parsing (S4).
- Code conversion: lowercase, and each non-alphanumeric character becomes `_`. Examples from S2: `-4` becomes `checkbox____4`, code `k>=9` becomes `checkbox___k__9`, `a___b` stays `checkbox___a___b`. FAQ: "the negative signs will be replaced by an underscore in the export/import-specific version of the variable name". **Verified** for negatives (S1); **corroborated** for lowercase and other characters (S2 applies `tolower` and documents the rule).
- Historical: before REDCap 5.5.21, underscores in codes were dropped from the suffix (S3 `syncUnderscoreCodings`). Irrelevant to supported versions.
- **Residual uncertainty**: the full character mapping (for example `.` or non-ASCII letters) is not documented by REDCap. The only authoritative way to avoid replicating it is the `exportFieldNames` API method, which returns `original_field_name`, `choice_value` and `export_field_name`. That is a fifth export the app does not currently use.

### Descriptive fields

- Excluded: no data column. **Verified** (S5: absent; S8; S4 coltypes filters `field_type != "descriptive"`).

### File upload and signature fields

- Excluded from `exportFieldNames` and not importable through record import. Signatures are `field_type` `file` with `text_validation_type_or_show_slider_number` `signature`. **Verified** for `file` absence (S5: `mugshot` absent); signature as `file` is **verified** (S1 Field Types FAQ); exclusion **corroborated** (S3, S4).
- Files are uploaded per record through the separate file import method, which is outside this app's export-only scope.

### Calculated fields (`calc`)

- FAQ: "Data cannot be directly imported into calculated fields." REDCap recalculates them during import (S1). **Verified**.
- Conflict on whether they appear in `exportFieldNames`: S3 and S4 docs say calc is excluded (S4 cites REDCap 6.14.2), but the live S5 fixture (2020) and S8 (live-tested on 17.5.6) show calc fields such as `age` and `bmi` **included**. The live evidence wins for current versions.
- Whether REDCap's own Data Import Template lists calc columns was not verified from a primary source.
- Recommendation: exclude `calc` from the generated template because values cannot be imported. This is a product decision, not a claim about REDCap's template.

### `@CALCTEXT`, `@READONLY` and other action tags

- `@CALCTEXT` fields are `field_type` `text` with the tag in `field_annotation`, so they appear in `exportFieldNames` like any text field. **Inference** (no source found stating their template treatment).
- REDCap recalculates `@CALCTEXT` like `calc`; an imported value would be replaced when recalculation runs. **Inference**, unverified.
- `@READONLY` (and `-FORM`, `-SURVEY`, `-APP` variants) only restricts the data entry UI; it does not prevent import. **Inference** (S1 lists them as UI action tags). FAQ: "The data import process will not trigger the Action Tags to populate those fields with data" (for `@NOW`, `@TODAY` and similar). **Verified** (S1).
- Recommendation: exclude `@CALCTEXT` fields like `calc`; keep `@READONLY` fields (importing into them is a legitimate use) and flag them in the UI. Both read `field_annotation` from the Metadata export, so no extra export is needed.

### `<instrument>_complete`

- Present for every instrument, named `form_name + "_complete"`, after the instrument's last field. Values `0` Incomplete, `1` Unverified, `2` Complete. FAQ: "Form status can be imported into variables named form_name_complete. The data import template ... will contain the appropriate form status variable name". **Verified** (S1, S5, S6 doctest `form_1_complete`).
- Not in the Metadata export; derive it from `form_name` (or `instrument_name` from the Instruments export). REDCapR does exactly this (S4).

### `redcap_repeat_instrument` and `redcap_repeat_instance`

- Used when the project has repeating instruments. FAQ column list for repeating imports: `record_id, redcap_event_name, redcap_repeat_instrument, redcap_repeat_instance, redcap_data_access_group, [data]`. **Verified** (S1). `redcap_event_name` applies only to longitudinal projects, which this app rejects.
- PyCap's live export header for a project with repeating instruments: `record_id, redcap_event_name, redcap_repeat_instrument, redcap_repeat_instance, field_1, ...` (S6). REDCapR adds both columns only when project info `has_repeating_instruments_or_events` is true and places them directly after the record ID (S4). **Corroborated**.
- For a row of a repeating instrument: `redcap_repeat_instrument` = the instrument's `form_name`, `redcap_repeat_instance` = an integer. For non-repeating instruments both are left blank. S8 says `new` is accepted in `redcap_repeat_instance` to assign the next instance; version of introduction not established. **Corroborated** (S8 only).
- Derivable from the Repeating Instruments and Events export and the Project Info export already in use.

### `redcap_data_access_group`

- Appears in the FAQ import column list after the repeat columns (S1). Values are unique DAG names. **Verified** for name and position.
- When REDCap includes it in the template (for example only when the project has DAGs and the user is not assigned to a DAG) is not documented in the sources found. S8 is internally inconsistent on this. **Unverified**.
- Knowing whether a project has DAGs, and their unique names, needs the `dag` export (`content=dag`). That is not one of the four exports the app uses. Project Info has no DAG flag; REDCapR calls the `dag` export to detect DAGs (S4).

### Subset of columns

- Accepted. FAQ: "The order of the remaining fields or the number of fields being imported does not matter." UConn: "You can import a few variables at a time. The entire template doesn't need to be imported all at once." **Verified** (S1, S7).
- With the default (non-overwrite) behaviour, omitted columns and blank cells leave existing values unchanged; the API's `overwriteBehavior=overwrite` and the Data Import Tool's equivalent option make blanks erase data. **Corroborated** (S6 `overwrite` docs, S2 `importRecords.R`, S8).
- Unknown column names cause an error (S6: keys that are not fields return an `error`). **Corroborated**.

## Derivation recipe for a single-instrument template (classic project)

1. Record ID: first Metadata row's `field_name`.
2. If Project Info `has_repeating_instruments_or_events` is `1`: `redcap_repeat_instrument`, `redcap_repeat_instance`. Including them only when the chosen instrument repeats is also valid, since a subset is accepted.
3. Optional `redcap_data_access_group`: only if the user says the project uses DAGs (no export available within the four).
4. For each Metadata row with `form_name` equal to the instrument, in order, skipping the record ID if already placed:
   - `descriptive`, `file` (including signature): skip.
   - `calc` and `text` with `@CALCTEXT` in `field_annotation`: skip (product decision).
   - `checkbox`: one column per parsed choice, `field_name + "___" + convert(code)` where `convert` lowercases and replaces each non-`[a-z0-9]` character with `_`.
   - everything else: `field_name`.
5. `<form_name>_complete`.

## Exports needed beyond the four in use

- **None required** for the recipe above. The Metadata, Instruments, Repeating Instruments and Events and Project Info exports cover every column.
- **`exportFieldNames` (optional)**: authoritative checkbox suffixes instead of replicating REDCap's undocumented code conversion. Read-only, would need adding to `src/api.js` and the proxy allowlist.
- **`dag` (optional)**: needed to know whether to include `redcap_data_access_group` and to list valid values. Read-only, same allowlist implications.

## Open items to check on a sandbox project

- Whether REDCap's own template lists `calc` and `@CALCTEXT` columns.
- Exact checkbox suffix for codes containing `.`, spaces or non-ASCII characters.
- When `redcap_data_access_group` is included in the template, and whether repeat columns appear for a project whose only repeating instrument differs from the chosen one.
- Earliest version supporting `new` in `redcap_repeat_instance`.

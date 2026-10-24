# Color-Sequence Image Encoder

A PNG is the only persistent format. A page is a grid of exact solid colors; the image alone is enough to validate it and rebuild the next writing position (no JSON, sidecar files, or browser storage).

## Run
ES modules need an HTTP server (not `file://`):

    cd color-sequence-encoder
    python3 -m http.server 8000      # open http://localhost:8000/
    # tests in the browser: http://localhost:8000/tests/test-runner.html
    # tests in Node 18+:    node tests/test-runner.js

## Palette (single source: `js/Palette.js`)
| Symbol | Meaning | Color | Digit |
|---|---|---|---|
| 1 | Turquoise green | `#40C4A0` | 0 |
| 2 | Sky blue | `#87CEEB` | 1 |
| 3 | Yellow | `#FFD700` | 2 |
| 4 | Orange | `#FF8C00` | 3 |
| 5 | Milky cream | `#FFF4D6` | 4 |
| 6 | Turquoise blue (unit terminator) | `#00B8D4` | - |
| 7 | NULL (unavailable) | `#000000` | - |
| - | Unwritten | `#FFFFFF` | - |

## Files
- `js/Palette.js` colors/roles; `Limits.js` limits and cell size (8 px; W <= 256, initial H <= 512, max height 15000)
- `js/GridModel.js` in-memory cells; `WritingEngine.js` the only writing/expansion algorithm
- `js/CursorManager.js` rebuilds state by replaying a grid through the engine; `PageValidator.js` validation results
- `js/PngCodec.js` exact PNG encode/decode; `GridRenderer.js` canvas drawing; `RandomWriter.js`; `Base5Converter.js`; `PageCollection.js`
- `js/AppController.js` + `main.js` UI wiring; `css/*.css` all styling; `tests/` runner and suites

## Rules as implemented
1. A symbol goes to the topmost white cell of the active column. Below a column's first white cell everything down to the bottom is white, so a unit never meets NULL in the middle of writing.
2. If the active column has no white cell, exactly one row is added. At that moment EVERY white cell in the columns left of the active column becomes NULL (including the new row); the active column and all columns to its right get a white new row. Data cells never change.
3. After symbol 6, the next column is the first column to the right with a white cell; otherwise wrap and scan from column 1. None left means the page is permanently closed.
4. If growth is needed at the height limit the page is HALTED (not closed).
5. An empty unit (only the terminator) is valid but has no numeric value.
6. Import replays the image for every initial height up to min(512, image height), skipping heights whose first-expansion row is implausible, and aborting early on mismatch. The image is accepted only if some height reproduces it exactly and all such heights give the same state.

## Limitations
- PNG validation proves structure, not authenticity: an edited image that still satisfies every rule is indistinguishable from a generated one.
- The importer accepts only 8-bit RGB/RGBA, non-interlaced PNGs with exact 8x8 uniform cells. Palette-mode or re-scaled files are rejected.
- Page order and open pages exist only in the current session.
- Swatches and the grid use Palette colors; overlay colors (cursor, lines) are CSS variables in `css/grid.css`.
- The browser UI (`index.html`, `AppController`, `GridRenderer`) was not executed in a browser during development; the logic modules and PNG codec are covered by the Node test suite.
- The Three.js viewer was not run in a browser (no WebGL or network where it was developed); only its data model `VolumeBuilder` is tested.

## Pattern analysis (read-only, `js/analysis/`)
Run from the "Pattern analysis" panel; it only reads pages. Modules: `PageCorpus` (adapter), `FrequencyAnalyzer`, `NGramAnalyzer`, `SuffixArray` + `RepeatedSubstringFinder`, `Levenshtein` + `ApproxMatcher`, `InformationMeasures`, `MarkovModel` + `MarkovEvaluator` + `HeldOutSplitter`, `PermutationTester` (three randomized baselines, Holm/BH correction), `SpatialAnalyzer`, `HypothesisTracker`, `AnalysisRunner` (DOM-free), `AnalysisTable` / `AnalysisController` (UI), styles in `css/analysis.css`.
Unit order within a page is column by column; held-out splits are by page by default. Findings are statistical observations, never translations. Hierarchical clustering (`HierarchicalClusterer`) is included. After a run, `ReportWriter` writes a plain-language report (Persian or English) and an optional 3D layer view (`VolumeBuilder` + lazily loaded `ThreeViewer`, needs WebGL and internet access to the Three.js CDN) is available at the bottom of the page. See `docs/ANALYSIS_GUIDE.md` (Persian) for how to read results and what can and cannot be concluded.

## Automatic page generation and optional reports
- "Automatic page generation" creates N pages strictly one after another; page i is filled until it closes before page i+1 exists (`BatchPageGenerator`, same `Page.write` -> `WritingEngine` path as manual/random mode). Other controls are locked while it runs; Stop ends after the current chunk.
- Hidden by default (buttons reveal them): the base-5 conversion table and the detailed analysis tables. The plain-language report (Persian/English) is always shown after an analysis run.

## Text <-> color pages (`js/text/`)
Word -> UTF-8 -> prefix byte 0x01 -> unsigned BigInt (big-endian) -> base 5 -> digit colors (0..4 = turquoise green, sky blue, yellow, orange, milky cream; mapping lives only in `DigitColorMap`), then one turquoise-blue terminator per word. Words are the non-empty runs between whitespace (`\s`, Unicode-aware); nothing inside a word is normalized. Limit: 1024 Unicode code points per word; text with unpaired surrogates is rejected because it cannot be encoded exactly.
- Encoding always creates NEW pages (`Text 0001`, `Text 0002`, ...) through the existing `Page.write` -> `WritingEngine` path. A word is never split: if it does not fit, a new page is started and the old page stays valid and open.
- Because a 1024-character word can need ~14,120 cells in one column, `Limits.MAX_HEIGHT` was raised from 2000 to 15000.
- "Save All Pages to Disk" exports each page (existing `exportPng`, lossless PNG) one after another as `page_0001.png`, `page_0002.png`, ... in ascending number. Browsers cannot confirm that a download finished, so the status says "download started"; the browser may ask permission for multiple downloads.
- Pages -> text: pages are validated (`CursorManager`) and replayed through the engine to recover WRITING order (not column order). Terminator = word end; output is plain text, words separated by one space (original whitespace/newlines are not recoverable). Any invalid page or unit stops decoding and is reported with page and unit numbers. Files are ordered by the number in their names; the PNGs do not store page numbers.

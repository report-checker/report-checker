# Development Guide

## App Overview

Report Checker is a desktop + web app that validates PDF internship reports against Russian formatting standards (ГОСТ 7.32-2017). It parses a PDF, runs a set of rules against the parsed data, and displays the results with visual highlights overlaid on the PDF preview.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | Next.js 16 + React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| Desktop | Tauri 2 (Rust native wrapper) |
| PDF parsing | Rust: `pdfium-render` |
| Build | `npm run build` (Next.js static export) |
| Dev | `npm run dev` (Next.js) or `npm run app` (Tauri) |
| Tests | Vitest |
| Linting | Biomejs |

---

## Project Structure

```
report-checker/
├── src/
│   ├── app/                        # Next.js app directory
│   │   └── page.tsx                # Main UI entry point
│   ├── components/                 # Shared UI components (PDF preview, cards, etc.)
│   ├── features/report-checker/    # Feature-specific components
│   └── lib/
│       ├── rules-engine/           # All rule logic lives here
│       │   ├── types.ts            # All shared types
│       │   ├── engine.ts           # Orchestrates rule evaluation
│       │   ├── context.ts          # Builds EngineContext from parsed PDF
│       │   ├── geometry.ts         # Normalizes PDFium geometry for the rules engine
│       │   ├── status.ts           # Status aggregation + summary counting
│       │   ├── overlays.ts         # Overlay box helpers
│       │   ├── text-set-core.ts    # Constants, shared types, layout analysis
│       │   ├── text-set.ts         # Re-exports all text-set rules
│       │   ├── text-set-basic-rules.ts   # A4 format, font size, font color
│       │   ├── text-set-layout-rules.ts  # Line spacing, indent, alignment
│       │   ├── margins.ts          # Margin rules (left/right/top/bottom)
│       │   ├── page-numbering.ts   # Page numbering rule
│       │   ├── document-structure/ # TOC, structure, title-page rules
│       │   └── __tests__/          # Vitest golden tests
│       ├── checker-config.ts       # User-facing config types + defaults from JSON
│       ├── checker.config.json     # Runtime checker config
│       ├── checker.config.schema.json # RJSF schema for config editor
│       └── report-checker.ts       # Top-level orchestration (calls Tauri + engine)
├── src-tauri/
│   └── src/
│       ├── lib.rs                  # Tauri command registration
│       └── pdf_checker/            # Rust PDF parsing
│           ├── mod.rs              # parse_pdf_report command
│           └── margin_geometry.rs  # PDFium text + geometry extraction
├── docs/
│   ├── requirements.md             # Source GOST formatting requirements (Russian)
│   ├── tasks/                      # Implementation task specifications
│   └── Development.md              # This file
├── scripts/
│   ├── connect-ucheb.js            # SSH + PostgreSQL helper for IFMO DB
│   ├── db-ucheb/                   # Internal modules for DB helper
│   │   └── title-page-dump.config.json # Dump config (years array, default [2026])
│   ├── dump-title-page-db.js       # Export DB reference JSON for title-page rules
│   ├── dump-pdf-text.ts            # PDF text diagnostics (pdfjs)
│   ├── title-page-reference.js     # DB-backed canonical values for title-page checks
│   └── setup-pdfium.py             # PDFium setup helper
└── example-reports/                # Test PDFs
```

---

## Data Flow

```
User selects PDF
    ↓
report-checker.ts: runReportChecks()
    ↓
Rust backend (Tauri IPC): parse_pdf_report()
  → extracts text runs, page boxes, font sizes, colors
  → returns ParsedPdfResult
    ↓
rules-engine/engine.ts: runRulesEngine()
  → resolveMarginGeometry()  (normalize PDFium parser output)
  → buildEngineContext()      (normalize pages into EnginePage[])
  → run each rule builder     (each returns a RuleResult subtree)
  → aggregateStatus()         (fail > warn > pass)
  → return RulesEngineOutput
    ↓
UI: render rule tree in ResultsPanel + overlays in PreviewPanel
```

---

## Configuration

Main config sources:

- [`src/lib/checker-config.ts`](../src/lib/checker-config.ts) — TypeScript types
- [`src/lib/checker.config.json`](../src/lib/checker.config.json) — default values
- [`src/lib/checker.config.schema.json`](../src/lib/checker.config.schema.json) — config editor schema

Key sections in config:

- `margins`
- `pageFormat`
- `typography`
- `pageNumbering`
- `documentStructure`
- `titlePage` (title-page extraction, strictness, expected values, and non-fillable field checks)
- `rules` (per-rule settings: `enabled`, `severity`, `countInSummary`)

Rule-internal helpers and constants are in [`text-set-core.ts`](../src/lib/rules-engine/text-set-core.ts).

---

## Rules Engine

### Key Types

All types are in [`types.ts`](../src/lib/rules-engine/types.ts).

**`RuleResult`** — the universal output of every rule or group:

```typescript
type RuleResult = {
  id: string;                        // unique kebab-case identifier
  title: string;                     // displayed in the UI
  status: "pass" | "fail" | "warn";
  message: string;                   // detail text shown in the UI
  children: RuleResult[];            // nested rules (empty for leaf rules)
  overlayBoxes: OverlayBox[];        // visual highlights on the PDF
  jumpPageNumbers: number[];         // pages to scroll to when rule is selected
  childrenCollapsedByDefault: boolean;
  countInSummary: boolean;           // resolved from config.rules[ruleId].countInSummary
};
```

**`OverlayBox`** — a colored rectangle drawn on the PDF preview:

```typescript
type OverlayBox = {
  pageNumber: number;
  pageBox: PdfRect;   // full page bounding box (PDF points)
  rect: PdfRect;      // the highlighted region
  style: OverlayStyle;
};
```

**`EngineContext`** — the normalised input every rule receives:

```typescript
type EngineContext = {
  pageCount: number;
  checkedPages: number;
  pages: EnginePage[];   // one entry per page
  config: CheckerConfig;
  parserEngineLabel: string;
};

type EnginePage = {
  pageNumber: number;
  pageBox: PdfRect | null;      // page dimensions in PDF points
  textRuns: ParsedTextRun[];    // every text run on the page
  marginBounds: PdfRect | null; // detected text content bounding box
};
```

**`ParsedTextRun`** — a single run of text from the PDF:

```typescript
type ParsedTextRun = {
  text: string;
  bounds: PdfRect;           // position in PDF points
  fontSizePt?: number;
  textColorRgb?: RgbColor | null;
};
```

### Rule Tree Structure

```
formatting  (root, not counted in summary)
├── text-set
│   ├── page-format
│   ├── typography
│   │   ├── font-size
│   │   ├── line-spacing
│   │   ├── font-color
│   │   ├── paragraph-indent
│   │   └── text-alignment
│   ├── margins
│   │   ├── margin-left
│   │   ├── margin-right
│   │   ├── margin-top
│   │   └── margin-bottom
│   └── page-numbering-section
│       └── page-numbering
└── document-structure
    ├── title-page
    │   ├── title-page-education-program
    │   ├── title-page-practice-name
    │   ├── title-page-student
    │   ├── title-page-year
    ├── toc-presence
    ├── structural-elements
    │   ├── struct-elem-vvedenie
    │   ├── struct-elem-zaklyuchenie
    │   └── struct-elem-spisok-istochnikov
    ├── section-headings-format
    └── toc-body-match
└── detected-text-bounds (debug node)
```

`countInSummary` is configured per rule via `config.rules[<rule-id>].countInSummary` (not hardcoded in rule builders).

### Coordinate System

All coordinates are in **PDF points** (1 pt = 1/72 inch ≈ 0.0353 cm).

```
POINTS_PER_CM = 72 / 2.54 ≈ 28.35

// Conversion helpers (text-set-core.ts)
ptToCm(pt)      // points → centimetres
percentile(arr, ratio)  // e.g. percentile(lefts, 0.15) = 15th percentile
median(arr)
```

The origin is at the **bottom-left** of the page (standard PDF coordinate system). `PdfRect.top > PdfRect.bottom`.

---

## Constants Reference

From [`text-set-core.ts`](../src/lib/rules-engine/text-set-core.ts):

| Constant | Value | Meaning |
|---|---|---|
| `POINTS_PER_CM` | 28.35 | Conversion factor |
| `A4_WIDTH_PT` | 595.28 | A4 page width |
| `A4_HEIGHT_PT` | 841.89 | A4 page height |
| `A4_TOLERANCE_PT` | 8.5 | ±0.3 cm tolerance for page size |
| `MIN_FONT_SIZE_PT` | 12 | Minimum allowed font size |
| `FONT_SIZE_TOLERANCE_PT` | 0.2 | Font size check tolerance |
| `EXPECTED_LINE_SPACING` | 1.5 | Expected gap/font-size ratio |
| `LINE_SPACING_TOLERANCE` | 0.3 | Line spacing tolerance |
| `PARAGRAPH_BREAK_FACTOR` | 1.75 | Gap > 1.75× font = new paragraph |
| `INDENT_EXPECTED_PT` | 35.43 | 1.25 cm paragraph indent |
| `INDENT_TOLERANCE_PT` | 8.5 | ±0.3 cm indent tolerance |
| `INDENT_DETECTION_MIN_PT` | 5.67 | Minimum indent to detect (0.2 cm) |
| `INDENT_DETECTION_MAX_PT` | 85.04 | Maximum indent to detect (3 cm) |
| `ALIGN_RIGHT_TOLERANCE_PT` | 14.17 | ±0.5 cm justified alignment tolerance |
| `BODY_FONT_TOLERANCE_PT` | 1.5 | Tolerance when filtering for body font |
| `MIN_BODY_LINE_WIDTH_RATIO` | 0.35 | Line must be ≥35% of text column width |
| `BLACK_CHANNEL_MAX` | 0.18 | Max RGB channel value considered "black" |
| `NON_BLACK_WARN_RATIO` | 0.05 | >5% non-black → warn |
| `NON_BLACK_FAIL_RATIO` | 0.12 | >12% non-black → fail |

---

## Layout Analysis Helpers

`text-set-core.ts` exports several helpers used by multiple rules — use these rather than reimplementing.

**`analyzePageLayout(page: EnginePage, config: TypographyConfig): PageLayout | null`**
Groups text runs into lines, detects body font size, computes `mainLeft`/`mainRight` (15th/85th percentile of line edges), and filters to `bodyLines` (lines wide enough to be body text).

**`segmentParagraphs(layout: PageLayout): ParagraphSegment[]`**
Splits `bodyLines` into paragraph segments. A new paragraph starts when:
- vertical gap > `PARAGRAPH_BREAK_FACTOR × avgFont`, or
- left edge shifts right by > `INDENT_DETECTION_MIN_PT`, or
- previous line's right edge falls short of `mainRight` by > `ALIGN_RIGHT_TOLERANCE_PT`.

**`buildMeasurementOverlays(entries, style)`**
Converts a list of measurements (anything with `pageNumber`, `pageBox`, `bounds`) into `OverlayBox[]`.

**`collectWorstPerPage(entries, scoreFn)`**
Returns a `Map<pageNumber, T>` keeping only the worst-scoring entry per page.

**`isNearBlack(color)`, `isFiniteColor(color)`**
Color utilities.

---

## Adding a New Rule

### 1. Create the rule builder

Add a new file (or add to an existing `*-rules.ts` file if thematically related).

A rule builder function takes `EnginePage[]` (or `EngineContext` if you need config) and returns a `RuleResult`.

```typescript
// src/lib/rules-engine/my-new-rule.ts
import { analyzePageLayout, buildMeasurementOverlays, ... } from "./text-set-core";
import { overlayBox } from "./overlays";
import type { EnginePage, RuleResult } from "./types";

export function buildMyNewRule(pages: EnginePage[]): RuleResult {
  // 1. Collect violations / measurements
  const violations: Array<{ pageNumber: number; pageBox: ...; bounds: ... }> = [];

  for (const page of pages) {
    const layout = analyzePageLayout(page, config.typography);
    if (!layout) continue;

    for (const line of layout.bodyLines) {
      if (/* violation condition */) {
        violations.push({ pageNumber: page.pageNumber, pageBox: page.pageBox, bounds: line.bounds });
      }
    }
  }

  // 2. Determine status
  const status = violations.length === 0 ? "pass" : "fail";

  // 3. Build overlay boxes for visual feedback
  const overlayBoxes = buildMeasurementOverlays(violations, styleForMyRule(status));

  // 4. Collect page numbers to jump to
  const jumpPageNumbers = [...new Set(violations.map((v) => v.pageNumber))];

  return {
    id: "my-new-rule",
    title: "My New Rule Title",
    status,
    message:
      status === "pass"
        ? "All checks passed."
        : `Found ${violations.length} violation(s).`,
    children: [],
    overlayBoxes,
    jumpPageNumbers,
    childrenCollapsedByDefault: false,
    countInSummary: false,  // value is overridden by config.rules["my-new-rule"].countInSummary
  };
}

function styleForMyRule(status: RuleStatus): OverlayStyle {
  // Use the helpers from text-set-core.ts or define custom:
  return styleForFontSize(status); // or build your own OverlayStyle object
}
```

### 2. Register the rule in `engine.ts`

Open [`src/lib/rules-engine/engine.ts`](../src/lib/rules-engine/engine.ts) and add your rule to the appropriate group (or create a new group).

**Adding to the typography group** (simplest):
```typescript
// engine.ts
import { buildMyNewRule } from "./my-new-rule";

// inside evaluateParsedPdf():
const typographyRules = [
  buildMinimumFontSizeRule(context),
  buildLineSpacingRule(context),
  buildFontColorBlackRule(context),
  buildParagraphIndentRule(context),
  buildJustifiedAlignmentRule(context),
  buildMyNewRule(context.pages),   // ← add here
];
```

**Adding a new top-level section group** (for structurally distinct rules):
```typescript
const myNewRules = [buildMyNewRule(context.pages)];
const myNewNode: RuleResult = {
  id: "my-new-section",
  title: "My New Section",
  status: aggregateStatus(myNewRules),
  message: "Description of this section.",
  children: myNewRules,
  overlayBoxes: [],
  jumpPageNumbers: [],
  childrenCollapsedByDefault: false,
  countInSummary: false,   // value is overridden by config.rules["my-new-section"].countInSummary
};

// Then add myNewNode to sectionNodes:
const sectionNodes = [pageFormatRule, typographyNode, marginsNode, pageNumberingNode, myNewNode];
```

### 3. Add a golden test (recommended)

Copy the pattern from `__tests__/margins.golden.test.ts` or `__tests__/page-numbering.golden.test.ts`.

Golden tests load a fixture `ParsedPdfResult` from `__fixtures__/parsed/`, run `evaluateParsedPdf()`, and compare the output against `__fixtures__/expected/`. This lets you lock in correct behaviour and catch regressions.

Run tests with:
```
npm run test:rules
```

### 4. Sync documentation status (required)

When you add or change any rule behavior, update both docs in the same PR:

- [`docs/Rules.md`](./Rules.md) — update rule description and add/remove implemented checks. Track implementation status (`implemented` / `partial` / `not implemented`) here, not in `requirements.md`. Keep dates in status blocks explicit (e.g. `на 2026-03-24`) so progress is auditable.
- [`docs/requirements.md`](./requirements.md) — **link-only policy**: never rewrite the Russian requirement prose. Only add/remove/update the formatting of requirement sentences using these three states:

| Appearance | Meaning |
| --- | --- |
| `[Requirement text](Rules.md#rule-id)` | **Implemented** — link points to the rule ID in `Rules.md`. |
| `Requirement text` (plain) | **Not yet implemented** — planned, no rule exists yet. |
| `~~Requirement text~~` (strikethrough) | **Will not be implemented** — out of scope (e.g. semantic checks, manual review items). Add a note in the `Rules.md` coverage block explaining why. |

A single sentence may be split across states if only part of it is implemented.

---

## Diagnostics

Use the built-in PDF dump helper when tuning regex/heuristics for structure rules (especially title-page checks):

```bash
npm run dump:pdf:text -- example-reports/1.pdf
npm run dump:pdf:text -- example-reports/2.pdf --pages 1 --lines 80
npm run dump:pdf:text -- example-reports/2.pdf --no-structure
```

What it prints:

- grouped text lines (`y`, `x`, approximate font size)
- optional compact title-page extraction summary from `detectStructure()`

Implementation note:

- The script uses `pdfjs-dist` with `disableWorker: true` in Node. Do not set `GlobalWorkerOptions.workerSrc` there, otherwise `pdfjs` worker setup may fail.

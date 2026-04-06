/**
 * Unit tests for document structure detection.
 *
 * Uses synthetic EnginePage data that mimics a real Russian internship report:
 *   Page 1 - Title page (large font text, no structural elements)
 *   Page 2 - СОДЕРЖАНИЕ (TOC) with entries
 *   Page 3 - ВВЕДЕНИЕ
 *   Page 4 - Section "1 Аналитическая часть" at 14pt
 *   Page 5 - Section "2 Практическая часть" at 14pt
 *   Page 6 - ЗАКЛЮЧЕНИЕ
 *   Page 7 - СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ
 */

import { defaultCheckerConfig } from "../../../checker-config";
import type {
  EngineContext,
  EnginePage,
  ParsedPageObject,
  ParsedTextRun,
  PdfRect,
  RuleResult,
} from "../../types";

function makeContext(pages: EnginePage[]): EngineContext {
  return {
    pageCount: pages.length,
    checkedPages: pages.length,
    pages,
    config: defaultCheckerConfig,
    parserEngineLabel: "test",
  };
}

// A4 page dimensions in PDF points
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const PAGE_BOX: PdfRect = { left: 0, bottom: 0, right: PAGE_W, top: PAGE_H };

const PAGE_CENTER_X = PAGE_W / 2; // ~297.64
const BODY_LEFT_X = 85;
const SECTION_HEADING_LEFT_X = 121;

/** Create a single-run line at a given Y position */
function run(
  text: string,
  opts: {
    y?: number;
    fontSizePt?: number;
    left?: number;
    right?: number;
    centerX?: number;
  } = {},
): ParsedTextRun {
  const font = opts.fontSizePt ?? 12;
  const y = opts.y ?? 400;
  let left: number;
  let right: number;
  if (opts.centerX !== undefined) {
    const halfWidth = (text.length * font * 0.6) / 2;
    left = opts.centerX - halfWidth;
    right = opts.centerX + halfWidth;
  } else {
    left = opts.left ?? BODY_LEFT_X;
    right = opts.right ?? left + text.length * font * 0.6;
  }
  return {
    text,
    bounds: { left, bottom: y, right, top: y + font },
    fontSizePt: font,
  };
}

/** Create a page with given runs */
function page(
  pageNumber: number,
  runs: ParsedTextRun[],
  pageObjects: ParsedPageObject[] = [],
): EnginePage {
  return {
    pageNumber,
    pageBox: PAGE_BOX,
    textRuns: runs,
    marginBounds: null,
    pageObjects,
  };
}

// ---------------------------------------------------------------------------
// Synthetic report pages
// ---------------------------------------------------------------------------

/** Page 1: Title page - no structural elements */
const titlePage = page(1, [
  run("Министерство науки и высшего образования", {
    y: 750,
    fontSizePt: 12,
    left: 85,
  }),
  run("Санкт-Петербургский политехнический университет Петра Великого", {
    y: 720,
    fontSizePt: 12,
    left: 85,
  }),
  run("Образовательная программа: 09.04.04 Программная инженерия", {
    y: 620,
    fontSizePt: 12,
    left: 85,
  }),
  run("ОТЧЕТ О ПРАКТИКЕ", { y: 500, fontSizePt: 16, centerX: PAGE_CENTER_X }),
  run("Научно-исследовательская работа", {
    y: 470,
    fontSizePt: 12,
    centerX: PAGE_CENTER_X,
  }),
  run("Обучающийся: Константинов А.А., P4244", {
    y: 300,
    fontSizePt: 12,
    left: 85,
  }),
  run("Санкт-Петербург 2024", {
    y: 80,
    fontSizePt: 12,
    centerX: PAGE_CENTER_X,
  }),
  run("2026", { y: 64, fontSizePt: 12, centerX: PAGE_CENTER_X }),
]);

/** Page 2: СОДЕРЖАНИЕ with TOC entries */
const tocPage = page(2, [
  // The "СОДЕРЖАНИЕ" heading centered at ~12pt
  run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
  // TOC entries: "Title .............. N"
  run("ВВЕДЕНИЕ ...................................................... 3", {
    y: 700,
    fontSizePt: 12,
    left: 85,
  }),
  run("1. Аналитическая часть ..................................... 4", {
    y: 680,
    fontSizePt: 12,
    left: 85,
  }),
  run("2. Практическая часть ..................................... 5", {
    y: 660,
    fontSizePt: 12,
    left: 85,
  }),
  run("ЗАКЛЮЧЕНИЕ ................................................. 6", {
    y: 640,
    fontSizePt: 12,
    left: 85,
  }),
  run("СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ ............... 7", {
    y: 620,
    fontSizePt: 12,
    left: 85,
  }),
]);

/** Page 3: ВВЕДЕНИЕ */
const vvedeniePage = page(3, [
  run("ВВЕДЕНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
  run(
    "Данная работа посвящена изучению современных методов разработки программного обеспечения.",
    {
      y: 700,
      fontSizePt: 12,
      left: 85,
    },
  ),
  run("В ходе практики были освоены технологии React и TypeScript.", {
    y: 680,
    fontSizePt: 12,
    left: 85,
  }),
]);

/** Page 4: Section "1 Аналитическая часть" at 14pt */
const section1Page = page(4, [
  run("1 Аналитическая часть", {
    y: 760,
    fontSizePt: 14,
    left: SECTION_HEADING_LEFT_X,
  }),
  run("В данном разделе проводится анализ предметной области.", {
    y: 710,
    fontSizePt: 12,
    left: 85,
  }),
  run("Рассматриваются основные понятия и определения.", {
    y: 690,
    fontSizePt: 12,
    left: 85,
  }),
]);

/** Page 5: Section "2 Практическая часть" at 14pt */
const section2Page = page(5, [
  run("2 Практическая часть", {
    y: 760,
    fontSizePt: 14,
    left: SECTION_HEADING_LEFT_X,
  }),
  run("В данном разделе описывается практическая реализация.", {
    y: 710,
    fontSizePt: 12,
    left: 85,
  }),
]);

/** Page 6: ЗАКЛЮЧЕНИЕ */
const zaklyucheniePage = page(6, [
  run("ЗАКЛЮЧЕНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
  run("В ходе практики были достигнуты все поставленные цели.", {
    y: 700,
    fontSizePt: 12,
    left: 85,
  }),
]);

/** Page 7: СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ */
const listPage = page(7, [
  run("СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ", {
    y: 760,
    fontSizePt: 12,
    centerX: PAGE_CENTER_X,
  }),
  run("1. Иванов И.И. Программирование на TypeScript. М.: Наука, 2023.", {
    y: 700,
    fontSizePt: 12,
    left: 85,
  }),
]);

const allPages = [
  titlePage,
  tocPage,
  vvedeniePage,
  section1Page,
  section2Page,
  zaklyucheniePage,
  listPage,
];

function object(
  bounds: PdfRect,
  objectType: ParsedPageObject["objectType"] = "image",
) {
  return {
    objectType,
    bounds,
  } as ParsedPageObject;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function findById(nodes: RuleResult[], id: string): RuleResult | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findById(node.children, id);
    if (child) return child;
  }
  return null;
}

export {
  allPages,
  BODY_LEFT_X,
  defaultCheckerConfig,
  findById,
  makeContext,
  object,
  PAGE_CENTER_X,
  page,
  run,
  SECTION_HEADING_LEFT_X,
};

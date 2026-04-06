import { detectStructure } from "./document-structure";
import {
  collectLinesWithText,
  normalizeText,
} from "./document-structure/collect-lines";
import { splitTocEntriesByAppendix } from "./document-structure/detect-structure-toc";
import {
  hasTableReferenceInText,
  isTableCaptionOrContinuationLine,
} from "./document-structure/tables/constants";
import {
  analyzePageLayout,
  median,
  POINTS_PER_CM,
  type ParagraphSegment,
  segmentParagraphs,
} from "./text-set-core";
import type { EngineContext, EnginePage } from "./types";

type MainTextRange = {
  startPageNumber: number;
  endPageNumber: number;
  startPageLowerBoundY: number | null;
  endPageLowerBoundY: number | null;
};

const TOC_NUMBER_PREFIX_REGEX = /^\s*\d+(?:[.\s]+\d+)*\.?\s+/u;
const PAGE_NUMBER_ONLY_REGEX = /^\d(?:\s*\d)*$/u;
const TERM_DEFINITION_LINE_REGEX =
  /^(?<term>[^—–−-]{2,80}?)\s+[—–−-]\s+(?<definition>.+)$/u;

export function collectMainTextParagraphs(
  context: EngineContext,
): ParagraphSegment[] {
  const structure = detectStructure(context.pages, context.config);
  const mainTextRange = resolveMainTextRange(context, structure);
  if (!mainTextRange) {
    return [];
  }
  const globalLeftReference = resolveGlobalMainTextLeft(context, mainTextRange);
  const headingBoundsByPage = collectHeadingBoundsByPage(structure);

  return context.pages.flatMap((page) => {
    if (
      page.pageNumber < mainTextRange.startPageNumber ||
      page.pageNumber > mainTextRange.endPageNumber
    ) {
      return [];
    }

    const layout = analyzePageLayout(page, context.config.typography);
    if (!layout) {
      return [];
    }
    const pageHeadingBounds = headingBoundsByPage.get(page.pageNumber) ?? [];
    const bodyLinesWithoutHeadings =
      pageHeadingBounds.length === 0
        ? layout.bodyLines
        : layout.bodyLines.filter(
            (line) =>
              !pageHeadingBounds.some((bounds) =>
                rectsOverlap(line.bounds, bounds),
              ),
          );
    const adjustedLayout =
      bodyLinesWithoutHeadings === layout.bodyLines
        ? layout
        : { ...layout, bodyLines: bodyLinesWithoutHeadings };

    const topTableCaptionY = resolveTopTableCaptionY(adjustedLayout.lines);
    return segmentParagraphs(adjustedLayout, context.config.typography).filter(
      (paragraph) =>
        paragraph.lines.length >= 3 &&
        startsWithLetter(paragraph.startLine.text) &&
        !isTermDefinitionStartLine(paragraph.startLine.text) &&
        isAnchoredToGlobalLeft(paragraph, globalLeftReference, context) &&
        isInsideMainTextRange(paragraph, page, mainTextRange) &&
        !isTableRelatedParagraph(paragraph) &&
        !isBelowTopTableCaption(paragraph, topTableCaptionY),
    );
  });
}

function resolveMainTextRange(
  context: EngineContext,
  structure: ReturnType<typeof detectStructure>,
): MainTextRange | null {
  return (
    resolveMainTextRangeFromToc(context, structure) ??
    resolveMainTextRangeFromStructuralElements(structure)
  );
}

function resolveMainTextRangeFromToc(
  context: EngineContext,
  structure: ReturnType<typeof detectStructure>,
): MainTextRange | null {
  const { mainEntries } = splitTocEntriesByAppendix(structure.tocEntries);
  if (mainEntries.length === 0) {
    return null;
  }

  const intro = structure.structuralElements.find(
    (element) => element.name === "ВВЕДЕНИЕ",
  );
  const conclusion = structure.structuralElements.find(
    (element) => element.name === "ЗАКЛЮЧЕНИЕ",
  );
  const sortedMainEntries = [...mainEntries].sort((left, right) => {
    if (left.pageRef !== right.pageRef) {
      return left.pageRef - right.pageRef;
    }
    return left.pageNumber - right.pageNumber;
  });
  const introEntry = sortedMainEntries.find(
    (entry) => normalizeTocEntryTitle(entry.title) === "ВВЕДЕНИЕ",
  );
  const lastEntry = sortedMainEntries.at(-1);
  const pagesByNumber = new Map(
    context.pages.map((page) => [page.pageNumber, page]),
  );
  const pagesByPrintedNumber = buildPrintedPageNumberMap(context.pages);
  const startPageNumber =
    intro?.pageNumber ??
    resolvePageRefToPhysicalPageNumber(
      introEntry?.pageRef ?? sortedMainEntries[0]?.pageRef ?? null,
      pagesByNumber,
      pagesByPrintedNumber,
    );
  const endPageFromToc = resolvePageRefToPhysicalPageNumber(
    lastEntry?.pageRef ?? null,
    pagesByNumber,
    pagesByPrintedNumber,
  );
  const endPageNumber = resolveEndPageNumber(
    conclusion?.pageNumber ?? null,
    endPageFromToc,
  );

  if (
    startPageNumber === null ||
    endPageNumber === null ||
    startPageNumber > endPageNumber
  ) {
    return null;
  }

  const fallbackEndStructuralElement =
    lastEntry === undefined
      ? undefined
      : structure.structuralElements.find(
          (element) =>
            element.pageNumber === endPageNumber &&
            element.name === normalizeTocEntryTitle(lastEntry.title),
        );
  const endPageLowerBoundY =
    conclusion && conclusion.pageNumber === endPageNumber
      ? conclusion.bounds.bottom
      : (fallbackEndStructuralElement?.bounds.bottom ?? null);

  return {
    startPageNumber,
    endPageNumber,
    startPageLowerBoundY: intro?.bounds.bottom ?? null,
    endPageLowerBoundY,
  };
}

function resolveMainTextRangeFromStructuralElements(
  structure: ReturnType<typeof detectStructure>,
): MainTextRange | null {
  const intro = structure.structuralElements.find(
    (element) => element.name === "ВВЕДЕНИЕ",
  );
  const conclusion = structure.structuralElements.find(
    (element) => element.name === "ЗАКЛЮЧЕНИЕ",
  );

  if (!intro || !conclusion || intro.pageNumber > conclusion.pageNumber) {
    return null;
  }

  return {
    startPageNumber: intro.pageNumber,
    endPageNumber: conclusion.pageNumber,
    startPageLowerBoundY: intro.bounds.bottom,
    endPageLowerBoundY: conclusion.bounds.bottom,
  };
}

function resolveEndPageNumber(
  conclusionPageNumber: number | null,
  tocEndPageNumber: number | null,
): number | null {
  if (
    conclusionPageNumber !== null &&
    Number.isFinite(conclusionPageNumber) &&
    tocEndPageNumber !== null &&
    Number.isFinite(tocEndPageNumber)
  ) {
    return Math.min(conclusionPageNumber, tocEndPageNumber);
  }

  if (conclusionPageNumber !== null && Number.isFinite(conclusionPageNumber)) {
    return conclusionPageNumber;
  }
  if (tocEndPageNumber !== null && Number.isFinite(tocEndPageNumber)) {
    return tocEndPageNumber;
  }
  return null;
}

function normalizeTocEntryTitle(title: string): string {
  return normalizeText(title.replace(TOC_NUMBER_PREFIX_REGEX, ""));
}

function resolvePageRefToPhysicalPageNumber(
  pageRef: number | null,
  pagesByNumber: Map<number, EnginePage>,
  pagesByPrintedNumber: Map<number, EnginePage>,
): number | null {
  if (pageRef === null || !Number.isFinite(pageRef) || pageRef < 1) {
    return null;
  }

  const byPrinted = pagesByPrintedNumber.get(pageRef);
  if (byPrinted) {
    return byPrinted.pageNumber;
  }

  if (pagesByNumber.has(pageRef)) {
    return pageRef;
  }

  return null;
}

function buildPrintedPageNumberMap(
  pages: EnginePage[],
): Map<number, EnginePage> {
  const map = new Map<number, EnginePage>();

  for (const page of pages) {
    if (!page.pageBox) {
      continue;
    }

    const lines = collectLinesWithText(page);
    if (lines.length === 0) {
      continue;
    }

    const pageBottom = page.pageBox.bottom;
    const pageHeight = page.pageBox.top - page.pageBox.bottom;
    const bottomZoneTop = pageBottom + pageHeight * 0.2;

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (line.centerY >= bottomZoneTop) {
        continue;
      }

      const normalized = normalizeText(line.text);
      if (!PAGE_NUMBER_ONLY_REGEX.test(normalized)) {
        continue;
      }

      const pageNumber = Number.parseInt(normalized.replace(/\s+/g, ""), 10);
      if (Number.isFinite(pageNumber) && pageNumber > 0) {
        map.set(pageNumber, page);
      }
      break;
    }
  }

  return map;
}

function isInsideMainTextRange(
  paragraph: ParagraphSegment,
  page: EnginePage,
  range: MainTextRange,
): boolean {
  if (
    page.pageNumber === range.startPageNumber &&
    range.startPageLowerBoundY !== null &&
    paragraph.startLine.centerY >= range.startPageLowerBoundY
  ) {
    return false;
  }

  if (
    page.pageNumber === range.endPageNumber &&
    range.endPageLowerBoundY !== null &&
    paragraph.startLine.centerY >= range.endPageLowerBoundY
  ) {
    return false;
  }

  return true;
}

function startsWithLetter(text: string): boolean {
  return /^\p{L}/u.test(text.trim());
}

function isTermDefinitionStartLine(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return false;
  }

  const matched = normalized.match(TERM_DEFINITION_LINE_REGEX);
  if (!matched?.groups) {
    return false;
  }

  const term = matched.groups.term.trim();
  const definition = matched.groups.definition.trim();
  if (term.length < 2 || term.length > 45) {
    return false;
  }
  if (definition.length < 8 || definition.length > 300) {
    return false;
  }
  if (/[,:;!?]\s*$/u.test(term)) {
    return false;
  }
  const termWordCount = term.split(/\s+/).length;
  if (termWordCount > 8) {
    return false;
  }
  if (!/[\p{L}\p{N}]/u.test(term) || !/[\p{L}\p{N}]/u.test(definition)) {
    return false;
  }

  return true;
}

function isAnchoredToGlobalLeft(
  paragraph: ParagraphSegment,
  globalLeftReference: number | null,
  context: EngineContext,
): boolean {
  if (globalLeftReference === null) {
    return true;
  }

  const tolerancePt = Math.max(
    context.config.margins.toleranceCm * POINTS_PER_CM,
    0.45 * POINTS_PER_CM,
  );

  return paragraph.mainLeft <= globalLeftReference + tolerancePt;
}

function resolveGlobalMainTextLeft(
  context: EngineContext,
  range: MainTextRange,
): number | null {
  const leftSamples = context.pages
    .filter(
      (page) =>
        page.pageNumber >= range.startPageNumber &&
        page.pageNumber <= range.endPageNumber &&
        page.marginBounds !== null &&
        Number.isFinite(page.marginBounds.left),
    )
    .map((page) => page.marginBounds?.left)
    .filter((left): left is number => typeof left === "number");

  if (leftSamples.length === 0) {
    return null;
  }

  return median(leftSamples);
}

function collectHeadingBoundsByPage(
  structure: ReturnType<typeof detectStructure>,
): Map<number, Array<{ left: number; right: number; bottom: number; top: number }>> {
  const byPage = new Map<
    number,
    Array<{ left: number; right: number; bottom: number; top: number }>
  >();
  for (const heading of structure.sectionHeadings) {
    if (heading.bounds.right <= heading.bounds.left) {
      continue;
    }
    if (heading.bounds.top <= heading.bounds.bottom) {
      continue;
    }
    const list = byPage.get(heading.pageNumber) ?? [];
    list.push(heading.bounds);
    byPage.set(heading.pageNumber, list);
  }
  for (const element of structure.structuralElements) {
    if (element.bounds.right <= element.bounds.left) {
      continue;
    }
    if (element.bounds.top <= element.bounds.bottom) {
      continue;
    }
    const list = byPage.get(element.pageNumber) ?? [];
    list.push(element.bounds);
    byPage.set(element.pageNumber, list);
  }
  return byPage;
}

function rectsOverlap(
  left: { left: number; right: number; bottom: number; top: number },
  right: { left: number; right: number; bottom: number; top: number },
): boolean {
  const overlapLeft = Math.max(left.left, right.left);
  const overlapRight = Math.min(left.right, right.right);
  const overlapBottom = Math.max(left.bottom, right.bottom);
  const overlapTop = Math.min(left.top, right.top);
  return overlapRight > overlapLeft && overlapTop > overlapBottom;
}

function isTableRelatedParagraph(paragraph: ParagraphSegment): boolean {
  return paragraph.lines.some((line) => isTableRelatedLine(line.text));
}

function isTableRelatedLine(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return (
    isTableCaptionOrContinuationLine(normalized) ||
    hasTableReferenceInText(normalized)
  );
}

function resolveTopTableCaptionY(
  paragraphLines: ParagraphSegment["lines"],
): number | null {
  const candidates = paragraphLines
    .filter((line) => isTableCaptionOrContinuationLine(line.text))
    .map((line) => line.centerY);
  if (candidates.length === 0) {
    return null;
  }
  return Math.max(...candidates);
}

function isBelowTopTableCaption(
  paragraph: ParagraphSegment,
  topTableCaptionY: number | null,
): boolean {
  if (topTableCaptionY === null) {
    return false;
  }

  return paragraph.startLine.centerY <= topTableCaptionY;
}

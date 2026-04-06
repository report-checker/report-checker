import type { CheckerConfig } from "../../checker-config";
import { analyzePageLayout, median, POINTS_PER_CM } from "../text-set-core";
import type { EnginePage } from "../types";
import { collectLinesWithText } from "./collect-lines";
import {
  collectSectionHeadingCandidates,
  collectStructuralElements,
  selectSectionHeadingsByToc,
} from "./detect-structure-headings";
import {
  collectTocHeadingTargets,
  detectTocHeading,
  detectTocPageNumbers,
  parseTocEntries,
  splitTocEntriesByAppendix,
} from "./detect-structure-toc";
import type { DetectedStructure, TextLineWithText } from "./types";

export function detectStructure(
  pages: EnginePage[],
  config: CheckerConfig,
): DetectedStructure {
  const dsConfig = config.documentStructure;
  const typoConfig = config.typography;
  const centerTolerancePt = dsConfig.centerToleranceCm * POINTS_PER_CM;
  const headingIndentExpectedPt = typoConfig.indentExpectedCm * POINTS_PER_CM;
  const headingIndentTolerancePt = typoConfig.indentToleranceCm * POINTS_PER_CM;
  const minFollowingBodyLinesOnPage = 1;

  const bodyFontSamples: number[] = [];
  const mainLeftByPage = new Map<number, number | null>();

  for (const page of pages) {
    const layout = analyzePageLayout(page, typoConfig);
    mainLeftByPage.set(page.pageNumber, layout?.mainLeft ?? null);
    if (layout?.bodyFontPt) {
      bodyFontSamples.push(layout.bodyFontPt);
    }
  }

  const bodyFontPt =
    bodyFontSamples.length > 0 ? median(bodyFontSamples) : null;

  const linesByPage = new Map<number, TextLineWithText[]>();
  for (const page of pages) {
    linesByPage.set(page.pageNumber, collectLinesWithText(page));
  }

  const titlePageNumber = pages[0]?.pageNumber ?? null;
  const titlePageLines =
    titlePageNumber !== null ? (linesByPage.get(titlePageNumber) ?? []) : [];

  const tocHeading = detectTocHeading(pages, linesByPage, centerTolerancePt);
  const tocPageNumbers = detectTocPageNumbers(
    tocHeading.tocPageNumber,
    linesByPage,
  );
  const tocPageNumbersSet = new Set(tocPageNumbers);
  const tocEntries = parseTocEntries(
    tocPageNumbers,
    tocHeading.tocHeadingLine,
    linesByPage,
    pages.length,
  );

  const structuralElements = collectStructuralElements(
    pages,
    linesByPage,
    tocPageNumbersSet,
    dsConfig,
    centerTolerancePt,
  );

  const sectionHeadingCandidates = collectSectionHeadingCandidates({
    pages,
    linesByPage,
    tocPageNumbers: tocPageNumbersSet,
    dsConfig,
    bodyFontPt,
    typographyMinFontSizePt: config.typography.minFontSizePt,
    headingIndentExpectedPt,
    headingIndentTolerancePt,
    minFollowingBodyLinesOnPage,
    mainLeftByPage,
  });

  const { mainEntries: tocMainEntries } = splitTocEntriesByAppendix(tocEntries);
  const tocHeadingTargets = collectTocHeadingTargets(tocMainEntries);
  const sectionHeadings = selectSectionHeadingsByToc(
    sectionHeadingCandidates,
    tocHeadingTargets,
  );

  const allBodyLines: TextLineWithText[] = [];
  for (const page of pages) {
    if (tocPageNumbersSet.has(page.pageNumber)) continue;
    allBodyLines.push(...(linesByPage.get(page.pageNumber) ?? []));
  }

  return {
    bodyFontPt,
    titlePageNumber,
    titlePageLines,
    tocPageNumber: tocHeading.tocPageNumber,
    tocPageNumbers,
    tocHeadingName: tocHeading.tocHeadingName,
    tocHeadingRawText: tocHeading.tocHeadingRawText,
    tocHeadingIssues: tocHeading.tocHeadingIssues,
    tocHeadingBounds: tocHeading.tocHeadingBounds,
    tocHeadingMarginBounds: tocHeading.tocHeadingMarginBounds,
    tocHeadingPageBox: tocHeading.tocHeadingPageBox,
    tocEntries,
    structuralElements,
    sectionHeadings,
    sectionHeadingCandidates,
    allBodyLines,
    requiredStructuralElements: dsConfig.requiredStructuralElements,
  };
}

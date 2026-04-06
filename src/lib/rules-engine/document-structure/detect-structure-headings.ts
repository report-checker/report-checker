import type { CheckerConfig } from "../../checker-config";
import type { EnginePage, PdfRect } from "../types";
import { normalizeForMatching, normalizeText } from "./collect-lines";
import {
  PERIOD_AT_END_REGEX,
  SECTION_NUMBER_REGEX,
  TOC_PAGE_NUMBER_ONLY_REGEX,
} from "./constants";
import { isCenteredWithinTolerance } from "./shared-utils";
import type { TocHeadingTarget } from "./detect-structure-toc";
import type { FoundElement, FoundHeading, TextLineWithText } from "./types";

export function collectStructuralElements(
  pages: EnginePage[],
  linesByPage: Map<number, TextLineWithText[]>,
  tocPageNumbers: Set<number>,
  dsConfig: CheckerConfig["documentStructure"],
  centerTolerancePt: number,
): FoundElement[] {
  const structuralElements: FoundElement[] = [];

  function tryMatchStructuralElement(
    rawText: string,
    norm: string,
    issues: string[],
    page: EnginePage,
    bounds: PdfRect,
  ) {
    const exactMatch = dsConfig.structuralElementNames.find(
      (name) => name === norm,
    );
    const normNoPeriod = norm.replace(PERIOD_AT_END_REGEX, "");
    const fuzzyMatch =
      !exactMatch && normNoPeriod !== norm
        ? dsConfig.structuralElementNames.find((name) => name === normNoPeriod)
        : undefined;
    const matched = exactMatch ?? fuzzyMatch;
    if (!matched) return false;

    if (fuzzyMatch) issues.push("Заголовок заканчивается точкой.");
    if (/\p{L}/u.test(rawText) && /\p{Ll}/u.test(rawText)) {
      issues.push("Заголовок должен быть напечатан прописными буквами.");
    }
    const referenceBox = page.marginBounds ?? page.pageBox;
    if (referenceBox) {
      if (!isCenteredWithinTolerance(bounds, referenceBox, centerTolerancePt)) {
        issues.push("Заголовок не выровнен по центру строки.");
      }
    }

    structuralElements.push({
      name: matched,
      rawText,
      pageNumber: page.pageNumber,
      pageBox: page.pageBox,
      marginBounds: page.marginBounds,
      bounds,
      issues,
    });
    return true;
  }

  for (const page of pages) {
    if (tocPageNumbers.has(page.pageNumber)) continue;
    const lines = linesByPage.get(page.pageNumber) ?? [];
    const matchedLineIndices = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].text.trim();
      const norm = normalizeText(lines[i].text);
      if (tryMatchStructuralElement(raw, norm, [], page, lines[i].bounds)) {
        matchedLineIndices.add(i);
      }
    }

    for (let i = 0; i < lines.length - 1; i++) {
      if (matchedLineIndices.has(i) || matchedLineIndices.has(i + 1)) continue;

      const combinedRaw = `${lines[i].text} ${lines[i + 1].text}`.trim();
      const combined = normalizeText(combinedRaw);
      const combinedBounds: PdfRect = {
        left: Math.min(lines[i].left, lines[i + 1].left),
        right: Math.max(lines[i].right, lines[i + 1].right),
        bottom: Math.min(lines[i].bounds.bottom, lines[i + 1].bounds.bottom),
        top: Math.max(lines[i].bounds.top, lines[i + 1].bounds.top),
      };

      if (
        tryMatchStructuralElement(
          combinedRaw,
          combined,
          [],
          page,
          combinedBounds,
        )
      ) {
        matchedLineIndices.add(i);
        matchedLineIndices.add(i + 1);
      }
    }
  }

  return structuralElements;
}

export function collectSectionHeadingCandidates(options: {
  pages: EnginePage[];
  linesByPage: Map<number, TextLineWithText[]>;
  tocPageNumbers: Set<number>;
  dsConfig: CheckerConfig["documentStructure"];
  bodyFontPt: number | null;
  typographyMinFontSizePt: number;
  headingIndentExpectedPt: number;
  headingIndentTolerancePt: number;
  minFollowingBodyLinesOnPage: number;
  mainLeftByPage: Map<number, number | null>;
}): FoundHeading[] {
  const {
    pages,
    linesByPage,
    tocPageNumbers,
    dsConfig,
    bodyFontPt,
    typographyMinFontSizePt,
    headingIndentExpectedPt,
    headingIndentTolerancePt,
    minFollowingBodyLinesOnPage,
    mainLeftByPage,
  } = options;

  const sectionHeadingCandidates: FoundHeading[] = [];

  for (const page of pages) {
    if (tocPageNumbers.has(page.pageNumber)) continue;

    const lines = linesByPage.get(page.pageNumber) ?? [];
    const referenceLeft = mainLeftByPage.get(page.pageNumber) ?? null;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const norm = normalizeText(line.text);
      if (dsConfig.structuralElementNames.some((name) => name === norm)) {
        continue;
      }

      const rawText = line.text.trim();
      const match = SECTION_NUMBER_REGEX.exec(rawText);
      if (!match) continue;

      const number = match[1];
      const hasTrailingNumberDot = match[2] === ".";
      const title = match[3].trim();
      const issues: string[] = [];

      if (hasTrailingNumberDot) {
        issues.push("После номера раздела/подраздела не ставится точка.");
      }

      const headingLevel = number.split(".").length;
      const expectedFontPt =
        headingLevel > 1
          ? (bodyFontPt ?? typographyMinFontSizePt)
          : dsConfig.sectionHeadingExpectedFontPt;

      if (line.fontSizePt === null) {
        issues.push("Размер шрифта не определён.");
      } else if (
        Math.abs(line.fontSizePt - expectedFontPt) >
        dsConfig.sectionHeadingFontTolerancePt
      ) {
        issues.push(
          `Размер шрифта ${line.fontSizePt.toFixed(1)} пт (ожидается ${expectedFontPt} пт).`,
        );
      }

      if (PERIOD_AT_END_REGEX.test(title)) {
        issues.push("Заголовок заканчивается точкой.");
      }

      const firstLetter = extractFirstLetter(title);
      if (
        firstLetter &&
        headingLevel === 1 &&
        !isUppercaseLetter(firstLetter)
      ) {
        issues.push("Заголовок раздела должен начинаться с прописной буквы.");
      }
      if (firstLetter && headingLevel > 1 && !isUppercaseLetter(firstLetter)) {
        issues.push(
          "Заголовок подраздела должен начинаться с прописной буквы.",
        );
      }

      if (hasHeadingHyphenation(rawText, title)) {
        issues.push(
          "В заголовке обнаружены признаки переноса слова (знак переноса/мягкий перенос).",
        );
      }

      if (referenceLeft !== null) {
        const expectedHeadingLeft = referenceLeft + headingIndentExpectedPt;
        if (
          Math.abs(line.left - expectedHeadingLeft) > headingIndentTolerancePt
        ) {
          issues.push("Заголовок должен быть записан с абзацного отступа.");
        }
      }

      const followingBodyLinesCount = countFollowingBodyLines(
        lines,
        i,
        dsConfig,
      );
      if (followingBodyLinesCount < minFollowingBodyLinesOnPage) {
        issues.push(
          "Заголовок расположен в конце страницы: после него должна помещаться хотя бы одна строка следующего текста.",
        );
      }

      sectionHeadingCandidates.push({
        number,
        hasTrailingNumberDot,
        title,
        rawText,
        pageNumber: page.pageNumber,
        pageBox: page.pageBox,
        bounds: line.bounds,
        fontSizePt: line.fontSizePt,
        issues,
      });
    }
  }

  return sectionHeadingCandidates;
}

export function selectSectionHeadingsByToc(
  sectionHeadingCandidates: FoundHeading[],
  tocHeadingTargets: TocHeadingTarget[],
): FoundHeading[] {
  if (tocHeadingTargets.length === 0) {
    return [];
  }

  const usedCandidates = new Set<number>();
  const selected: FoundHeading[] = [];

  for (const tocHeading of tocHeadingTargets) {
    let bestCandidateIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < sectionHeadingCandidates.length; index += 1) {
      if (usedCandidates.has(index)) {
        continue;
      }

      const candidate = sectionHeadingCandidates[index];
      const score = scoreSectionCandidateForToc(candidate, tocHeading);
      if (score > bestScore) {
        bestScore = score;
        bestCandidateIndex = index;
      }
    }

    const minScore = tocHeading.numberVariants.length > 0 ? 80 : 55;
    if (bestCandidateIndex !== -1 && bestScore >= minScore) {
      usedCandidates.add(bestCandidateIndex);
      const candidate = sectionHeadingCandidates[bestCandidateIndex];
      // Normalize number to dot-separated form (e.g. pdfium renders "1.1" as "1 1",
      // so candidate.number may be "1" — fix it using the TOC target's dotted variant)
      const dottedVariant = tocHeading.numberVariants.find((v) => v.includes("."));
      const normalizedNumber = dottedVariant ?? candidate.number;
      const selectedHeading =
        normalizedNumber !== candidate.number
          ? { ...candidate, number: normalizedNumber }
          : candidate;
      selected.push(selectedHeading);
    }
  }

  return selected;
}

function scoreSectionCandidateForToc(
  candidate: FoundHeading,
  tocHeading: TocHeadingTarget,
): number {
  const pageDistance = Math.abs(candidate.pageNumber - tocHeading.pageRef);
  if (pageDistance > 2) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  const titleNorm = normalizeForMatching(candidate.title);
  const numberNorm = candidate.number.trim();

  if (tocHeading.numberVariants.includes(numberNorm)) {
    score += 120;
  }
  if (titleNorm === tocHeading.titleNorm) {
    score += 100;
  } else {
    const minLength = Math.min(titleNorm.length, tocHeading.titleNorm.length);
    if (
      minLength >= 10 &&
      (titleNorm.includes(tocHeading.titleNorm) ||
        tocHeading.titleNorm.includes(titleNorm))
    ) {
      score += 55;
    }
  }

  // Fallback: pdfium may render "1.1" as "1 1" (space instead of dot), causing
  // the number to be mis-parsed. Compare the full normalized candidate text
  // (number + title concatenated) against the full normalized TOC entry title.
  if (score < 80 && tocHeading.fullNorm.length >= 4) {
    const candidateFullNorm = normalizeForMatching(
      `${candidate.number}${candidate.title}`,
    );
    if (candidateFullNorm === tocHeading.fullNorm) {
      score += 100;
    }
  }

  score -= pageDistance * 20;
  return score;
}

function extractFirstLetter(text: string): string | null {
  const match = text.match(/\p{L}/u);
  return match ? match[0] : null;
}

function isUppercaseLetter(letter: string): boolean {
  return letter === letter.toUpperCase() && letter !== letter.toLowerCase();
}

function hasHeadingHyphenation(rawText: string, title: string): boolean {
  return (
    /-\s*$/u.test(rawText) || /-\s*$/u.test(title) || /\u00AD/u.test(rawText)
  );
}

function countFollowingBodyLines(
  lines: TextLineWithText[],
  headingIndex: number,
  dsConfig: CheckerConfig["documentStructure"],
): number {
  let count = 0;

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const rawText = lines[index].text.trim();
    if (!rawText) {
      continue;
    }
    if (!/[\p{L}\p{N}]/u.test(rawText)) {
      continue;
    }
    if (TOC_PAGE_NUMBER_ONLY_REGEX.test(rawText)) {
      continue;
    }
    const norm = normalizeText(rawText);
    if (dsConfig.structuralElementNames.some((name) => name === norm)) {
      continue;
    }
    if (SECTION_NUMBER_REGEX.test(rawText)) {
      continue;
    }

    count += 1;
  }

  return count;
}

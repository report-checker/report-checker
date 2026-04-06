import type { EnginePage, PdfRect } from "../types";
import {
  normalizeForMatching,
  normalizeText,
} from "./collect-lines";
import type { TextLineWithText } from "./types";
import {
  PERIOD_AT_END_REGEX,
  TOC_DOT_LEADER_ONLY_REGEX,
  TOC_ENTRY_NUMBER_BEFORE_DOTS_REGEX,
  TOC_ENTRY_REGEX,
  TOC_PAGE_NUMBER_ONLY_REGEX,
} from "./constants";
import { isCenteredWithinTolerance } from "./shared-utils";
import type { TocEntry } from "./types";

export type TocHeadingTarget = {
  pageRef: number;
  titleNorm: string;
  numberVariants: string[];
  fullNorm: string;
};

export type TocHeadingDetection = {
  tocPageNumber: number | null;
  tocHeadingName: string | null;
  tocHeadingRawText: string | null;
  tocHeadingIssues: string[];
  tocHeadingLine: TextLineWithText | null;
  tocHeadingBounds: PdfRect | null;
  tocHeadingMarginBounds: PdfRect | null;
  tocHeadingPageBox: PdfRect | null;
};

const MAX_PENDING_TITLE_PARTS = 2;
const MAX_PENDING_TITLE_CHARS = 180;
const ENTRY_START_NUMBER_PATTERN = String.raw`\d+(?:(?:\.\d+)|(?:\s\d+)){0,3}`;
const FRESH_ENTRY_START_REGEX = new RegExp(
  String.raw`^\s*${ENTRY_START_NUMBER_PATTERN}\.?\s+\p{Lu}`,
  "u",
);
const INTERNAL_ENTRY_START_REGEX = new RegExp(
  String.raw`\s${ENTRY_START_NUMBER_PATTERN}\s+\p{Lu}`,
  "gu",
);
const MERGED_LINE_SPLIT_REGEX = new RegExp(
  String.raw`\s+(?=${ENTRY_START_NUMBER_PATTERN}\s+\p{Lu})`,
  "u",
);

export function detectTocHeading(
  pages: EnginePage[],
  linesByPage: Map<number, TextLineWithText[]>,
  centerTolerancePt: number,
): TocHeadingDetection {
  const TOC_HEADING_NAMES = ["СОДЕРЖАНИЕ", "ОГЛАВЛЕНИЕ"] as const;

  let tocPageNumber: number | null = null;
  let tocHeadingName: string | null = null;
  let tocHeadingRawText: string | null = null;
  let tocHeadingIssues: string[] = [];
  let tocHeadingLine: TextLineWithText | null = null;
  let tocHeadingBounds: PdfRect | null = null;
  let tocHeadingMarginBounds: PdfRect | null = null;
  let tocHeadingPageBox: PdfRect | null = null;

  outer: for (const page of pages) {
    const lines = linesByPage.get(page.pageNumber) ?? [];
    for (const line of lines) {
      const rawText = line.text.trim();
      const norm = normalizeText(line.text);
      const normNoPeriod = norm.replace(PERIOD_AT_END_REGEX, "");
      if (
        TOC_HEADING_NAMES.some((name) => name === norm || name === normNoPeriod)
      ) {
        tocPageNumber = page.pageNumber;
        tocHeadingName = normNoPeriod;
        tocHeadingRawText = rawText;
        tocHeadingLine = line;
        tocHeadingBounds = line.bounds;
        tocHeadingMarginBounds = page.marginBounds;
        tocHeadingPageBox = page.pageBox;

        const issues: string[] = [];
        if (normNoPeriod !== norm) {
          issues.push("Заголовок «СОДЕРЖАНИЕ» заканчивается точкой.");
        }
        if (/\p{L}/u.test(rawText) && /\p{Ll}/u.test(rawText)) {
          issues.push(
            "Заголовок «СОДЕРЖАНИЕ» должен быть напечатан прописными буквами.",
          );
        }
        const referenceBox = page.marginBounds ?? page.pageBox;
        if (referenceBox) {
          if (!isCenteredWithinTolerance(line.bounds, referenceBox, centerTolerancePt)) {
            issues.push(
              "Заголовок «СОДЕРЖАНИЕ» должен быть выровнен по центру строки.",
            );
          }
        }

        tocHeadingIssues = issues;
        break outer;
      }
    }
  }

  return {
    tocPageNumber,
    tocHeadingName,
    tocHeadingRawText,
    tocHeadingIssues,
    tocHeadingLine,
    tocHeadingBounds,
    tocHeadingMarginBounds,
    tocHeadingPageBox,
  };
}

export function parseTocEntries(
  tocPageNumbers: number[],
  tocHeadingLine: TextLineWithText | null,
  linesByPage: Map<number, TextLineWithText[]>,
  pageCount: number,
): TocEntry[] {
  const tocEntries: TocEntry[] = [];

  if (tocPageNumbers.length === 0 || tocHeadingLine === null) {
    return tocEntries;
  }

  const pendingTitleParts: string[] = [];
  const tocHeadingPageNumber = tocHeadingLine.pageNumber;

  for (const tocPageNumber of tocPageNumbers) {
    if (tocPageNumber !== tocHeadingPageNumber) {
      pendingTitleParts.length = 0;
    }

    const tocLines = linesByPage.get(tocPageNumber) ?? [];
    for (const line of tocLines) {
      if (
        tocPageNumber === tocHeadingPageNumber &&
        line.centerY >= tocHeadingLine.centerY
      ) {
        continue;
      }
      const rawText = line.text.trim();
      if (!rawText) continue;

      const lineSegments = splitPotentialMergedTocLine(rawText);
      for (const segmentText of lineSegments) {
        if (!segmentText) continue;
        if (TOC_DOT_LEADER_ONLY_REGEX.test(segmentText)) continue;
        if (TOC_PAGE_NUMBER_ONLY_REGEX.test(segmentText)) continue;

        const parsedEntry = parseTocEntryCandidate(segmentText);
        if (!parsedEntry) {
          maybeTrackPendingTitlePart(segmentText, pendingTitleParts);
          continue;
        }

        const pageRef = parsedEntry.pageRef;
        if (pageRef < 2 || pageRef > pageCount + 20) {
          maybeTrackPendingTitlePart(segmentText, pendingTitleParts);
          continue;
        }

        const title =
          pendingTitleParts.length > 0
            ? `${pendingTitleParts.join(" ")} ${parsedEntry.titlePart}`
                .trim()
                .replace(/\s+/g, " ")
            : parsedEntry.titlePart;
        pendingTitleParts.length = 0;

        if (!title || Number.isNaN(pageRef)) continue;

        tocEntries.push({
          title,
          pageRef,
          bounds: line.bounds,
          pageNumber: line.pageNumber,
          pageBox: line.pageBox,
        });
      }
    }
  }

  return tocEntries;
}

export function detectTocPageNumbers(
  tocPageNumber: number | null,
  linesByPage: Map<number, TextLineWithText[]>,
): number[] {
  if (tocPageNumber === null) {
    return [];
  }

  const sortedPageNumbers = [...linesByPage.keys()].sort((a, b) => a - b);
  const tocStartIndex = sortedPageNumbers.indexOf(tocPageNumber);
  if (tocStartIndex === -1) {
    return [tocPageNumber];
  }

  const tocPages = [tocPageNumber];
  for (
    let pageIndex = tocStartIndex + 1;
    pageIndex < sortedPageNumbers.length;
    pageIndex += 1
  ) {
    const pageNumber = sortedPageNumbers[pageIndex];
    const lines = linesByPage.get(pageNumber) ?? [];
    if (!isLikelyTocContinuationPage(lines)) {
      break;
    }

    tocPages.push(pageNumber);
  }

  return tocPages;
}

export function collectTocHeadingTargets(
  tocEntries: TocEntry[],
): TocHeadingTarget[] {
  const headings: TocHeadingTarget[] = [];

  for (const entry of tocEntries) {
    const parsed = parseNumberedTocHeading(entry.title);
    const titleSource = parsed?.title ?? entry.title;
    const titleNorm = normalizeForMatching(titleSource);
    if (titleNorm.length === 0) {
      continue;
    }

    headings.push({
      pageRef: entry.pageRef,
      titleNorm,
      numberVariants: parsed?.numberVariants ?? [],
      fullNorm: normalizeForMatching(entry.title),
    });
  }

  return headings;
}

export function splitTocEntriesByAppendix(tocEntries: TocEntry[]): {
  mainEntries: TocEntry[];
  appendixEntries: TocEntry[];
} {
  const appendixStartIndex = tocEntries.findIndex((entry) =>
    isAppendixHeading(entry.title),
  );
  if (appendixStartIndex === -1) {
    return {
      mainEntries: tocEntries,
      appendixEntries: [],
    };
  }

  return {
    mainEntries: tocEntries.slice(0, appendixStartIndex),
    appendixEntries: tocEntries.slice(appendixStartIndex),
  };
}

export function detectAppendixStartPageFromTocEntries(
  tocEntries: TocEntry[],
): number | null {
  const { appendixEntries } = splitTocEntriesByAppendix(tocEntries);
  const firstAppendixEntry = appendixEntries[0];
  if (!firstAppendixEntry) {
    return null;
  }

  return Number.isFinite(firstAppendixEntry.pageRef)
    ? firstAppendixEntry.pageRef
    : null;
}

function parseNumberedTocHeading(
  title: string,
): { title: string; numberVariants: string[] } | null {
  const match = /^\s*(\d+(?:[.\s]+\d+)*)\.?\s+(.+)$/u.exec(title);
  if (!match) {
    return null;
  }

  const rawNumber = match[1].trim();
  const headingTitle = match[2].trim();
  if (!headingTitle) {
    return null;
  }

  const numberVariants = normalizeNumberVariants(rawNumber);
  if (numberVariants.length === 0) {
    return null;
  }

  return {
    title: headingTitle,
    numberVariants,
  };
}

function normalizeNumberVariants(raw: string): string[] {
  const variants = new Set<string>();
  const compact = raw.trim().replace(/\s+/g, " ");

  if (compact.includes(".")) {
    const normalized = compact.replace(/\s+/g, "").replace(/\.+/g, ".");
    variants.add(normalized.replace(/\.$/, ""));
    return [...variants];
  }

  const parts = compact.split(" ").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return [];
  }

  variants.add(parts.join(""));
  if (parts.length > 1) {
    variants.add(parts.join("."));
  }

  return [...variants];
}

function parseTocEntryCandidate(
  rawText: string,
): { titlePart: string; pageRef: number } | null {
  const directMatch =
    TOC_ENTRY_REGEX.exec(rawText) ??
    TOC_ENTRY_NUMBER_BEFORE_DOTS_REGEX.exec(rawText);
  if (directMatch) {
    return parseTocEntryFromMatch(directMatch);
  }

  // Some PDFium extracts inject tiny OCR-like fragments between the page
  // number and dot leaders, e.g. "... 1 3. у . . .". Accept up to a few
  // short words in that gap to avoid dropping the TOC entry entirely.
  const noisyLeaderMatch =
    /^(.+?)\s+(\d(?:\s*\d)*)(?:\.\s*)?(?:\p{L}{1,3}(?:\s+\p{L}{1,3}){0,2}\s*)?(?:[.\s·•…⋯]{3,})$/u.exec(
      rawText,
    );
  if (!noisyLeaderMatch) {
    return null;
  }

  return parseTocEntryFromMatch(noisyLeaderMatch);
}

function parseTocEntryFromMatch(
  match: RegExpExecArray,
): { titlePart: string; pageRef: number } | null {
  const titlePart = (match[1] ?? "").trim().replace(/\s+/g, " ");
  const pageRefText = (match[2] ?? "").replace(/\s+/g, "");
  const pageRef = Number.parseInt(pageRefText, 10);
  if (!titlePart || Number.isNaN(pageRef)) {
    return null;
  }

  return {
    titlePart,
    pageRef,
  };
}

function maybeTrackPendingTitlePart(
  rawText: string,
  pendingTitleParts: string[],
): void {
  if (!/[\p{L}0-9]/u.test(rawText)) {
    pendingTitleParts.length = 0;
    return;
  }

  if (looksLikeFreshEntryStart(rawText)) {
    pendingTitleParts.length = 0;
  }

  pendingTitleParts.push(rawText);
  if (pendingTitleParts.length > MAX_PENDING_TITLE_PARTS) {
    pendingTitleParts.length = 0;
    return;
  }

  const pendingTextLength = pendingTitleParts.reduce(
    (sum, part) => sum + part.length,
    0,
  );
  if (pendingTextLength > MAX_PENDING_TITLE_CHARS) {
    pendingTitleParts.length = 0;
  }
}

function looksLikeFreshEntryStart(rawText: string): boolean {
  return FRESH_ENTRY_START_REGEX.test(rawText);
}

function splitPotentialMergedTocLine(rawText: string): string[] {
  const normalized = rawText.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return [];
  }

  const internalEntryStarts =
    normalized.match(INTERNAL_ENTRY_START_REGEX) ?? [];
  if (internalEntryStarts.length < 2) {
    return [normalized];
  }

  const segments = normalized
    .split(MERGED_LINE_SPLIT_REGEX)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  return segments.length > 0 ? segments : [normalized];
}

function isLikelyTocContinuationPage(lines: TextLineWithText[]): boolean {
  const contentLines = lines
    .map((line) => line.text.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !TOC_PAGE_NUMBER_ONLY_REGEX.test(line));

  if (contentLines.length === 0) {
    return false;
  }

  let parsedEntries = 0;
  let paragraphLikeLines = 0;

  for (const rawText of contentLines.slice(0, 30)) {
    const segments = splitPotentialMergedTocLine(rawText);
    let hasParsedSegment = false;
    for (const segment of segments) {
      if (parseTocEntryCandidate(segment)) {
        parsedEntries += 1;
        hasParsedSegment = true;
      }
    }

    if (hasParsedSegment) {
      continue;
    }

    if (/(?:\p{L}{5,}\s+){2}\p{L}{5,}/u.test(rawText)) {
      paragraphLikeLines += 1;
    }
  }

  if (parsedEntries >= 3) {
    return true;
  }

  return parsedEntries >= 2 && paragraphLikeLines <= 1;
}

function isAppendixHeading(title: string): boolean {
  const normalized = normalizeText(title);
  return (
    normalized.startsWith("ПРИЛОЖЕНИЕ") || normalized.startsWith("ПРИЛОЖЕНИЯ")
  );
}

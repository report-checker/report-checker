import type { EnginePage } from "../../types";
import { collectLinesWithText, normalizeText } from "../collect-lines";
import type { DetectedStructure } from "../types";
import type {
  AppendicesDetection,
  AppendixHeading,
  AppendixNumberScheme,
  AppendixReference,
  AppendixTocEntry,
  AppendixTocItem,
} from "./types";

const APPENDIX_HEADING_REGEX =
  /^ПРИЛОЖЕНИ[ЕЯ]\s+([0-9]+|[А-ЯЁ])([.)])?\s*(.*)$/u;
const APPENDIX_REFERENCE_REGEX = /ПРИЛОЖЕНИ(?:Е|Я|Ю|ЕМ|И)\s+([0-9]+|[А-ЯЁ])/gu;
const PAGE_NUMBER_ONLY_REGEX = /^\d(?:\s*\d)*$/u;
const RUSSIAN_ALPHABET = Array.from("АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ");

export function detectAppendices(
  pages: EnginePage[],
  structure: DetectedStructure,
): AppendicesDetection {
  const tocPages = new Set(structure.tocPageNumbers);
  const referencesByIdentifier = new Map<string, AppendixReference[]>();
  const pagesByNumber = new Map<number, EnginePage>();
  const linesByPage = new Map<
    number,
    ReturnType<typeof collectLinesWithText>
  >();

  for (const page of pages) {
    pagesByNumber.set(page.pageNumber, page);
    const lines = collectLinesWithText(page);
    linesByPage.set(page.pageNumber, lines);

    if (tocPages.has(page.pageNumber)) {
      continue;
    }

    for (const line of lines) {
      const rawText = line.text.trim();
      if (!rawText) {
        continue;
      }

      const normalized = normalizeText(rawText);
      if (PAGE_NUMBER_ONLY_REGEX.test(normalized)) {
        continue;
      }

      APPENDIX_REFERENCE_REGEX.lastIndex = 0;
      while (true) {
        const referenceMatch = APPENDIX_REFERENCE_REGEX.exec(normalized);
        if (referenceMatch === null) {
          break;
        }

        const identifierRaw = referenceMatch[1]?.trim();
        if (!identifierRaw) {
          continue;
        }
        const parsedIdentifier = parseAppendixIdentifier(identifierRaw);
        if (!parsedIdentifier) {
          continue;
        }

        const reference: AppendixReference = {
          identifierNorm: parsedIdentifier.norm,
          rawText,
          pageNumber: line.pageNumber,
          pageBox: line.pageBox,
          bounds: line.bounds,
          centerY: line.centerY,
        };
        const existing = referencesByIdentifier.get(parsedIdentifier.norm);
        if (existing) {
          existing.push(reference);
        } else {
          referencesByIdentifier.set(parsedIdentifier.norm, [reference]);
        }
      }
    }
  }

  const pagesByPrintedNumber = buildPrintedPageNumberMap(pages, linesByPage);

  const tocAppendixEntries = collectTopLevelAppendixTocEntries(structure);
  const tocItems: AppendixTocItem[] = tocAppendixEntries.map((tocEntry) => ({
    tocEntry,
    heading: findHeadingForTocEntry(
      tocEntry,
      pagesByNumber,
      pagesByPrintedNumber,
      linesByPage,
    ),
  }));

  const headings = tocItems
    .map((item) => item.heading)
    .filter((heading): heading is AppendixHeading => heading !== null);

  return {
    tocItems,
    headings,
    referencesByIdentifier,
    structure,
    pagesByNumber,
    pagesByPrintedNumber,
    linesByPage,
  };
}

function collectTopLevelAppendixTocEntries(
  structure: DetectedStructure,
): AppendixTocEntry[] {
  const entries: AppendixTocEntry[] = [];

  for (const tocEntry of structure.tocEntries) {
    const parsed = parseAppendixHeadingText(tocEntry.title);
    if (!parsed) {
      continue;
    }

    entries.push({
      tocEntry,
      identifierRaw: parsed.identifierRaw,
      identifierNorm: parsed.identifierNorm,
      sequenceValue: parsed.sequenceValue,
      scheme: parsed.scheme,
      trailingDot: parsed.trailingDot,
      inlineTitleText: parsed.inlineTitleText,
    });
  }

  entries.sort((left, right) => left.tocEntry.pageRef - right.tocEntry.pageRef);
  return entries;
}

function buildPrintedPageNumberMap(
  pages: EnginePage[],
  linesByPage: Map<number, ReturnType<typeof collectLinesWithText>>,
): Map<number, EnginePage> {
  const result = new Map<number, EnginePage>();
  for (const page of pages) {
    if (!page.pageBox) continue;
    const pageBottom = page.pageBox.bottom;
    const pageHeight = page.pageBox.top - page.pageBox.bottom;
    const bottomZoneTop = pageBottom + pageHeight * 0.2;
    const lines = linesByPage.get(page.pageNumber) ?? [];
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (line.centerY >= bottomZoneTop) continue;
      const text = normalizeText(line.text.trim());
      if (!PAGE_NUMBER_ONLY_REGEX.test(text)) continue;
      const num = Number.parseInt(text.replace(/\s+/g, ""), 10);
      if (Number.isFinite(num) && num > 0) {
        result.set(num, page);
      }
      break;
    }
  }
  return result;
}

function findHeadingForTocEntry(
  tocEntry: AppendixTocEntry,
  pagesByNumber: Map<number, EnginePage>,
  pagesByPrintedNumber: Map<number, EnginePage>,
  linesByPage: Map<number, ReturnType<typeof collectLinesWithText>>,
): AppendixHeading | null {
  const resolvedPage =
    pagesByPrintedNumber.get(tocEntry.tocEntry.pageRef) ??
    pagesByNumber.get(tocEntry.tocEntry.pageRef);
  const physicalPageNumber = resolvedPage?.pageNumber ?? tocEntry.tocEntry.pageRef;
  const page = resolvedPage;
  const lines = linesByPage.get(physicalPageNumber) ?? [];
  if (!page || !page.pageBox || lines.length === 0) {
    return null;
  }

  const candidates: AppendixHeading[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const parsed = parseAppendixHeadingText(line.text);
    if (!parsed) {
      continue;
    }
    if (
      tocEntry.identifierNorm &&
      parsed.identifierNorm &&
      tocEntry.identifierNorm !== parsed.identifierNorm
    ) {
      continue;
    }

    candidates.push({
      identifierRaw: parsed.identifierRaw,
      identifierNorm: parsed.identifierNorm,
      sequenceValue: parsed.sequenceValue,
      scheme: parsed.scheme,
      trailingDot: parsed.trailingDot,
      inlineTitleText: parsed.inlineTitleText,
      rawText: line.text.trim(),
      pageNumber: line.pageNumber,
      pageBox: line.pageBox,
      bounds: line.bounds,
      centerY: line.centerY,
      lineIndex,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.centerY - left.centerY);
  return candidates[0];
}

function parseAppendixHeadingText(text: string): {
  identifierRaw: string | null;
  identifierNorm: string | null;
  sequenceValue: number | null;
  scheme: AppendixNumberScheme | null;
  trailingDot: boolean;
  inlineTitleText: string;
} | null {
  const normalized = normalizeText(text);
  const headingMatch = APPENDIX_HEADING_REGEX.exec(normalized);
  if (!headingMatch) {
    return null;
  }

  const identifierRaw = headingMatch[1] ?? null;
  const trailing = headingMatch[2] ?? "";
  const inlineTitleText = headingMatch[3] ?? "";
  const parsedIdentifier = parseAppendixIdentifier(identifierRaw);

  return {
    identifierRaw,
    identifierNorm: parsedIdentifier?.norm ?? null,
    sequenceValue: parsedIdentifier?.sequenceValue ?? null,
    scheme: parsedIdentifier?.scheme ?? null,
    trailingDot: trailing === ".",
    inlineTitleText: inlineTitleText.trim(),
  };
}

function parseAppendixIdentifier(raw: string | null): {
  norm: string;
  sequenceValue: number;
  scheme: AppendixNumberScheme;
} | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim().toUpperCase();
  if (/^\d+$/u.test(trimmed)) {
    const numeric = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }
    return {
      norm: String(numeric),
      sequenceValue: numeric,
      scheme: "numeric",
    };
  }

  if (/^[А-ЯЁ]$/u.test(trimmed)) {
    const index = RUSSIAN_ALPHABET.indexOf(trimmed);
    if (index === -1) {
      return null;
    }
    return {
      norm: trimmed,
      sequenceValue: index + 1,
      scheme: "letter",
    };
  }

  return null;
}

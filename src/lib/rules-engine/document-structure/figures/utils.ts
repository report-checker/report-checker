import { FIGURE_REFERENCE_REGEX } from "./constants";
import type { FigureReference, ParsedFigureNumber } from "./types";
import {
  compareByDocumentOrder,
  flattenMapValues,
  parseStructuredNumber,
  pushMapEntry,
  sortByDocumentOrder,
} from "../shared-utils";

export function parseFigureNumber(raw: string): ParsedFigureNumber | null {
  const parsed = parseStructuredNumber(raw);
  if (!parsed) {
    return null;
  }

  return parsed;
}

export function collectFigureReferences(
  text: string,
): Array<{ label: string; numberRaw: string; aliasIssue: string | null }> {
  const references: Array<{
    label: string;
    numberRaw: string;
    aliasIssue: string | null;
  }> = [];

  FIGURE_REFERENCE_REGEX.lastIndex = 0;
  while (true) {
    const match = FIGURE_REFERENCE_REGEX.exec(text);
    if (match === null) {
      break;
    }
    const label = match[1].trim();
    const numberRaw = match[2].trim();
    if (numberRaw.length > 0) {
      references.push({
        label,
        numberRaw,
        aliasIssue: isImageAlias(label)
          ? "Для ссылки используйте «Рисунок» или «рис.», а не «Изображение»."
          : null,
      });
    }
  }

  return references;
}

export function collectCrossLineReferences(
  lineA: string,
  lineB: string,
): Array<{
  label: string;
  numberRaw: string;
  aliasIssue: string | null;
  spansToNextLine: boolean;
}> {
  const combined = lineA + " " + lineB;
  const boundary = lineA.length;
  const references: Array<{
    label: string;
    numberRaw: string;
    aliasIssue: string | null;
    spansToNextLine: boolean;
  }> = [];

  FIGURE_REFERENCE_REGEX.lastIndex = 0;
  while (true) {
    const match = FIGURE_REFERENCE_REGEX.exec(combined);
    if (match === null) break;
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    // Include all matches that start in lineA (covers both same-line and cross-line)
    if (matchStart < boundary) {
      const label = match[1].trim();
      const numberRaw = match[2].trim();
      if (numberRaw.length > 0) {
        references.push({
          label,
          numberRaw,
          aliasIssue: isImageAlias(label)
            ? "Для ссылки используйте «Рисунок» или «рис.», а не «Изображение»."
            : null,
          spansToNextLine: matchEnd > boundary,
        });
      }
    }
  }

  return references;
}

export function sortReferencesByDocumentOrder(
  values: FigureReference[],
): FigureReference[] {
  return sortByDocumentOrder(values);
}

export function isImageAlias(label: string): boolean {
  return /^изображени[а-яё]*$/iu.test(label.trim());
}

export function flattenReferenceMap(
  referencesByNumber: Map<string, FigureReference[]>,
): FigureReference[] {
  return flattenMapValues(referencesByNumber);
}

export function formatReferenceLabel(reference: FigureReference): string {
  return `${reference.label} ${reference.numberRaw}`.trim();
}

export { compareByDocumentOrder, pushMapEntry, sortByDocumentOrder };

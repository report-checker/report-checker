import type { CheckerConfig } from "../../../checker-config";
import { POINTS_PER_CM } from "../../text-set-core";
import type { EnginePage } from "../../types";
import { collectLinesWithText } from "../collect-lines";
import { detectAppendixStartPageFromTocEntries } from "../detect-structure-toc";
import { parseStructuredNumber, pushMapEntry } from "../shared-utils";
import type { TextLineWithText, TocEntry } from "../types";
import {
  hasTableReferenceInText,
  isTableCaptionOrContinuationLine,
  TABLE_CAPTION_REGEX,
  TABLE_CONTINUATION_REGEX,
  TABLE_REFERENCE_REGEX,
} from "./constants";
import type {
  ParsedTableNumber,
  TableCaption,
  TableDetection,
  TableReference,
} from "./types";

export function detectTables(
  pages: EnginePage[],
  config: CheckerConfig,
  tocEntries: TocEntry[],
): TableDetection {
  const appendixStartPage = detectAppendixStartPageFromTocEntries(tocEntries);
  const referencesByNumber = new Map<string, TableReference[]>();
  const captions: TableCaption[] = [];
  const lastCaptionByNumber = new Map<string, TableCaption>();
  const leftAlignmentTolerancePt = Math.max(
    config.documentStructure.tableCaptionLeftToleranceCm * POINTS_PER_CM,
    config.documentStructure.centerToleranceCm * POINTS_PER_CM * 0.75,
  );
  const rightAlignmentTolerancePt =
    config.documentStructure.tableContinuationRightToleranceCm * POINTS_PER_CM;
  const continuationTopBandPt =
    config.documentStructure.tableContinuationTopBandCm * POINTS_PER_CM;

  for (const page of pages) {
    const lines = collectLinesWithText(page);
    const referenceBox = resolveReferenceBox(page, lines);
    const mainTextLeft = estimateMainTextLeft(lines);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const rawText = line.text.trim();
      if (!rawText) {
        continue;
      }

      const continuationMatch = TABLE_CONTINUATION_REGEX.exec(rawText);
      const captionMatch =
        continuationMatch ?? TABLE_CAPTION_REGEX.exec(rawText);
      if (captionMatch) {
        const isContinuation = continuationMatch !== null;
        const captionLabel = captionMatch[1].trim();
        const numberRaw = captionMatch[2].trim();
        const title = (captionMatch[3] ?? "").trim();
        const number = parseTableNumber(numberRaw);
        const issues: string[] = [];
        const linkedTableContentBounds: TableCaption["linkedTableContentBounds"] =
          null;

        if (!number) {
          issues.push(
            "Номер таблицы должен быть арабским числом (или в формате N.M для нумерации в пределах раздела).",
          );
        }
        if (isNumberSignUsed(rawText)) {
          issues.push("Номер таблицы следует указывать без знака «№».");
        }

        if (isDashUsedWithoutTitle(rawText, title)) {
          issues.push("После тире в названии таблицы отсутствует текст.");
        }

        if (isContinuation) {
          if (referenceBox) {
            const rightDelta = Math.abs(line.bounds.right - referenceBox.right);
            if (rightDelta > rightAlignmentTolerancePt) {
              issues.push(
                "Строка «Продолжение таблицы N» должна быть выровнена по правому краю.",
              );
            }

            if (line.bounds.top < referenceBox.top - continuationTopBandPt) {
              issues.push(
                "Строка «Продолжение таблицы N» должна быть размещена вверху страницы.",
              );
            }
          }

          const previousCaption = lastCaptionByNumber.get(numberRaw);
          if (!previousCaption) {
            issues.push(
              "Строка «Продолжение таблицы N» должна ссылаться на ранее обнаруженную таблицу.",
            );
          } else if (line.pageNumber - previousCaption.pageNumber !== 1) {
            issues.push(
              "Продолжение таблицы должно располагаться на следующей странице после основной части.",
            );
          }
        } else {
          if (referenceBox) {
            const expectedLeft = mainTextLeft ?? referenceBox.left;
            const leftDelta = Math.abs(line.bounds.left - expectedLeft);
            if (leftDelta > leftAlignmentTolerancePt) {
              issues.push(
                "Название таблицы должно быть выровнено по левому краю без абзацного отступа.",
              );
            }
          }
        }

        const caption: TableCaption = {
          captionLabel,
          numberRaw,
          title,
          pageNumber: line.pageNumber,
          pageBox: line.pageBox,
          bounds: line.bounds,
          centerY: line.centerY,
          scheme: number?.scheme ?? null,
          continuousIndex: number?.continuousIndex ?? null,
          sectionIndex: number?.sectionIndex ?? null,
          sectionItemIndex: number?.sectionItemIndex ?? null,
          isAppendix:
            appendixStartPage !== null && line.pageNumber >= appendixStartPage,
          isContinuation,
          formatIssues: issues,
          linkedTableContentBounds,
        };
        captions.push(caption);
        lastCaptionByNumber.set(numberRaw, caption);
        continue;
      }

      const references = collectTableReferences(rawText);
      for (const reference of references) {
        pushMapEntry(referencesByNumber, reference.numberRaw, {
          ...reference,
          pageNumber: line.pageNumber,
          pageBox: line.pageBox,
          bounds: line.bounds,
          centerY: line.centerY,
        });
      }
    }
  }

  return {
    captions,
    referencesByNumber,
  };
}

function resolveReferenceBox(
  page: Pick<EnginePage, "pageBox" | "marginBounds">,
  lines: TextLineWithText[],
) {
  if (page.marginBounds) {
    return page.marginBounds;
  }
  if (!page.pageBox) {
    return null;
  }
  if (lines.length === 0) {
    return page.pageBox;
  }

  const left = Math.min(...lines.map((line) => line.bounds.left));
  const right = Math.max(...lines.map((line) => line.bounds.right));
  const bottom = Math.min(...lines.map((line) => line.bounds.bottom));
  const top = Math.max(...lines.map((line) => line.bounds.top));

  if (right - left < 40 || top - bottom < 40) {
    return page.pageBox;
  }

  return { left, right, bottom, top };
}

function estimateMainTextLeft(lines: TextLineWithText[]): number | null {
  const leftCandidates = lines
    .filter((line) => {
      const text = line.text.trim();
      if (text.length < 28) {
        return false;
      }
      if (!/[А-Яа-яA-Za-z]/u.test(text)) {
        return false;
      }
      if (isTableCaptionOrContinuationLine(text)) {
        return false;
      }

      const digitCount = (text.match(/\d/gu) ?? []).length;
      return digitCount <= 8;
    })
    .map((line) => line.bounds.left)
    .sort((left, right) => left - right);

  if (leftCandidates.length === 0) {
    return null;
  }

  const percentileIndex = Math.max(
    0,
    Math.min(
      leftCandidates.length - 1,
      Math.floor((leftCandidates.length - 1) * 0.2),
    ),
  );
  return leftCandidates[percentileIndex] ?? null;
}

function parseTableNumber(raw: string): ParsedTableNumber | null {
  const parsed = parseStructuredNumber(raw);
  if (!parsed) {
    return null;
  }

  return parsed;
}

function collectTableReferences(
  text: string,
): Array<
  Omit<TableReference, "pageNumber" | "pageBox" | "bounds" | "centerY">
> {
  const references: Array<
    Omit<TableReference, "pageNumber" | "pageBox" | "bounds" | "centerY">
  > = [];

  TABLE_REFERENCE_REGEX.lastIndex = 0;
  if (!hasTableReferenceInText(text)) {
    return references;
  }
  TABLE_REFERENCE_REGEX.lastIndex = 0;
  while (true) {
    const match = TABLE_REFERENCE_REGEX.exec(text);
    if (match === null) {
      break;
    }

    const label = match[1].trim();
    const numberRaw = match[2].trim();
    if (!numberRaw) {
      continue;
    }

    references.push({ label, numberRaw });
  }

  return references;
}

function isNumberSignUsed(text: string): boolean {
  return /(?:Таблица|Продолжение\s+таблицы)\s*№/iu.test(text);
}

function isDashUsedWithoutTitle(rawText: string, title: string): boolean {
  if (title.length > 0) {
    return false;
  }

  return /[—–-]\s*$/u.test(rawText);
}

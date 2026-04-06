import type { CheckerConfig } from "../../../checker-config";
import { POINTS_PER_CM } from "../../text-set-core";
import type { EnginePage, PdfRect } from "../../types";
import { collectLinesWithText } from "../collect-lines";
import { detectAppendixStartPageFromTocEntries } from "../detect-structure-toc";
import { isCenteredWithinTolerance } from "../shared-utils";
import type { TextLineWithText, TocEntry } from "../types";
import {
  FIGURE_CAPTION_REGEX,
  PERIOD_AT_END_REGEX,
} from "./constants";
import type {
  AppendixIllustration,
  FigureCaption,
  FigureDetection,
  FigureReference,
} from "./types";
import {
  collectCrossLineReferences,
  isImageAlias,
  parseFigureNumber,
  pushMapEntry,
} from "./utils";

export function detectFigures(
  pages: EnginePage[],
  config: CheckerConfig,
  tocEntries: TocEntry[],
): FigureDetection {
  const centerTolerancePt =
    config.documentStructure.centerToleranceCm * POINTS_PER_CM;
  const captionObjectMaxGapPt =
    config.documentStructure.figureCaptionObjectMaxGapCm * POINTS_PER_CM;
  const captionObjectMaxCenterDistancePt =
    config.documentStructure.figureCaptionObjectMaxCenterDistanceCm *
    POINTS_PER_CM;
  const appendixStartPage = detectAppendixStartPageFromTocEntries(tocEntries);
  const captions: FigureCaption[] = [];
  const referencesByNumber = new Map<string, FigureReference[]>();
  const mainIllustrations: AppendixIllustration[] = [];
  const appendixIllustrations: AppendixIllustration[] = [];

  for (const page of pages) {
    const isAppendixPage =
      appendixStartPage !== null && page.pageNumber >= appendixStartPage;
    const lines = collectLinesWithText(page);

    if (isAppendixPage) {
      const appendixObjects = collectIllustrationObjectsOnPage(page);
      for (const bounds of appendixObjects) {
        appendixIllustrations.push({
          pageNumber: page.pageNumber,
          pageBox: page.pageBox,
          bounds,
        });
      }
    } else {
      const mainObjects = collectIllustrationObjectsOnPage(page);
      for (const bounds of mainObjects) {
        mainIllustrations.push({
          pageNumber: page.pageNumber,
          pageBox: page.pageBox,
          bounds,
        });
      }
    }

    for (const line of lines) {
      const rawText = line.text.trim();
      if (!rawText) {
        continue;
      }

      const captionMatch = FIGURE_CAPTION_REGEX.exec(rawText);
      if (captionMatch) {
        const captionLabel = captionMatch[1];
        const numberRaw = captionMatch[2];
        const title = captionMatch[3].trim();
        const number = parseFigureNumber(numberRaw);
        const issues: string[] = [];

        if (isImageAlias(captionLabel)) {
          issues.push("Для подписи используйте «Рисунок», а не «Изображение».");
        }

        if (PERIOD_AT_END_REGEX.test(rawText)) {
          issues.push("Точка в конце подписи к рисунку не допускается.");
        }

        const referenceBox = page.marginBounds ?? page.pageBox;
        if (referenceBox) {
          if (
            !isCenteredWithinTolerance(
              line.bounds,
              referenceBox,
              centerTolerancePt,
            )
          ) {
            issues.push(
              "Подпись к рисунку должна быть выровнена по центру строки.",
            );
          }
        }

        if (!title) {
          issues.push("В подписи к рисунку отсутствует текст после номера.");
        }
        if (!number) {
          issues.push(
            "Номер рисунка должен быть арабским числом (или в формате N.M для нумерации в пределах раздела).",
          );
        }

        const figureObject = findFigureObjectAboveCaption(
          page,
          line,
          centerTolerancePt,
          captionObjectMaxGapPt,
          captionObjectMaxCenterDistancePt,
        );
        if (!figureObject) {
          issues.push(
            "Не найден графический объект над подписью рисунка на этой странице.",
          );
        }

        captions.push({
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
          formatIssues: issues,
          linkedObjectBounds: figureObject?.bounds ?? null,
        });
        continue;
      }

    }

    // Collect references, including those split across consecutive lines
    const captionFlags = lines.map((l) =>
      FIGURE_CAPTION_REGEX.test(l.text.trim()),
    );
    for (let i = 0; i < lines.length; i++) {
      if (captionFlags[i]) continue;
      const lineA = lines[i].text.trim();
      if (!lineA) continue;
      const nextLine =
        i + 1 < lines.length && !captionFlags[i + 1] ? lines[i + 1] : null;
      const lineB = nextLine?.text.trim() ?? "";
      for (const reference of collectCrossLineReferences(lineA, lineB)) {
        const bounds =
          reference.spansToNextLine && nextLine
            ? {
                left: Math.min(lines[i].bounds.left, nextLine.bounds.left),
                right: Math.max(lines[i].bounds.right, nextLine.bounds.right),
                top: Math.max(lines[i].bounds.top, nextLine.bounds.top),
                bottom: Math.min(
                  lines[i].bounds.bottom,
                  nextLine.bounds.bottom,
                ),
              }
            : lines[i].bounds;
        pushMapEntry(referencesByNumber, reference.numberRaw, {
          label: reference.label,
          aliasIssue: reference.aliasIssue,
          numberRaw: reference.numberRaw,
          pageNumber: lines[i].pageNumber,
          pageBox: lines[i].pageBox,
          bounds,
          centerY: lines[i].centerY,
          isAppendix: isAppendixPage,
        });
      }
    }
  }

  return {
    captions,
    referencesByNumber,
    appendixStartPage,
    mainIllustrations: mainIllustrations.sort(
      (left, right) =>
        left.pageNumber - right.pageNumber ||
        right.bounds.top - left.bounds.top ||
        left.bounds.left - right.bounds.left,
    ),
    appendixIllustrations: appendixIllustrations.sort(
      (left, right) =>
        left.pageNumber - right.pageNumber ||
        right.bounds.top - left.bounds.top ||
        left.bounds.left - right.bounds.left,
    ),
  };
}

function findFigureObjectAboveCaption(
  page: Pick<EnginePage, "pageObjects">,
  line: Pick<TextLineWithText, "bounds"> | Pick<FigureCaption, "bounds">,
  centerTolerancePt: number,
  captionObjectMaxGapPt: number,
  captionObjectMaxCenterDistancePt: number,
): { bounds: PdfRect } | null {
  const candidates = (page.pageObjects ?? []).filter((object) => {
    if (object.objectType === "text" || object.objectType === "unsupported") {
      return false;
    }

    const gap = object.bounds.bottom - line.bounds.top;
    if (gap < -1 || gap > captionObjectMaxGapPt) {
      return false;
    }

    const objectCenterX = (object.bounds.left + object.bounds.right) / 2;
    const captionCenterX = (line.bounds.left + line.bounds.right) / 2;
    const maxCenterDistance = Math.max(
      captionObjectMaxCenterDistancePt,
      centerTolerancePt * 2,
    );
    return Math.abs(objectCenterX - captionCenterX) <= maxCenterDistance;
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftGap = left.bounds.bottom - line.bounds.top;
    const rightGap = right.bounds.bottom - line.bounds.top;
    if (Math.abs(leftGap - rightGap) > 0.001) {
      return leftGap - rightGap;
    }

    const leftArea =
      (left.bounds.right - left.bounds.left) *
      (left.bounds.top - left.bounds.bottom);
    const rightArea =
      (right.bounds.right - right.bounds.left) *
      (right.bounds.top - right.bounds.bottom);
    return rightArea - leftArea;
  });

  return candidates[0];
}

function collectIllustrationObjectsOnPage(
  page: Pick<EnginePage, "pageBox" | "pageObjects">,
): PdfRect[] {
  const pageBox = page.pageBox;
  const pageArea =
    pageBox === null
      ? null
      : Math.max(
          1,
          (pageBox.right - pageBox.left) * (pageBox.top - pageBox.bottom),
        );
  const objects: PdfRect[] = [];

  for (const object of page.pageObjects ?? []) {
    if (object.objectType === "text" || object.objectType === "unsupported") {
      continue;
    }

    const width = object.bounds.right - object.bounds.left;
    const height = object.bounds.top - object.bounds.bottom;
    if (width <= 24 || height <= 24) {
      continue;
    }

    const area = width * height;
    if (area <= 0) {
      continue;
    }

    if (pageArea !== null) {
      const areaRatio = area / pageArea;
      // Ignore full-page background/vector fills and tiny decorative fragments.
      if (areaRatio >= 0.9 || areaRatio < 0.01) {
        continue;
      }
    }

    objects.push(object.bounds);
  }

  return objects;
}

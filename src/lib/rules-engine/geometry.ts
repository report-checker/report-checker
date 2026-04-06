import type { ParsedPdfResult, PdfRect } from "./types";

type MarginGeometryResolution = {
  boundsByPage: Array<PdfRect | null>;
  textBoxesByPage: Array<PdfRect[]>;
  engineLabel: string;
  note?: string;
};

export function resolveMarginGeometry(
  parsed: ParsedPdfResult,
): MarginGeometryResolution {
  const pageCount = parsed.pages.length;

  return {
    boundsByPage: normalizeBoundsByPage(parsed.marginBoundsByPage, pageCount),
    textBoxesByPage: normalizeTextBoxesByPage(
      parsed.pdfiumTextBoxesByPage ?? [],
      pageCount,
    ),
    engineLabel:
      parsed.parserEngineLabel && parsed.parserEngineLabel.trim().length > 0
        ? parsed.parserEngineLabel
        : "PDFium",
    note: parsed.parserNote ?? undefined,
  };
}

function normalizeBoundsByPage(
  boundsByPage: Array<PdfRect | null>,
  expectedLength: number,
): Array<PdfRect | null> {
  const normalized = boundsByPage.slice(0, expectedLength);

  while (normalized.length < expectedLength) {
    normalized.push(null);
  }

  return normalized;
}

function normalizeTextBoxesByPage(
  textBoxesByPage: Array<PdfRect[]>,
  expectedLength: number,
): Array<PdfRect[]> {
  const normalized = textBoxesByPage
    .slice(0, expectedLength)
    .map((pageBoxes) => pageBoxes.map(normalizeRect));

  while (normalized.length < expectedLength) {
    normalized.push([]);
  }

  return normalized;
}

function normalizeRect(rect: PdfRect): PdfRect {
  return {
    left: Math.min(rect.left, rect.right),
    right: Math.max(rect.left, rect.right),
    bottom: Math.min(rect.bottom, rect.top),
    top: Math.max(rect.bottom, rect.top),
  };
}

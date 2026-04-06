import type { CheckerConfig } from "../checker-config";
import type {
  EngineContext,
  EnginePage,
  ParsedPdfResult,
  PdfRect,
} from "./types";

export function buildEngineContext(
  parsed: ParsedPdfResult,
  config: CheckerConfig,
): EngineContext {
  const normalizedMarginBounds = normalizeBoundsByPage(
    parsed.marginBoundsByPage,
    parsed.pages.length,
  );

  const pages: EnginePage[] = parsed.pages.map((page, index) => ({
    pageNumber: page.pageNumber,
    pageBox: page.pageBox,
    textRuns: page.textRuns,
    marginBounds: normalizedMarginBounds[index],
    pageObjects: page.pageObjects ?? [],
  }));

  return {
    pageCount: parsed.pageCount,
    checkedPages: parsed.pages.length,
    pages,
    config,
    parserEngineLabel: parsed.parserEngineLabel,
    parserNote: parsed.parserNote,
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

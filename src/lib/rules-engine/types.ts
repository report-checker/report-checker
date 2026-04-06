import type { CheckerConfig } from "../checker-config";

export type RuleStatus = "pass" | "fail" | "warn";
export const marginGeometryEngineValues = ["pdfium"] as const;
export type MarginGeometryEngine = (typeof marginGeometryEngineValues)[number];
export const marginGeometryEngineLabels: Record<MarginGeometryEngine, string> =
  {
    pdfium: "pdfium",
  };

export type PdfRect = {
  left: number;
  bottom: number;
  right: number;
  top: number;
};

export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export type OverlayStyle = {
  borderColor: string;
  fillColor: string;
  borderWidth: number;
  dashed: boolean;
};

export type OverlayBox = {
  pageNumber: number;
  pageBox: PdfRect;
  rect: PdfRect;
  style: OverlayStyle;
};

export type RuleResult = {
  id: string;
  title: string;
  status: RuleStatus;
  message: string;
  children: RuleResult[];
  overlayBoxes: OverlayBox[];
  jumpPageNumbers: number[];
  childrenCollapsedByDefault: boolean;
  countInSummary: boolean;
};

export type CheckSummary = {
  pass: number;
  fail: number;
  warn: number;
  total: number;
};

export type FileCheckResult = {
  fileName: string;
  fileSizeBytes: number;
  checkedAt: string;
  marginGeometryEngine: MarginGeometryEngine;
  summary: CheckSummary;
  rules: RuleResult[];
};

export type ParsedTextRun = {
  text: string;
  bounds: PdfRect;
  fontSizePt?: number;
  textColorRgb?: RgbColor | null;
};

export type ParsedPageObjectType =
  | "unsupported"
  | "text"
  | "path"
  | "image"
  | "shading"
  | "xObjectForm";

export type ParsedPageObject = {
  objectType: ParsedPageObjectType;
  bounds: PdfRect;
};

export type ParsedPdfPage = {
  pageNumber: number;
  pageBox: PdfRect | null;
  textRuns: ParsedTextRun[];
  pageObjects?: ParsedPageObject[];
};

export type ParsedPdfResult = {
  pageCount: number;
  pages: ParsedPdfPage[];
  marginBoundsByPage: Array<PdfRect | null>;
  pdfiumTextBoxesByPage?: Array<PdfRect[]>;
  parserEngineLabel: string;
  parserNote?: string | null;
};

export type RulesEngineInput = {
  pdfBytes: Uint8Array;
  config: CheckerConfig;
  marginGeometryEngine: MarginGeometryEngine;
};

export type RulesEngineDeps = {
  parsePdf: (pdfBytes: Uint8Array) => Promise<ParsedPdfResult>;
};

export type RulesEngineOutput = {
  pageCount: number;
  checkedPages: number;
  rules: RuleResult[];
  note?: string | null;
};

export type EnginePage = {
  pageNumber: number;
  pageBox: PdfRect | null;
  textRuns: ParsedTextRun[];
  marginBounds: PdfRect | null;
  pageObjects?: ParsedPageObject[];
};

export type EngineContext = {
  pageCount: number;
  checkedPages: number;
  pages: EnginePage[];
  config: CheckerConfig;
  parserEngineLabel: string;
  parserNote?: string | null;
};

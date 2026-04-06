import type { PdfRect } from "../types";

export type TextLineWithText = {
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  text: string;
  centerY: number;
  fontSizePt: number | null;
  left: number;
  right: number;
};

export type TocEntry = {
  title: string;
  pageRef: number;
  bounds: PdfRect;
  pageNumber: number;
  pageBox: PdfRect | null;
};

export type FoundElement = {
  name: string;
  rawText: string;
  pageNumber: number;
  pageBox: PdfRect | null;
  marginBounds: PdfRect | null;
  bounds: PdfRect;
  issues: string[];
};

export type FoundHeading = {
  number: string;
  hasTrailingNumberDot: boolean;
  title: string;
  rawText: string;
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  fontSizePt: number | null;
  issues: string[];
};

export type DetectedStructure = {
  bodyFontPt: number | null;
  titlePageNumber: number | null;
  titlePageLines: TextLineWithText[];
  tocPageNumber: number | null;
  tocPageNumbers: number[];
  tocHeadingName: string | null;
  tocHeadingRawText: string | null;
  tocHeadingIssues: string[];
  tocHeadingBounds: PdfRect | null;
  tocHeadingMarginBounds: PdfRect | null;
  tocHeadingPageBox: PdfRect | null;
  tocEntries: TocEntry[];
  structuralElements: FoundElement[];
  sectionHeadings: FoundHeading[];
  sectionHeadingCandidates: FoundHeading[];
  allBodyLines: TextLineWithText[];
  requiredStructuralElements: { name: string; id: string }[];
};

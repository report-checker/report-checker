import type { EnginePage, PdfRect } from "../../types";
import type { DetectedStructure, TextLineWithText, TocEntry } from "../types";

export type AppendixNumberScheme = "numeric" | "letter";

export type AppendixHeading = {
  identifierRaw: string | null;
  identifierNorm: string | null;
  sequenceValue: number | null;
  scheme: AppendixNumberScheme | null;
  trailingDot: boolean;
  inlineTitleText: string;
  rawText: string;
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  centerY: number;
  lineIndex: number;
};

export type AppendixTocEntry = {
  tocEntry: TocEntry;
  identifierRaw: string | null;
  identifierNorm: string | null;
  sequenceValue: number | null;
  scheme: AppendixNumberScheme | null;
  trailingDot: boolean;
  inlineTitleText: string;
};

export type AppendixTocItem = {
  tocEntry: AppendixTocEntry;
  heading: AppendixHeading | null;
};

export type AppendixReference = {
  identifierNorm: string;
  rawText: string;
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  centerY: number;
};

export type AppendicesDetection = {
  tocItems: AppendixTocItem[];
  headings: AppendixHeading[];
  referencesByIdentifier: Map<string, AppendixReference[]>;
  structure: DetectedStructure;
  pagesByNumber: Map<number, EnginePage>;
  pagesByPrintedNumber: Map<number, EnginePage>;
  linesByPage: Map<number, TextLineWithText[]>;
};

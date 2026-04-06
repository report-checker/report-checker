import type { PdfRect } from "../../types";

export type TableNumberScheme = "continuous" | "sectioned";

export type TableCaption = {
  captionLabel: string;
  numberRaw: string;
  title: string;
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  centerY: number;
  scheme: TableNumberScheme | null;
  continuousIndex: number | null;
  sectionIndex: number | null;
  sectionItemIndex: number | null;
  isAppendix: boolean;
  isContinuation: boolean;
  formatIssues: string[];
  linkedTableContentBounds: PdfRect | null;
};

export type TableReference = {
  label: string;
  numberRaw: string;
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  centerY: number;
};

export type TableDetection = {
  captions: TableCaption[];
  referencesByNumber: Map<string, TableReference[]>;
};

export type ParsedTableNumber =
  | {
      scheme: TableNumberScheme;
      continuousIndex: number;
      sectionIndex: null;
      sectionItemIndex: null;
    }
  | {
      scheme: TableNumberScheme;
      continuousIndex: null;
      sectionIndex: number;
      sectionItemIndex: number;
    };


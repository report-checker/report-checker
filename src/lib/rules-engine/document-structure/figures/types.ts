import type { PdfRect } from "../../types";

export type FigureNumberScheme = "continuous" | "sectioned";

export type FigureCaption = {
  captionLabel: string;
  numberRaw: string;
  title: string;
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  centerY: number;
  scheme: FigureNumberScheme | null;
  continuousIndex: number | null;
  sectionIndex: number | null;
  sectionItemIndex: number | null;
  isAppendix: boolean;
  formatIssues: string[];
  linkedObjectBounds: PdfRect | null;
};

export type FigureReference = {
  label: string;
  aliasIssue: string | null;
  numberRaw: string;
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  centerY: number;
  isAppendix: boolean;
};

export type AppendixIllustration = {
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
};

export type FigureDetection = {
  captions: FigureCaption[];
  referencesByNumber: Map<string, FigureReference[]>;
  appendixStartPage: number | null;
  mainIllustrations: AppendixIllustration[];
  appendixIllustrations: AppendixIllustration[];
};

export type ParsedFigureNumber =
  | {
      scheme: FigureNumberScheme;
      continuousIndex: number;
      sectionIndex: null;
      sectionItemIndex: null;
    }
  | {
      scheme: FigureNumberScheme;
      continuousIndex: null;
      sectionIndex: number;
      sectionItemIndex: number;
    };

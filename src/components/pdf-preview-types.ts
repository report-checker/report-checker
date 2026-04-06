import type { PDFDocumentLoadingTask } from "pdfjs-dist/types/src/display/api";

import type { OverlayBox, RuleStatus } from "@/lib/report-checker";

export type PageCanvasMetrics = {
  widthPx: number;
  heightPx: number;
};

export type PreviewHighlight = {
  status: RuleStatus;
  jumpPageNumbers: number[];
  overlayBoxes: OverlayBox[];
};

export type PdfPreviewProps = {
  file: File | null;
  highlight: PreviewHighlight | null;
};

export type PdfJsModule = {
  getDocument: (source: Record<string, unknown>) => PDFDocumentLoadingTask;
  GlobalWorkerOptions: {
    workerSrc: string;
  };
};

import type {
  PageCanvasMetrics,
  PdfJsModule,
} from "@/components/pdf-preview-types";
import type { PdfRect } from "@/lib/report-checker";

let isWorkerSrcConfigured = false;

export function normalizeRect(rect: PdfRect): PdfRect {
  return {
    left: Math.min(rect.left, rect.right),
    right: Math.max(rect.left, rect.right),
    bottom: Math.min(rect.bottom, rect.top),
    top: Math.max(rect.bottom, rect.top),
  };
}

export function rectToPixels(
  rect: PdfRect,
  pageBox: PdfRect,
  metrics: PageCanvasMetrics,
): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const pageWidthPt = Math.max(1, pageBox.right - pageBox.left);
  const pageHeightPt = Math.max(1, pageBox.top - pageBox.bottom);
  const xScale = metrics.widthPx / pageWidthPt;
  const yScale = metrics.heightPx / pageHeightPt;

  const left = (rect.left - pageBox.left) * xScale;
  const top = (pageBox.top - rect.top) * yScale;
  const width = Math.max(1, (rect.right - rect.left) * xScale);
  const height = Math.max(1, (rect.top - rect.bottom) * yScale);

  return { left, top, width, height };
}

export function findClosestPage(
  currentPage: number,
  candidates: number[],
): number {
  return candidates.reduce((closestPage, pageNumber) => {
    const closestDistance = Math.abs(closestPage - currentPage);
    const nextDistance = Math.abs(pageNumber - currentPage);

    if (nextDistance < closestDistance) {
      return pageNumber;
    }
    if (nextDistance === closestDistance && pageNumber < closestPage) {
      return pageNumber;
    }
    return closestPage;
  });
}

export function findCurrentPageNumber(
  container: HTMLDivElement,
  pageNodes: Map<number, HTMLDivElement>,
): number | null {
  const containerRect = container.getBoundingClientRect();
  const containerCenterY = containerRect.top + containerRect.height / 2;

  let currentPage: number | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const [pageNumber, pageNode] of pageNodes) {
    const pageRect = pageNode.getBoundingClientRect();
    const pageCenterY = pageRect.top + pageRect.height / 2;
    const distance = Math.abs(containerCenterY - pageCenterY);

    if (distance < minDistance) {
      minDistance = distance;
      currentPage = pageNumber;
    }
  }

  return currentPage;
}

export function resolveJumpTargetPage(
  currentPage: number | null,
  jumpPages: number[],
): number | null {
  if (jumpPages.length === 0) {
    return null;
  }

  if (currentPage !== null && jumpPages.includes(currentPage)) {
    return currentPage;
  }
  if (currentPage !== null) {
    return findClosestPage(currentPage, jumpPages);
  }
  return jumpPages[0];
}

export function configureWorkerSrc(pdfjs: PdfJsModule) {
  if (isWorkerSrcConfigured) {
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  isWorkerSrcConfigured = true;
}

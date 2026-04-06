"use client";

import { FileText, Loader2 } from "lucide-react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from "pdfjs-dist/types/src/display/api";
import { useEffect, useMemo, useRef, useState } from "react";

import { PdfPreviewPageItem } from "@/components/pdf-preview-page-item";
import type {
  PageCanvasMetrics,
  PdfJsModule,
  PdfPreviewProps,
} from "@/components/pdf-preview-types";
import {
  configureWorkerSrc,
  findCurrentPageNumber,
  normalizeRect,
  resolveJumpTargetPage,
} from "@/components/pdf-preview-utils";
import { PdfPreviewZoomControls } from "@/components/pdf-preview-zoom-controls";
import type { OverlayBox } from "@/lib/report-checker";

export type { PreviewHighlight } from "@/components/pdf-preview-types";

type ScaleMode = "custom" | "fit-width" | "fit-page";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;
const VIEWPORT_WIDTH_PADDING = 40;
const VIEWPORT_HEIGHT_PADDING = 32;
const MIN_TARGET_WIDTH = 300;
const MIN_TARGET_HEIGHT = 220;

function resolveFitPageRatio(
  containerWidth: number,
  containerHeight: number,
  firstPageAspectRatio: number | null,
): number {
  if (!firstPageAspectRatio || containerWidth <= 0 || containerHeight <= 0) {
    return 1;
  }

  const targetWidth = Math.max(
    MIN_TARGET_WIDTH,
    containerWidth - VIEWPORT_WIDTH_PADDING,
  );
  const targetHeight = Math.max(
    MIN_TARGET_HEIGHT,
    containerHeight - VIEWPORT_HEIGHT_PADDING,
  );
  const fitWidthHeight = targetWidth * firstPageAspectRatio;
  const ratio = targetHeight / Math.max(1, fitWidthHeight);

  return Math.min(1, Math.max(0.1, ratio));
}

export function PdfPreview({ file, highlight }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const documentRef = useRef<PDFDocumentProxy | null>(null);

  const [pageCount, setPageCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [currentPageNumber, setCurrentPageNumber] = useState<number | null>(
    null,
  );
  const [pageMetrics, setPageMetrics] = useState<
    Record<number, PageCanvasMetrics>
  >({});
  const [firstPageAspectRatio, setFirstPageAspectRatio] = useState<
    number | null
  >(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [scaleMode, setScaleMode] = useState<ScaleMode>("fit-page");

  const fitPageRatio = useMemo(
    () =>
      resolveFitPageRatio(
        containerWidth,
        containerHeight,
        firstPageAspectRatio,
      ),
    [containerWidth, containerHeight, firstPageAspectRatio],
  );

  useEffect(() => {
    const onResize = () => {
      const nextWidth = containerRef.current?.clientWidth ?? 0;
      const nextHeight = containerRef.current?.clientHeight ?? 0;
      setContainerWidth(nextWidth);
      setContainerHeight(nextHeight);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    return () => {
      const current = documentRef.current;
      if (current && typeof current.destroy === "function") {
        void current.destroy();
      }
      documentRef.current = null;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    const loadDocument = async () => {
      setPageCount(0);
      setPageMetrics({});
      setCurrentPageNumber(null);
      setError(null);
      setFirstPageAspectRatio(null);
      setZoomScale(1);
      setScaleMode("fit-page");

      const current = documentRef.current;
      if (current && typeof current.destroy === "function") {
        await current.destroy();
      }
      documentRef.current = null;

      if (!file) {
        return;
      }

      try {
        setIsLoading(true);
        const pdfjs = (await import("pdfjs-dist")) as PdfJsModule;
        configureWorkerSrc(pdfjs);

        const bytes = new Uint8Array(await file.arrayBuffer());
        loadingTask = pdfjs.getDocument({ data: bytes });
        const pdfDocument = await loadingTask.promise;

        if (isCancelled) {
          if (typeof pdfDocument.destroy === "function") {
            await pdfDocument.destroy();
          }
          return;
        }

        documentRef.current = pdfDocument;
        if (pdfDocument.numPages > 0) {
          const firstPage = await pdfDocument.getPage(1);
          const firstViewport = firstPage.getViewport({ scale: 1 });
          setFirstPageAspectRatio(
            firstViewport.height / Math.max(1, firstViewport.width),
          );
        }
        setPageCount(pdfDocument.numPages);
        setContainerWidth(containerRef.current?.clientWidth ?? 0);
        setContainerHeight(containerRef.current?.clientHeight ?? 0);
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Не удалось открыть PDF.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    void loadDocument();

    return () => {
      isCancelled = true;
      if (loadingTask && typeof loadingTask.destroy === "function") {
        loadingTask.destroy();
      }
    };
  }, [file]);

  useEffect(() => {
    const pdfDocument = documentRef.current;
    const container = containerRef.current;
    if (
      !pdfDocument ||
      !container ||
      pageCount === 0 ||
      containerWidth <= 0 ||
      containerHeight <= 0
    ) {
      return;
    }

    let isCancelled = false;

    const renderPages = async () => {
      if (canvasRefs.current.size < pageCount) {
        // Wait one frame so refs populate after page list mount.
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            resolve();
          });
        });
      }

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (isCancelled) {
          return;
        }

        const canvas = canvasRefs.current.get(pageNumber);
        if (!canvas) {
          continue;
        }

        const page = await pdfDocument.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = Math.max(
          MIN_TARGET_WIDTH,
          containerWidth - VIEWPORT_WIDTH_PADDING,
        );
        const widthScale = targetWidth / baseViewport.width;
        const scale =
          scaleMode === "fit-page"
            ? widthScale * fitPageRatio
            : scaleMode === "fit-width"
              ? widthScale
              : widthScale * zoomScale;
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        const context = canvas.getContext("2d");
        if (!context) {
          continue;
        }

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        await page.render({ canvasContext: context, viewport, canvas }).promise;
        const nextMetrics: PageCanvasMetrics = {
          widthPx: viewport.width,
          heightPx: viewport.height,
        };
        setPageMetrics((previousMetrics) => {
          const previousPageMetrics = previousMetrics[pageNumber];
          if (
            previousPageMetrics &&
            previousPageMetrics.widthPx === nextMetrics.widthPx &&
            previousPageMetrics.heightPx === nextMetrics.heightPx
          ) {
            return previousMetrics;
          }
          return {
            ...previousMetrics,
            [pageNumber]: nextMetrics,
          };
        });
      }
    };

    void renderPages();

    return () => {
      isCancelled = true;
    };
  }, [
    pageCount,
    containerWidth,
    containerHeight,
    fitPageRatio,
    scaleMode,
    zoomScale,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || pageCount === 0) {
      setCurrentPageNumber(null);
      return;
    }

    let frameId = 0;
    const updateCurrentPage = () => {
      const nextPage = findCurrentPageNumber(container, pageRefs.current);
      setCurrentPageNumber((previousPage) =>
        previousPage === nextPage ? previousPage : nextPage,
      );
    };
    const onScroll = () => {
      if (frameId !== 0) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateCurrentPage();
      });
    };

    updateCurrentPage();
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pageCount]);

  const jumpPageNumbers = useMemo(() => {
    if (!highlight) {
      return [];
    }

    const highlightPages = Array.from(new Set(highlight.jumpPageNumbers)).sort(
      (a, b) => a - b,
    );
    if (highlightPages.length > 0) {
      return highlightPages;
    }
    return Array.from(
      new Set(highlight.overlayBoxes.map((box) => box.pageNumber)),
    ).sort((a, b) => a - b);
  }, [highlight]);

  const domCurrentPageNumber = (() => {
    if (pageCount === 0) {
      return null;
    }
    const container = containerRef.current;
    if (!container) {
      return null;
    }
    return findCurrentPageNumber(container, pageRefs.current);
  })();
  const effectiveCurrentPageNumber = domCurrentPageNumber ?? currentPageNumber;

  const targetJumpPage = useMemo(
    () => resolveJumpTargetPage(effectiveCurrentPageNumber, jumpPageNumbers),
    [effectiveCurrentPageNumber, jumpPageNumbers],
  );
  const targetJumpMetrics =
    targetJumpPage !== null ? pageMetrics[targetJumpPage] : undefined;

  useEffect(() => {
    if (targetJumpPage === null) {
      return;
    }

    if (
      effectiveCurrentPageNumber !== null &&
      targetJumpPage === effectiveCurrentPageNumber
    ) {
      return;
    }

    let isCancelled = false;
    let frameId = 0;

    const tryJump = () => {
      if (isCancelled) {
        return;
      }
      const pageNode = pageRefs.current.get(targetJumpPage);
      if (!pageNode) {
        frameId = window.requestAnimationFrame(() => {
          tryJump();
        });
        return;
      }
      pageNode.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    tryJump();
    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [targetJumpPage, effectiveCurrentPageNumber]);

  useEffect(() => {
    const pdfDocument = documentRef.current;
    if (
      !pdfDocument ||
      targetJumpPage === null ||
      pageCount === 0 ||
      containerWidth <= 0 ||
      containerHeight <= 0 ||
      !!targetJumpMetrics
    ) {
      return;
    }

    let isCancelled = false;
    let retryFrameId = 0;

    const renderTargetPage = async () => {
      const canvas = canvasRefs.current.get(targetJumpPage);
      if (!canvas) {
        retryFrameId = window.requestAnimationFrame(() => {
          if (!isCancelled) {
            void renderTargetPage();
          }
        });
        return;
      }

      const page = await pdfDocument.getPage(targetJumpPage);
      if (isCancelled) {
        return;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const targetWidth = Math.max(
        MIN_TARGET_WIDTH,
        containerWidth - VIEWPORT_WIDTH_PADDING,
      );
      const widthScale = targetWidth / baseViewport.width;
      const scale =
        scaleMode === "fit-page"
          ? widthScale * fitPageRatio
          : scaleMode === "fit-width"
            ? widthScale
            : widthScale * zoomScale;
      const viewport = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      await page.render({ canvasContext: context, viewport, canvas }).promise;
      if (isCancelled) {
        return;
      }

      setPageMetrics((previousMetrics) => {
        const previousPageMetrics = previousMetrics[targetJumpPage];
        if (
          previousPageMetrics &&
          previousPageMetrics.widthPx === viewport.width &&
          previousPageMetrics.heightPx === viewport.height
        ) {
          return previousMetrics;
        }
        return {
          ...previousMetrics,
          [targetJumpPage]: {
            widthPx: viewport.width,
            heightPx: viewport.height,
          },
        };
      });
    };

    void renderTargetPage();

    return () => {
      isCancelled = true;
      if (retryFrameId !== 0) {
        window.cancelAnimationFrame(retryFrameId);
      }
    };
  }, [
    targetJumpPage,
    targetJumpMetrics,
    pageCount,
    containerWidth,
    containerHeight,
    fitPageRatio,
    scaleMode,
    zoomScale,
  ]);

  const renderedOverlays = useMemo<OverlayBox[]>(() => {
    if (!highlight) {
      return [];
    }

    return highlight.overlayBoxes.map((box) => ({
      ...box,
      pageBox: normalizeRect(box.pageBox),
      rect: normalizeRect(box.rect),
    }));
  }, [highlight]);

  const overlaysByPage = useMemo(() => {
    const map = new Map<number, OverlayBox[]>();

    for (const overlay of renderedOverlays) {
      const current = map.get(overlay.pageNumber) ?? [];
      current.push(overlay);
      map.set(overlay.pageNumber, current);
    }

    return map;
  }, [renderedOverlays]);

  const hasDocument = !isLoading && !error && pageCount > 0;
  const nextFitMode = scaleMode === "fit-page" ? "fit-width" : "fit-page";
  const effectiveZoomScale =
    scaleMode === "fit-page"
      ? fitPageRatio
      : scaleMode === "fit-width"
        ? 1
        : zoomScale;
  const zoomPercent = Math.round(effectiveZoomScale * 100);
  const canZoomOut = effectiveZoomScale > MIN_ZOOM + 0.001;
  const canZoomIn = effectiveZoomScale < MAX_ZOOM - 0.001;

  const zoomOut = () => {
    setZoomScale((current) => {
      const base =
        scaleMode === "fit-page"
          ? fitPageRatio
          : scaleMode === "fit-width"
            ? 1
            : current;
      return Math.max(MIN_ZOOM, Number((base - ZOOM_STEP).toFixed(2)));
    });
    setScaleMode("custom");
  };

  const zoomIn = () => {
    setZoomScale((current) => {
      const base =
        scaleMode === "fit-page"
          ? fitPageRatio
          : scaleMode === "fit-width"
            ? 1
            : current;
      return Math.min(MAX_ZOOM, Number((base + ZOOM_STEP).toFixed(2)));
    });
    setScaleMode("custom");
  };

  const resetZoom = () => {
    setScaleMode("custom");
    setZoomScale(1);
  };

  const toggleFitMode = () => {
    setScaleMode((current) =>
      current === "fit-page" ? "fit-width" : "fit-page",
    );
  };

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-muted/30">
        <div className="text-muted-foreground flex flex-col items-center gap-2 text-sm">
          <FileText className="size-6" />
          Выберите PDF для предпросмотра
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-lg border bg-muted/15">
      <PdfPreviewZoomControls
        zoomPercent={zoomPercent}
        pageCount={pageCount}
        currentPageNumber={effectiveCurrentPageNumber}
        disabled={!hasDocument}
        scaleMode={scaleMode}
        nextFitMode={nextFitMode}
        canZoomOut={canZoomOut}
        canZoomIn={canZoomIn}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onToggleFitMode={toggleFitMode}
        onResetZoom={resetZoom}
      />

      <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Загружаем PDF...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!isLoading && !error && pageCount > 0 ? (
          <div className="space-y-5">
            {Array.from({ length: pageCount }, (_, index) => {
              const pageNumber = index + 1;
              const metrics = pageMetrics[pageNumber];
              const pageOverlays = overlaysByPage.get(pageNumber) ?? [];

              return (
                <PdfPreviewPageItem
                  key={pageNumber}
                  pageNumber={pageNumber}
                  metrics={metrics}
                  overlays={pageOverlays}
                  onPageRef={(nextPageNumber, node) => {
                    if (node) {
                      pageRefs.current.set(nextPageNumber, node);
                    } else {
                      pageRefs.current.delete(nextPageNumber);
                    }
                  }}
                  onCanvasRef={(nextPageNumber, node) => {
                    if (node) {
                      canvasRefs.current.set(nextPageNumber, node);
                    } else {
                      canvasRefs.current.delete(nextPageNumber);
                    }
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

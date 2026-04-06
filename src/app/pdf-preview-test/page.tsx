"use client";

import Link from "next/link";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from "pdfjs-dist/types/src/display/api";
import { useEffect, useRef, useState } from "react";

type PdfJsModule = {
  getDocument: (source: Record<string, unknown>) => PDFDocumentLoadingTask;
  GlobalWorkerOptions: {
    workerSrc: string;
  };
};

let workerConfigured = false;

function configureWorker(pdfjs: PdfJsModule) {
  if (workerConfigured) {
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  workerConfigured = true;
}

export default function PdfPreviewTestPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);

  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      const current = documentRef.current;
      if (current && typeof current.destroy === "function") {
        void current.destroy();
      }
      documentRef.current = null;
    };
  }, []);

  const loadPdf = async (file: File) => {
    setError(null);
    setIsLoading(true);
    setIsRendering(false);
    setPageCount(0);
    setPageNumber(1);

    const current = documentRef.current;
    if (current && typeof current.destroy === "function") {
      await current.destroy();
      documentRef.current = null;
    }

    try {
      const pdfjs = (await import("pdfjs-dist")) as PdfJsModule;
      configureWorker(pdfjs);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const loadingTask = pdfjs.getDocument({ data: bytes });
      const pdfDocument = await loadingTask.promise;

      documentRef.current = pdfDocument;
      setPageCount(pdfDocument.numPages);
      setPageNumber(1);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось открыть PDF.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const renderPage = async () => {
      const pdfDocument = documentRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!pdfDocument || !canvas || !container || pageNumber < 1) {
        return;
      }

      try {
        setIsRendering(true);
        setError(null);

        const page = await pdfDocument.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = Math.max(300, container.clientWidth - 24);
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;

        const context = canvas.getContext("2d");
        if (!context || cancelled) {
          return;
        }

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        await page.render({ canvasContext: context, viewport, canvas }).promise;
      } catch (renderError) {
        if (!cancelled) {
          setError(
            renderError instanceof Error
              ? renderError.message
              : "Не удалось отрисовать страницу PDF.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
    };
  }, [pageNumber]);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            PDF Preview Test (pdfjs-dist)
          </h1>
          <Link className="text-sm underline" href="/">
            Back
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4">
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void loadPdf(file);
              }
            }}
          />

          <button
            className="rounded border px-3 py-1 disabled:opacity-40"
            type="button"
            disabled={
              pageNumber <= 1 || pageCount === 0 || isLoading || isRendering
            }
            onClick={() => {
              setPageNumber((current) => Math.max(1, current - 1));
            }}
          >
            Prev
          </button>
          <button
            className="rounded border px-3 py-1 disabled:opacity-40"
            type="button"
            disabled={
              pageNumber >= pageCount ||
              pageCount === 0 ||
              isLoading ||
              isRendering
            }
            onClick={() => {
              setPageNumber((current) => Math.min(pageCount, current + 1));
            }}
          >
            Next
          </button>

          <span className="text-sm">
            Page: {pageCount > 0 ? `${pageNumber} / ${pageCount}` : "-"}
          </span>
          {(isLoading || isRendering) && (
            <span className="text-sm text-slate-600">Loading...</span>
          )}
        </div>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div
          ref={containerRef}
          className="min-h-[65vh] rounded-lg border bg-white p-3"
        >
          <canvas ref={canvasRef} className="mx-auto block" />
        </div>
      </div>
    </main>
  );
}

/**
 * Debug utility: render synthetic EnginePage data to a PDF file.
 *
 * Enable by setting the env var:  VITEST_DEBUG_PDF=1
 * Output goes to:  <repo-root>/debug-pdfs/<name>.pdf
 *
 * Usage in tests:
 *   import { saveDebugPdf } from "./debug-pdf";
 *   await saveDebugPdf("my-test-name", pages);
 */

import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import type { EnginePage } from "../types";

const DEBUG_DIR = path.resolve(__dirname, "../../../../debug-pdfs");

/** Returns true when VITEST_DEBUG_PDF=1 is set. */
export function isDebugPdfEnabled(): boolean {
  return process.env.VITEST_DEBUG_PDF === "1";
}

/**
 * Render the given pages to a PDF and save it under debug-pdfs/<name>.pdf.
 * Does nothing unless VITEST_DEBUG_PDF=1 is set.
 */
export async function saveDebugPdf(
  name: string,
  pages: EnginePage[],
): Promise<void> {
  if (!isDebugPdfEnabled()) return;

  const bytes = await renderEnginePagesToPdf(pages);
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const outPath = path.join(DEBUG_DIR, `${name}.pdf`);
  fs.writeFileSync(outPath, bytes);
  console.log(`[debug-pdf] saved → ${outPath}`);
}

// Font candidates with Cyrillic support, in preference order
const FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/Library/Fonts/Arial Unicode.ttf",
  "/System/Library/Fonts/Monaco.ttf", // ASCII-only fallback
];

/** Render EnginePage[] to PDF bytes using pdf-lib. */
async function renderEnginePagesToPdf(pages: EnginePage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit((await import("@pdf-lib/fontkit")).default);

  const fontPath = FONT_CANDIDATES.find((p) => fs.existsSync(p)) ?? FONT_CANDIDATES[FONT_CANDIDATES.length - 1];
  const fontBytes = fs.readFileSync(fontPath);
  const font = await doc.embedFont(fontBytes);

  for (const enginePage of pages) {
    const pageW = enginePage.pageBox?.right ?? 595.28;
    const pageH = enginePage.pageBox?.top ?? 841.89;

    const pdfPage = doc.addPage([pageW, pageH]);

    // Draw page objects (images, shapes) as light-blue rectangles
    for (const obj of enginePage.pageObjects ?? []) {
      const { left, bottom, right, top } = obj.bounds;
      const w = right - left;
      const h = top - bottom;
      if (w <= 0 || h <= 0) continue;

      pdfPage.drawRectangle({
        x: left,
        y: bottom,
        width: w,
        height: h,
        color: rgb(0.68, 0.85, 0.9),
        borderColor: rgb(0.2, 0.5, 0.7),
        borderWidth: 1,
        opacity: 0.5,
      });

      // Label the object type
      const label = obj.objectType;
      const labelFontSize = 8;
      pdfPage.drawText(label, {
        x: left + 2,
        y: bottom + 2,
        size: labelFontSize,
        font,
        color: rgb(0.1, 0.3, 0.6),
      });
    }

    // Draw text runs
    for (const run of enginePage.textRuns) {
      const { left, bottom, right, top } = run.bounds;
      const fontSize = run.fontSizePt ?? 12;
      const w = right - left;
      const h = top - bottom;

      // Highlight text bounding box
      pdfPage.drawRectangle({
        x: left,
        y: bottom,
        width: w > 0 ? w : 1,
        height: h > 0 ? h : fontSize,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 0.3,
        opacity: 0.4,
      });

      // Clamp font size to a reasonable rendering size
      const renderSize = Math.max(4, Math.min(fontSize, 24));

      pdfPage.drawText(run.text, {
        x: left,
        y: bottom,
        size: renderSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: w > 0 ? w + 20 : undefined,
      });
    }

    // Page number label in corner
    pdfPage.drawText(`Page ${enginePage.pageNumber}`, {
      x: 4,
      y: 4,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  return doc.save();
}

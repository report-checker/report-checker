/**
 * Diagnostic script: parses a PDF using pdfjs-dist and dumps grouped text lines
 * with their positions and approximate font sizes.
 *
 * Also prints a compact title-page structure summary (optional) to help tune
 * title-page extraction rules.
 *
 * Usage:
 *   npm run dump:pdf:text -- example-reports/1.pdf
 *   npm run dump:pdf:text -- example-reports/2.pdf --pages 1 --lines 80
 *   npm run dump:pdf:text -- example-reports/2.pdf --no-structure
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  PDFDocumentProxy,
  TextItem,
} from "pdfjs-dist/types/src/display/api";

import { defaultCheckerConfig } from "../src/lib/checker-config";
import { detectStructure } from "../src/lib/rules-engine/document-structure";
import type {
  EnginePage,
  ParsedTextRun,
  PdfRect,
} from "../src/lib/rules-engine/types";

type CliOptions = {
  filePath: string;
  maxPages: number;
  maxLinesPerPage: number;
};

type DumpLine = {
  y: number;
  text: string;
  leftmostX: number;
  avgFontSize: number;
};

type ParsedPage = {
  dumpLines: DumpLine[];
  enginePage: EnginePage;
};

function parseCliArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);

  let filePath = "example-reports/1.pdf";
  let maxPages = 10;
  let maxLinesPerPage = 30;

  let positionalUsed = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--pages" && args[index + 1]) {
      const parsed = Number.parseInt(args[index + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        maxPages = parsed;
      }
      index += 1;
      continue;
    }

    if (arg === "--lines" && args[index + 1]) {
      const parsed = Number.parseInt(args[index + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        maxLinesPerPage = parsed;
      }
      index += 1;
      continue;
    }

    if (!arg.startsWith("-") && !positionalUsed) {
      filePath = arg;
      positionalUsed = true;
    }
  }

  return {
    filePath: resolve(filePath),
    maxPages,
    maxLinesPerPage,
  };
}

function groupItemsToLines(items: TextItem[]): DumpLine[] {
  const sortedItems = items
    .filter((item) => item.str.trim().length > 0)
    .slice()
    .sort((left, right) => {
      const leftY = left.transform[5];
      const rightY = right.transform[5];
      if (Math.abs(leftY - rightY) > 2) {
        return rightY - leftY;
      }
      return left.transform[4] - right.transform[4];
    });

  type LineGroup = {
    centerY: number;
    items: TextItem[];
  };

  const lineGroups: LineGroup[] = [];
  for (const item of sortedItems) {
    const y = item.transform[5];
    const existing = lineGroups.find((line) => Math.abs(line.centerY - y) < 4);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    lineGroups.push({
      centerY: y,
      items: [item],
    });
  }

  const lines = lineGroups.map((line) => {
    const parts = line.items
      .slice()
      .sort((left, right) => left.transform[4] - right.transform[4]);
    const text = parts
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const fontSizes = parts.map((item) => {
      const a = item.transform[0];
      const b = item.transform[1];
      return Math.hypot(a, b);
    });
    const avgFontSize =
      fontSizes.reduce((sum, value) => sum + value, 0) / fontSizes.length;
    const leftmostX = Math.min(...parts.map((item) => item.transform[4]));

    return {
      y: line.centerY,
      text,
      leftmostX,
      avgFontSize,
    };
  });

  return lines.filter((line) => line.text.length > 0);
}

function toEnginePage(
  pageNumber: number,
  pageBox: PdfRect,
  items: TextItem[],
): EnginePage {
  const textRuns: ParsedTextRun[] = items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => {
      const x = item.transform[4];
      const y = item.transform[5];
      const fontSize = Math.max(
        Math.hypot(item.transform[0], item.transform[1]),
        1,
      );
      const width = Math.max(item.width || 0, 1);
      return {
        text: item.str,
        bounds: {
          left: x,
          bottom: y,
          right: x + width,
          top: y + fontSize,
        },
        fontSizePt: fontSize,
      };
    });

  return {
    pageNumber,
    pageBox,
    textRuns,
    marginBounds: null,
  };
}

function printLines(
  pageNumber: number,
  pageBox: PdfRect,
  lines: DumpLine[],
  maxLines: number,
): void {
  console.log(
    `\n=== Page ${pageNumber} (${pageBox.right.toFixed(1)} x ${pageBox.top.toFixed(1)}) ===`,
  );

  for (const line of lines.slice(0, maxLines)) {
    console.log(
      `  y=${line.y.toFixed(1).padStart(6)} | font=${line.avgFontSize
        .toFixed(1)
        .padStart(
          5,
        )} | x=${line.leftmostX.toFixed(1).padStart(6)} | "${line.text.slice(0, 120)}"`,
    );
  }

  if (lines.length > maxLines) {
    console.log(`  ... (${lines.length - maxLines} more lines)`);
  }
}

async function parsePage(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<ParsedPage> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const pageBox: PdfRect = {
    left: 0,
    bottom: 0,
    right: viewport.width,
    top: viewport.height,
  };
  const textContent = await page.getTextContent();
  const items = textContent.items.filter(
    (item): item is TextItem => "str" in item && item.str.trim().length > 0,
  );

  return {
    dumpLines: groupItemsToLines(items),
    enginePage: toEnginePage(pageNumber, pageBox, items),
  };
}

async function main() {
  const options = parseCliArgs(process.argv);
  const pdfBytes = new Uint8Array(readFileSync(options.filePath));

  // Important: do not set GlobalWorkerOptions.workerSrc in Node diagnostics.
  // pdfjs-dist works reliably here with disableWorker: true.
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const doc = await loadingTask.promise;
  const pagesToDump = Math.min(doc.numPages, options.maxPages);
  const enginePages: EnginePage[] = [];

  console.log(`PDF: ${options.filePath}`);
  console.log(`Pages: ${doc.numPages}`);

  for (let pageNumber = 1; pageNumber <= pagesToDump; pageNumber += 1) {
    const parsed = await parsePage(doc, pageNumber);
    enginePages.push(parsed.enginePage);
    printLines(
      pageNumber,
      parsed.enginePage.pageBox as PdfRect,
      parsed.dumpLines,
      options.maxLinesPerPage,
    );
  }
  await loadingTask.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { clamp, median, normalizeRect } from "../text-set-core";
import type { EnginePage } from "../types";
import type { TextLineWithText } from "./types";

export function collectLinesWithText(page: EnginePage): TextLineWithText[] {
  type RunEntry = {
    bounds: ReturnType<typeof normalizeRect>;
    fontSizePt: number | null;
    text: string;
  };

  const runs: RunEntry[] = page.textRuns
    .filter((run) => run.text.trim().length > 0)
    .map((run) => ({
      bounds: normalizeRect(run.bounds),
      fontSizePt:
        typeof run.fontSizePt === "number" && Number.isFinite(run.fontSizePt)
          ? run.fontSizePt
          : null,
      text: run.text,
    }))
    .filter(
      (run) =>
        run.bounds.right > run.bounds.left &&
        run.bounds.top > run.bounds.bottom,
    )
    .sort((a, b) => {
      const centerA = (a.bounds.top + a.bounds.bottom) / 2;
      const centerB = (b.bounds.top + b.bounds.bottom) / 2;
      if (Math.abs(centerB - centerA) > 0.0001) return centerB - centerA;
      return a.bounds.left - b.bounds.left;
    });

  if (runs.length === 0) return [];

  const fontSizes = runs
    .map((r) => r.fontSizePt)
    .filter((s): s is number => typeof s === "number");
  const lineTolerancePt = clamp(
    (fontSizes.length > 0 ? median(fontSizes) : 12) / 3,
    2,
    8,
  );

  type LineBucket = {
    minLeft: number;
    maxRight: number;
    minBottom: number;
    maxTop: number;
    centerYSum: number;
    centerYCount: number;
    fontSizes: number[];
    runTexts: Array<{ text: string; left: number; right: number }>;
  };

  const buckets: LineBucket[] = [];

  for (const run of runs) {
    const runCenterY = (run.bounds.top + run.bounds.bottom) / 2;
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      const lineCenterY = bucket.centerYSum / Math.max(bucket.centerYCount, 1);
      const dist = Math.abs(lineCenterY - runCenterY);
      if (dist <= lineTolerancePt && dist < bestDistance) {
        bestDistance = dist;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) {
      buckets.push({
        minLeft: run.bounds.left,
        maxRight: run.bounds.right,
        minBottom: run.bounds.bottom,
        maxTop: run.bounds.top,
        centerYSum: runCenterY,
        centerYCount: 1,
        fontSizes: run.fontSizePt ? [run.fontSizePt] : [],
        runTexts: [
          { text: run.text, left: run.bounds.left, right: run.bounds.right },
        ],
      });
    } else {
      const b = buckets[bestIndex];
      b.minLeft = Math.min(b.minLeft, run.bounds.left);
      b.maxRight = Math.max(b.maxRight, run.bounds.right);
      b.minBottom = Math.min(b.minBottom, run.bounds.bottom);
      b.maxTop = Math.max(b.maxTop, run.bounds.top);
      b.centerYSum += runCenterY;
      b.centerYCount += 1;
      if (run.fontSizePt) b.fontSizes.push(run.fontSizePt);
      b.runTexts.push({
        text: run.text,
        left: run.bounds.left,
        right: run.bounds.right,
      });
    }
  }

  return buckets
    .map((b) => {
      const bounds = {
        left: b.minLeft,
        right: b.maxRight,
        bottom: b.minBottom,
        top: b.maxTop,
      };
      const sortedRuns = b.runTexts.slice().sort((a, z) => a.left - z.left);
      const cleanedRuns = removeEmbeddedPunctuationFragments(sortedRuns);
      // Join adjacent runs without a space when touching (gap ≤ 2pt) to avoid
      // split words like "СОДЕР ЖАНИЕ".
      let text = "";
      for (let i = 0; i < cleanedRuns.length; i++) {
        const part = cleanedRuns[i].text;
        if (i === 0) {
          text = part;
        } else {
          const gap = cleanedRuns[i].left - cleanedRuns[i - 1].right;
          text += gap <= 2 ? part : ` ${part}`;
        }
      }
      return {
        pageNumber: page.pageNumber,
        pageBox: page.pageBox,
        bounds,
        text: text.trim(),
        centerY: b.centerYSum / Math.max(b.centerYCount, 1),
        fontSizePt: b.fontSizes.length > 0 ? median(b.fontSizes) : null,
        left: bounds.left,
        right: bounds.right,
      };
    })
    .sort((a, b) => b.centerY - a.centerY);
}

export function normalizeText(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Strip everything except letters (Cyrillic + Latin) and digits, then uppercase.
 *  Used for fuzzy TOC↔body matching where spacing and punctuation may differ. */
export function normalizeForMatching(s: string): string {
  return s.toUpperCase().replace(/[^А-ЯЁA-Z0-9]/g, "");
}

function removeEmbeddedPunctuationFragments(
  runs: Array<{ text: string; left: number; right: number }>,
): Array<{ text: string; left: number; right: number }> {
  const cleaned: Array<{ text: string; left: number; right: number }> = [];

  for (const run of runs) {
    const prev = cleaned[cleaned.length - 1];
    const width = Math.max(run.right - run.left, 0);
    const punctuationOnly = /^[\s.,:;!?·•…⋯-]+$/u.test(run.text);
    const embeddedInPrev =
      prev !== undefined &&
      run.left >= prev.left - 1 &&
      run.right <= prev.right + 1;

    // PDFium may emit duplicate punctuation as a tiny overlapping run.
    // Ignore it when it is fully inside a broader text run.
    if (punctuationOnly && width <= 8 && embeddedInPrev) {
      continue;
    }

    cleaned.push(run);
  }

  return cleaned;
}

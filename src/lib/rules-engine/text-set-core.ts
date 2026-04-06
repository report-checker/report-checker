import type { TypographyConfig } from "../checker-config";
import { overlayBox } from "./overlays";
import type {
  EnginePage,
  OverlayBox,
  OverlayStyle,
  PdfRect,
  RgbColor,
  RuleStatus,
} from "./types";

export const POINTS_PER_CM = 72 / 2.54;

const FAIL_STYLE_BASE: Omit<OverlayStyle, "fillColor"> = {
  borderColor: "#dc2626",
  borderWidth: 2,
  dashed: false,
};

const PASS_STYLE_BASE: Omit<OverlayStyle, "fillColor"> = {
  borderColor: "#059669",
  borderWidth: 1,
  dashed: true,
};

export type PageFormatMeasurement = {
  pageNumber: number;
  pageBox: PdfRect;
  shortSidePt: number;
  longSidePt: number;
};

export type FontSizeViolation = {
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  fontSizePt: number;
};

export type ColorViolation = {
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  color: RgbColor;
};

export type ColoredRunMeasurement = {
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  color: RgbColor;
};

export type TextLine = {
  pageNumber: number;
  pageBox: PdfRect | null;
  text: string;
  bounds: PdfRect;
  left: number;
  right: number;
  width: number;
  centerY: number;
  spacingAnchorY: number;
  fontSizePt: number | null;
};

export type PageLayout = {
  pageNumber: number;
  pageBox: PdfRect | null;
  bodyFontPt: number | null;
  lines: TextLine[];
  bodyLines: TextLine[];
  mainLeft: number;
  mainRight: number;
  textWidth: number;
};

export type ParagraphSegment = {
  pageNumber: number;
  pageBox: PdfRect | null;
  lines: TextLine[];
  startLine: TextLine;
  endLine: TextLine;
  bounds: PdfRect;
  mainLeft: number;
  mainRight: number;
  bodyFontPt: number | null;
  startIndentPt: number;
};

export type SpacingMeasurement = {
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  ratio: number;
  guideTopY: number;
  guideBottomY: number;
};

export type IndentMeasurement = {
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  indentPt: number;
};

export type AlignmentMeasurement = {
  pageNumber: number;
  pageBox: PdfRect | null;
  bounds: PdfRect;
  shortfallPt: number;
};

export function analyzePageLayout(
  page: EnginePage,
  config: TypographyConfig,
): PageLayout | null {
  const lines = collectTextLines(page);
  if (lines.length === 0) {
    return null;
  }

  const lineFontSizes = lines
    .map((line) => line.fontSizePt)
    .filter(
      (size): size is number =>
        typeof size === "number" && Number.isFinite(size),
    );
  const bodyFontPt =
    lineFontSizes.length > 0 ? chooseBodyFontSize(lineFontSizes) : null;

  const fontFiltered =
    bodyFontPt === null
      ? lines
      : lines.filter(
          (line) =>
            typeof line.fontSizePt === "number" &&
            Math.abs(line.fontSizePt - bodyFontPt) <=
              config.bodyFontTolerancePt,
        );
  const geometryLines = fontFiltered.length >= 3 ? fontFiltered : lines;
  const mainLeft = percentile(
    geometryLines.map((line) => line.left),
    0.15,
  );
  const mainRight = percentile(
    geometryLines.map((line) => line.right),
    0.85,
  );
  const textWidth = Math.max(mainRight - mainLeft, 1);

  const widthFiltered = geometryLines.filter(
    (line) => line.width >= textWidth * config.minBodyLineWidthRatio,
  );
  const bodyCandidates = (
    widthFiltered.length >= 2 ? widthFiltered : geometryLines
  ).sort((left, right) => right.centerY - left.centerY);
  const bodyLines = filterBodyLines(
    bodyCandidates,
    mainLeft,
    mainRight,
    textWidth,
    bodyFontPt,
    config,
  );

  return {
    pageNumber: page.pageNumber,
    pageBox: page.pageBox,
    bodyFontPt,
    lines,
    bodyLines,
    mainLeft,
    mainRight,
    textWidth,
  };
}

function collectTextLines(page: EnginePage): TextLine[] {
  const runs = page.textRuns
    .filter((run) => run.text.trim().length > 0)
    .map((run) => ({
      text: run.text,
      bounds: normalizeRect(run.bounds),
      fontSizePt:
        typeof run.fontSizePt === "number" && Number.isFinite(run.fontSizePt)
          ? run.fontSizePt
          : null,
    }))
    .filter(
      (run) =>
        run.bounds.right > run.bounds.left &&
        run.bounds.top > run.bounds.bottom,
    )
    .sort((left, right) => {
      const centerLeft = (left.bounds.top + left.bounds.bottom) / 2;
      const centerRight = (right.bounds.top + right.bounds.bottom) / 2;
      if (Math.abs(centerRight - centerLeft) > 0.0001) {
        return centerRight - centerLeft;
      }
      return left.bounds.left - right.bounds.left;
    });

  if (runs.length === 0) {
    return [];
  }

  const runFontSizes = runs
    .map((run) => run.fontSizePt)
    .filter((size): size is number => typeof size === "number");
  const lineTolerancePt = clamp(
    (runFontSizes.length > 0 ? median(runFontSizes) : 12) / 3,
    2,
    8,
  );

  const lines: Array<{
    minLeft: number;
    maxRight: number;
    minBottom: number;
    maxTop: number;
    centerYSum: number;
    centerYCount: number;
    fontSizes: number[];
    fragments: Array<{
      left: number;
      text: string;
      bounds: PdfRect;
      centerY: number;
      width: number;
    }>;
  }> = [];

  for (const run of runs) {
    const runCenterY = (run.bounds.top + run.bounds.bottom) / 2;
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineCenterY = line.centerYSum / Math.max(line.centerYCount, 1);
      const distance = Math.abs(lineCenterY - runCenterY);
      if (distance <= lineTolerancePt && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestIndex === -1) {
      lines.push({
        minLeft: run.bounds.left,
        maxRight: run.bounds.right,
        minBottom: run.bounds.bottom,
        maxTop: run.bounds.top,
        centerYSum: runCenterY,
        centerYCount: 1,
        fontSizes: run.fontSizePt ? [run.fontSizePt] : [],
        fragments: [
          {
            left: run.bounds.left,
            text: run.text,
            bounds: run.bounds,
            centerY: runCenterY,
            width: run.bounds.right - run.bounds.left,
          },
        ],
      });
      continue;
    }

    const line = lines[bestIndex];
    line.minLeft = Math.min(line.minLeft, run.bounds.left);
    line.maxRight = Math.max(line.maxRight, run.bounds.right);
    line.minBottom = Math.min(line.minBottom, run.bounds.bottom);
    line.maxTop = Math.max(line.maxTop, run.bounds.top);
    line.centerYSum += runCenterY;
    line.centerYCount += 1;
    if (run.fontSizePt) {
      line.fontSizes.push(run.fontSizePt);
    }
    line.fragments.push({
      left: run.bounds.left,
      text: run.text,
      bounds: run.bounds,
      centerY: runCenterY,
      width: run.bounds.right - run.bounds.left,
    });
  }

  return lines
    .map((line) => {
      const bounds = {
        left: line.minLeft,
        right: line.maxRight,
        bottom: line.minBottom,
        top: line.maxTop,
      };
      return {
        pageNumber: page.pageNumber,
        pageBox: page.pageBox,
        text: buildLineText(line.fragments),
        bounds,
        left: bounds.left,
        right: bounds.right,
        width: bounds.right - bounds.left,
        centerY: line.centerYSum / Math.max(line.centerYCount, 1),
        spacingAnchorY: computeSpacingAnchorY(line.fragments, bounds),
        fontSizePt: line.fontSizes.length > 0 ? median(line.fontSizes) : null,
      };
    })
    .sort((left, right) => right.centerY - left.centerY);
}

function buildParagraphSegment(
  layout: PageLayout,
  paragraphLines: TextLine[],
): ParagraphSegment | null {
  const startLine = paragraphLines[0];
  const endLine = paragraphLines.at(-1);
  if (!startLine || !endLine) {
    return null;
  }

  const bounds = paragraphLines
    .slice(1)
    .reduce(
      (current, line) => unionRects(current, line.bounds),
      startLine.bounds,
    );
  const bodyAnchorLines =
    paragraphLines.length >= 3
      ? paragraphLines.slice(1, -1)
      : paragraphLines.slice(1);
  const localBodyLines =
    bodyAnchorLines.length > 0 ? bodyAnchorLines : paragraphLines;
  const localMainLeft =
    localBodyLines.length > 0
      ? median(localBodyLines.map((line) => line.left))
      : layout.mainLeft;
  const localMainRight =
    localBodyLines.length > 0
      ? percentile(
          localBodyLines.map((line) => line.right),
          localBodyLines.length > 2 ? 0.75 : 0.5,
        )
      : layout.mainRight;

  return {
    pageNumber: layout.pageNumber,
    pageBox: layout.pageBox,
    lines: paragraphLines,
    startLine,
    endLine,
    bounds,
    mainLeft: localMainLeft,
    mainRight: localMainRight,
    bodyFontPt: layout.bodyFontPt,
    startIndentPt: startLine.left - localMainLeft,
  };
}

export function segmentParagraphs(
  layout: PageLayout,
  config: TypographyConfig,
): ParagraphSegment[] {
  const lines = layout.bodyLines;
  if (lines.length === 0) {
    return [];
  }

  const paragraphs: ParagraphSegment[] = [];
  let paragraphStartIndex = 0;

  for (let index = 1; index < lines.length; index += 1) {
    if (!isParagraphBoundary(layout, lines, index, config)) {
      continue;
    }

    const segment = buildParagraphSegment(
      layout,
      lines.slice(paragraphStartIndex, index),
    );
    if (segment) {
      paragraphs.push(segment);
    }
    paragraphStartIndex = index;
  }

  const trailingSegment = buildParagraphSegment(
    layout,
    lines.slice(paragraphStartIndex),
  );
  if (trailingSegment) {
    paragraphs.push(trailingSegment);
  }

  return paragraphs;
}

export function averageFontSize(
  left: TextLine,
  right: TextLine,
  fallback: number | null,
): number | null {
  const values = [left.fontSizePt, right.fontSizePt, fallback].filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function filterBodyLines(
  lines: TextLine[],
  mainLeft: number,
  mainRight: number,
  textWidth: number,
  bodyFontPt: number | null,
  config: TypographyConfig,
): TextLine[] {
  const filtered = lines.filter((line) =>
    isProbablyBodyLine(
      line,
      mainLeft,
      mainRight,
      textWidth,
      bodyFontPt,
      config,
    ),
  );

  return filtered.length >= Math.min(Math.max(lines.length - 1, 1), 3)
    ? filtered
    : lines;
}

function isProbablyBodyLine(
  line: TextLine,
  mainLeft: number,
  mainRight: number,
  textWidth: number,
  bodyFontPt: number | null,
  config: TypographyConfig,
): boolean {
  const textCenter = (mainLeft + mainRight) / 2;
  const lineCenter = (line.left + line.right) / 2;
  const centeredTolerancePt = Math.max(12, textWidth * 0.08);
  const isCenteredShort =
    Math.abs(lineCenter - textCenter) <= centeredTolerancePt &&
    line.width < textWidth * 0.72;
  const fontOffset =
    bodyFontPt !== null && line.fontSizePt !== null
      ? Math.abs(line.fontSizePt - bodyFontPt)
      : 0;
  const looksLikeHeading =
    isLikelyHeadingText(line.text) && line.width < textWidth * 0.78;
  const looksLikeListItem =
    isLikelyListMarker(line.text) && line.width < textWidth * 0.6;

  if (isCenteredShort || looksLikeHeading || looksLikeListItem) {
    return false;
  }

  if (
    fontOffset > Math.max(config.bodyFontTolerancePt, 1) &&
    line.width < textWidth * 0.75
  ) {
    return false;
  }

  return true;
}

function buildLineText(
  fragments: Array<{ left: number; text: string }>,
): string {
  return fragments
    .slice()
    .sort((left, right) => left.left - right.left)
    .map((fragment) => fragment.text.trim())
    .filter((fragment) => fragment.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeSpacingAnchorY(
  fragments: Array<{
    text: string;
    centerY: number;
    width: number;
    bounds: PdfRect;
  }>,
  bounds: PdfRect,
): number {
  const meaningfulFragments = fragments.filter((fragment) =>
    /[\p{L}\p{N}]/u.test(fragment.text),
  );
  const weightedBottom = weightedAverageBottom(
    meaningfulFragments.length > 0 ? meaningfulFragments : fragments,
  );

  if (weightedBottom !== null) {
    return weightedBottom;
  }

  return bounds.bottom;
}

function weightedAverageBottom(
  fragments: Array<{ bounds: PdfRect; width: number }>,
): number | null {
  if (fragments.length === 0) {
    return null;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const fragment of fragments) {
    const weight = Math.max(fragment.width, 1);
    weightedSum += fragment.bounds.bottom * weight;
    totalWeight += weight;
  }

  if (
    !Number.isFinite(weightedSum) ||
    !Number.isFinite(totalWeight) ||
    totalWeight <= 0
  ) {
    return null;
  }

  return weightedSum / totalWeight;
}

function isLikelyHeadingText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return false;
  }

  const letters = normalized.match(/[A-Za-zА-Яа-яЁё]/g) ?? [];
  if (letters.length === 0 || letters.length > 80) {
    return false;
  }

  const upperLetters = letters.filter(
    (letter) =>
      letter === letter.toUpperCase() && letter !== letter.toLowerCase(),
  );
  const uppercaseRatio = upperLetters.length / letters.length;
  const wordCount = normalized.split(/\s+/).length;

  return uppercaseRatio >= 0.75 && wordCount <= 10;
}

function isLikelyListMarker(text: string): boolean {
  return /^([-\u2022*]|\(?\d+[\).]|[A-Za-zА-Яа-яЁё][\).])\s+/u.test(
    text.trim(),
  );
}

function isParagraphBoundary(
  layout: PageLayout,
  lines: TextLine[],
  index: number,
  config: TypographyConfig,
): boolean {
  if (index === 0) {
    return true;
  }

  const previous = lines[index - 1];
  const current = lines[index];
  const avgFont = averageFontSize(previous, current, layout.bodyFontPt);
  if (!avgFont) {
    return false;
  }

  return (
    scoreParagraphBoundary(layout, previous, current, avgFont, config) >= 4
  );
}

function scoreParagraphBoundary(
  layout: PageLayout,
  previous: TextLine,
  current: TextLine,
  avgFont: number,
  config: TypographyConfig,
): number {
  const verticalGap = previous.centerY - current.centerY;
  const gapRatio = verticalGap / Math.max(avgFont, 1);
  const indentDetectionPt = config.indentDetectionMinCm * POINTS_PER_CM;
  const indentTolerancePt = config.indentToleranceCm * POINTS_PER_CM;
  const strongIndentPt = Math.max(
    indentDetectionPt * 2,
    config.indentExpectedCm * POINTS_PER_CM * 0.45,
  );
  const currentIndentPt = current.left - layout.mainLeft;
  const previousRightShortfall = Math.max(layout.mainRight - previous.right, 0);
  const alignTolerancePt = config.alignRightToleranceCm * POINTS_PER_CM;
  const leftDriftPt = Math.abs(current.left - previous.left);
  const smallLeftDriftPt = Math.max(indentDetectionPt * 0.5, avgFont * 0.25);
  const nearExpectedSpacing =
    gapRatio <= config.expectedLineSpacing + config.lineSpacingTolerance;
  let score = 0;

  if (gapRatio > config.paragraphBreakFactor + 0.35) {
    score += 5;
  } else if (gapRatio > config.paragraphBreakFactor) {
    score += 3;
  }

  if (
    currentIndentPt >=
    config.indentExpectedCm * POINTS_PER_CM - indentTolerancePt
  ) {
    score += 5;
  } else if (currentIndentPt >= strongIndentPt) {
    score += 4;
  } else if (currentIndentPt >= indentDetectionPt * 1.5) {
    score += 2;
  }

  if (previousRightShortfall > alignTolerancePt * 1.5) {
    score += 2;
  } else if (previousRightShortfall > alignTolerancePt) {
    score += 1;
  }

  if (
    previousRightShortfall > alignTolerancePt &&
    currentIndentPt >= strongIndentPt
  ) {
    score += 3;
  }

  if (
    currentIndentPt < strongIndentPt &&
    previousRightShortfall <= alignTolerancePt &&
    gapRatio <= config.paragraphBreakFactor
  ) {
    score -= 4;
  }

  if (leftDriftPt <= smallLeftDriftPt && nearExpectedSpacing) {
    score -= 2;
  }

  return score;
}

function chooseBodyFontSize(sizes: number[]): number {
  const sane = sizes.filter((size) => size >= 8 && size <= 20);
  return sane.length > 0 ? median(sane) : median(sizes);
}

export function horizontalOverlapRatio(
  left: TextLine,
  right: TextLine,
): number {
  const overlap = Math.max(
    0,
    Math.min(left.right, right.right) - Math.max(left.left, right.left),
  );
  const baseline = Math.max(Math.min(left.width, right.width), 1);
  return overlap / baseline;
}

export function unionRects(left: PdfRect, right: PdfRect): PdfRect {
  return {
    left: Math.min(left.left, right.left),
    right: Math.max(left.right, right.right),
    bottom: Math.min(left.bottom, right.bottom),
    top: Math.max(left.top, right.top),
  };
}

export function normalizeRect(rect: PdfRect): PdfRect {
  return {
    left: Math.min(rect.left, rect.right),
    right: Math.max(rect.left, rect.right),
    bottom: Math.min(rect.bottom, rect.top),
    top: Math.max(rect.bottom, rect.top),
  };
}

export function buildMeasurementOverlays<
  T extends { pageNumber: number; pageBox: PdfRect | null; bounds: PdfRect },
>(entries: T[], style: OverlayStyle): OverlayBox[] {
  return entries.flatMap((entry) => {
    if (!entry.pageBox) {
      return [];
    }
    return [overlayBox(entry.pageNumber, entry.pageBox, entry.bounds, style)];
  });
}

export function buildParagraphOutlineOverlays(
  paragraphs: ParagraphSegment[],
): OverlayBox[] {
  return paragraphs.flatMap((paragraph) => {
    if (!paragraph.pageBox) {
      return [];
    }
    return [
      overlayBox(
        paragraph.pageNumber,
        paragraph.pageBox,
        paragraph.bounds,
        styleForParagraphOutline(),
      ),
    ];
  });
}

export function collectWorstPerPage<T extends { pageNumber: number }>(
  entries: T[],
  score: (entry: T) => number,
): Map<number, T> {
  const worstByPage = new Map<number, T>();
  for (const entry of entries) {
    const existing = worstByPage.get(entry.pageNumber);
    if (!existing || score(entry) > score(existing)) {
      worstByPage.set(entry.pageNumber, entry);
    }
  }
  return worstByPage;
}

export function isFiniteColor(color: RgbColor): boolean {
  return (
    Number.isFinite(color.r) &&
    Number.isFinite(color.g) &&
    Number.isFinite(color.b)
  );
}

export function isNearBlack(color: RgbColor, blackChannelMax: number): boolean {
  return maxColorChannel(color) <= blackChannelMax;
}

export function maxColorChannel(color: RgbColor): number {
  return Math.max(color.r, color.g, color.b);
}

export function styleForPageFormat(status: RuleStatus): OverlayStyle {
  return styleForStatus(status, {
    failFillColor: "rgba(239, 68, 68, 0.06)",
    passFillColor: "rgba(16, 185, 129, 0.06)",
  });
}

export function styleForFontSize(status: RuleStatus): OverlayStyle {
  return styleForStatus(status, {
    failFillColor: "rgba(239, 68, 68, 0.10)",
    passFillColor: "rgba(16, 185, 129, 0.10)",
  });
}

export function styleForLineSpacing(status: RuleStatus): OverlayStyle {
  return styleForStatus(status, {
    failFillColor: "rgba(239, 68, 68, 0.08)",
    passFillColor: "rgba(16, 185, 129, 0.08)",
  });
}

export function styleForFontColor(status: RuleStatus): OverlayStyle {
  return styleForStatus(status, {
    failFillColor: "rgba(239, 68, 68, 0.12)",
    passFillColor: "rgba(16, 185, 129, 0.10)",
  });
}

export function styleForIndent(status: RuleStatus): OverlayStyle {
  return styleForStatus(status, {
    failFillColor: "rgba(239, 68, 68, 0.10)",
    passFillColor: "rgba(16, 185, 129, 0.08)",
  });
}

export function styleForAlignment(status: RuleStatus): OverlayStyle {
  return styleForStatus(status, {
    failFillColor: "rgba(239, 68, 68, 0.10)",
    passFillColor: "rgba(16, 185, 129, 0.08)",
  });
}

export function styleForParagraphOutline(): OverlayStyle {
  return {
    borderColor: "#0f766e",
    fillColor: "rgba(15, 118, 110, 0.04)",
    borderWidth: 1,
    dashed: true,
  };
}

function styleForStatus(
  status: RuleStatus,
  fills: { failFillColor: string; passFillColor: string },
): OverlayStyle {
  if (status === "fail") {
    return {
      ...FAIL_STYLE_BASE,
      fillColor: fills.failFillColor,
    };
  }

  return {
    ...PASS_STYLE_BASE,
    fillColor: fills.passFillColor,
  };
}

export function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * ratio)),
  );
  return sorted[index];
}

export function median(values: number[]): number {
  return percentile(values, 0.5);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function ptToCm(points: number): number {
  return points / POINTS_PER_CM;
}

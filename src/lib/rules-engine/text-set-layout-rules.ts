import { collectMainTextParagraphs } from "./paragraph-engine";
import {
  type AlignmentMeasurement,
  averageFontSize,
  buildMeasurementOverlays,
  buildParagraphOutlineOverlays,
  collectWorstPerPage,
  horizontalOverlapRatio,
  type IndentMeasurement,
  median,
  POINTS_PER_CM,
  ptToCm,
  type SpacingMeasurement,
  styleForAlignment,
  styleForIndent,
  styleForLineSpacing,
  unionRects,
} from "./text-set-core";
import { overlayBox } from "./overlays";
import type {
  EngineContext,
  OverlayBox,
  OverlayStyle,
  PdfRect,
  RuleResult,
  RuleStatus,
} from "./types";

// PDF glyph boxes can shift line bottoms slightly depending on descenders.
// Keep a small guard band to avoid false failures near the configured limit.
const LINE_SPACING_GUIDE_THICKNESS_PT = 1.5;
const LINE_SPACING_FAIL_GUIDE_STYLE: OverlayStyle = {
  borderColor: "#dc2626",
  fillColor: "rgba(220, 38, 38, 0.85)",
  borderWidth: 0,
  dashed: false,
};
const LINE_SPACING_PASS_GUIDE_STYLE: OverlayStyle = {
  borderColor: "#059669",
  fillColor: "rgba(5, 150, 105, 0.65)",
  borderWidth: 0,
  dashed: false,
};

export function buildLineSpacingRule(context: EngineContext): RuleResult {
  const { pages, config } = context;
  const typo = config.typography;
  const paragraphs = collectMainTextParagraphs(context);
  const measurements: SpacingMeasurement[] = [];
  const passed: SpacingMeasurement[] = [];
  const rawFailed: SpacingMeasurement[] = [];
  const measuredByPage = new Map<number, SpacingMeasurement[]>();
  const rawFailedByPage = new Map<number, SpacingMeasurement[]>();

  for (const paragraph of paragraphs) {
    const lines = paragraph.lines;
    for (let index = 1; index < lines.length; index += 1) {
      const previous = lines[index - 1];
      const current = lines[index];
      const avgFont = averageFontSize(previous, current, paragraph.bodyFontPt);
      if (!avgFont) {
        continue;
      }

      const gapPt = previous.spacingAnchorY - current.spacingAnchorY;
      if (gapPt <= 0 || gapPt > avgFont * typo.linePairMaxFactor) {
        continue;
      }

      if (horizontalOverlapRatio(previous, current) < typo.minOverlapRatio) {
        continue;
      }

      const ratio = gapPt / avgFont;
      const measurement: SpacingMeasurement = {
        pageNumber: current.pageNumber,
        pageBox: current.pageBox,
        bounds: unionRects(previous.bounds, current.bounds),
        ratio,
        guideTopY: previous.spacingAnchorY,
        guideBottomY: current.spacingAnchorY,
      };
      measurements.push(measurement);

      const pageMeasurements = measuredByPage.get(current.pageNumber) ?? [];
      pageMeasurements.push(measurement);
      measuredByPage.set(current.pageNumber, pageMeasurements);

      if (
        Math.abs(ratio - typo.expectedLineSpacing) >
        typo.lineSpacingTolerance + typo.lineSpacingComparisonEpsilon
      ) {
        rawFailed.push(measurement);
        const pageRawFailed = rawFailedByPage.get(current.pageNumber) ?? [];
        pageRawFailed.push(measurement);
        rawFailedByPage.set(current.pageNumber, pageRawFailed);
      } else {
        passed.push(measurement);
      }
    }
  }

  if (measurements.length === 0) {
    return {
      id: "line-spacing",
      title: "Межстрочный интервал 1,5",
      status: "warn",
      message:
        "Недостаточно данных для автоматической проверки межстрочного интервала.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: true,
      countInSummary: true,
    };
  }

  const averageRatio =
    measurements.reduce((sum, measurement) => sum + measurement.ratio, 0) /
    measurements.length;
  const failingPages = new Set<number>();

  for (const [pageNumber, pageMeasurements] of measuredByPage.entries()) {
    const pageRawFailed = rawFailedByPage.get(pageNumber) ?? [];
    const failedCount = pageRawFailed.length;
    const failedShare = failedCount / Math.max(pageMeasurements.length, 1);

    if (
      failedCount >= typo.lineSpacingPageFailMinViolations ||
      failedShare >= typo.lineSpacingPageFailRatioThreshold
    ) {
      failingPages.add(pageNumber);
    }
  }

  const failed = rawFailed.filter((entry) => failingPages.has(entry.pageNumber));
  const failedAreaOverlays = buildMeasurementOverlays(
    failed,
    styleForLineSpacing("fail"),
  );
  const passGuideOverlays = buildLineSpacingGuideOverlays(
    passed,
    LINE_SPACING_PASS_GUIDE_STYLE,
    "pass",
  );
  const failGuideOverlays = buildLineSpacingGuideOverlays(
    failed,
    LINE_SPACING_FAIL_GUIDE_STYLE,
    "fail",
  );
  const overlayBoxes = [
    ...passGuideOverlays,
    ...failedAreaOverlays,
    ...failGuideOverlays,
  ];

  const perPageWorst = collectWorstPerPage(failed, (entry) =>
    Math.abs(entry.ratio - typo.expectedLineSpacing),
  );
  const failedChildren = Array.from(perPageWorst.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([pageNumber, measurement]) => {
      const pageMeasurements = measuredByPage.get(pageNumber) ?? [];
      const pageAverageRatio =
        pageMeasurements.reduce((sum, entry) => sum + entry.ratio, 0) /
        Math.max(pageMeasurements.length, 1);

      return {
        id: `line-spacing-page-${pageNumber}`,
        title: `Страница ${pageNumber}`,
        status: "fail" as const,
        message: `Найден интервал ${measurement.ratio.toFixed(2)} (ожидается ${typo.expectedLineSpacing.toFixed(1)} ± ${typo.lineSpacingTolerance.toFixed(1)}). Средний интервал по странице: ${pageAverageRatio.toFixed(2)}.`,
        children: [],
        overlayBoxes: overlayBoxes.filter((box) => box.pageNumber === pageNumber),
        jumpPageNumbers: [pageNumber],
        childrenCollapsedByDefault: false,
        countInSummary: false,
      };
    });

  const status: RuleStatus = failingPages.size > 0 ? "fail" : "pass";
  const message =
    failingPages.size > 0
      ? `Нарушения межстрочного интервала на страницах: ${Array.from(failingPages)
          .sort((left, right) => left - right)
          .join(", ")}. Средний интервал: ${averageRatio.toFixed(2)}.`
      : rawFailed.length > 0
        ? `Проверено ${measurements.length} пар строк. Средний интервал: ${averageRatio.toFixed(2)}. Обнаружены единичные отклонения, но они не превышают пороги page-level эвристики.`
        : `Проверено ${measurements.length} пар строк. Средний интервал: ${averageRatio.toFixed(2)}. Интервал соответствует требованию 1,5.`;

  return {
    id: "line-spacing",
    title: "Межстрочный интервал 1,5",
    status,
    message,
    children: failedChildren,
    overlayBoxes,
    jumpPageNumbers: pages.map((page) => page.pageNumber),
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function buildLineSpacingGuideOverlays(
  measurements: SpacingMeasurement[],
  style: OverlayStyle,
  kind: "pass" | "fail",
): OverlayBox[] {
  const overlays: OverlayBox[] = [];
  const seen = new Set<string>();
  const halfThickness = LINE_SPACING_GUIDE_THICKNESS_PT / 2;

  for (const measurement of measurements) {
    if (!measurement.pageBox) {
      continue;
    }

    const guideYs = [measurement.guideTopY, measurement.guideBottomY];
    for (const y of guideYs) {
      const key = `${kind}:${measurement.pageNumber}:${y.toFixed(3)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const bounds: PdfRect = {
        left: measurement.pageBox.left,
        right: measurement.pageBox.right,
        bottom: y - halfThickness,
        top: y + halfThickness,
      };
      overlays.push(
        overlayBox(measurement.pageNumber, measurement.pageBox, bounds, style),
      );
    }
  }

  return overlays;
}

export function buildParagraphIndentRule(context: EngineContext): RuleResult {
  const { pages, config } = context;
  const typo = config.typography;
  const indentDetectionMinPt = typo.indentDetectionMinCm * POINTS_PER_CM;
  const indentDetectionMaxPt = typo.indentDetectionMaxCm * POINTS_PER_CM;
  const indentExpectedPt = typo.indentExpectedCm * POINTS_PER_CM;
  const indentTolerancePt = typo.indentToleranceCm * POINTS_PER_CM;

  const paragraphs = collectMainTextParagraphs(context);
  const paragraphOverlays = buildParagraphOutlineOverlays(paragraphs);
  const measurements: IndentMeasurement[] = paragraphs
    .filter(
      (paragraph) =>
        paragraph.startIndentPt >= indentDetectionMinPt &&
        paragraph.startIndentPt <= indentDetectionMaxPt,
    )
    .map((paragraph) => ({
      pageNumber: paragraph.startLine.pageNumber,
      pageBox: paragraph.startLine.pageBox,
      bounds: paragraph.startLine.bounds,
      indentPt: paragraph.startIndentPt,
    }));

  if (measurements.length === 0) {
    return {
      id: "paragraph-indent",
      title: "Абзацный отступ 1,25 см (одинаковый)",
      status: "warn",
      message:
        "Не удалось надежно выделить абзацные отступы для автоматической проверки.",
      children: [],
      overlayBoxes: paragraphOverlays,
      jumpPageNumbers: pages.map((page) => page.pageNumber),
      childrenCollapsedByDefault: true,
      countInSummary: true,
    };
  }

  const minIndent = Math.min(...measurements.map((entry) => entry.indentPt));
  const maxIndent = Math.max(...measurements.map((entry) => entry.indentPt));
  const spreadPt = maxIndent - minIndent;

  const violations = measurements.filter(
    (entry) => Math.abs(entry.indentPt - indentExpectedPt) > indentTolerancePt,
  );
  const inconsistent = spreadPt > indentTolerancePt;

  const violationOverlays = buildMeasurementOverlays(
    violations.length > 0 ? violations : inconsistent ? measurements : [],
    styleForIndent("fail"),
  );
  const perPageWorst = collectWorstPerPage(violations, (entry) =>
    Math.abs(entry.indentPt - indentExpectedPt),
  );
  const failedChildren = Array.from(perPageWorst.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([pageNumber, entry]) => ({
      id: `paragraph-indent-page-${pageNumber}`,
      title: `Страница ${pageNumber}`,
      status: "fail" as const,
      message: `Найден отступ ${ptToCm(entry.indentPt).toFixed(2)} см; ожидается ${typo.indentExpectedCm.toFixed(2)} см ± ${ptToCm(indentTolerancePt).toFixed(2)} см.`,
      children: [],
      overlayBoxes: violationOverlays.filter(
        (box) => box.pageNumber === pageNumber,
      ),
      jumpPageNumbers: [pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    }));

  if (inconsistent && failedChildren.length === 0) {
    failedChildren.push({
      id: "paragraph-indent-consistency",
      title: "Согласованность отступа",
      status: "fail",
      message: `Отступы различаются слишком сильно: от ${ptToCm(minIndent).toFixed(2)} до ${ptToCm(maxIndent).toFixed(2)} см.`,
      children: [],
      overlayBoxes: [...paragraphOverlays, ...violationOverlays],
      jumpPageNumbers: Array.from(
        new Set(measurements.map((entry) => entry.pageNumber)),
      ),
      childrenCollapsedByDefault: false,
      countInSummary: false,
    });
  }

  const status: RuleStatus =
    violations.length > 0 || inconsistent
      ? "fail"
      : measurements.length < 2
        ? "warn"
        : "pass";
  const message =
    violations.length > 0 || inconsistent
      ? `Обнаружены проблемы с абзацным отступом. Измерено: ${measurements.length}, диапазон: ${ptToCm(minIndent).toFixed(2)}-${ptToCm(maxIndent).toFixed(2)} см.`
      : measurements.length < 2
        ? `Найдено мало абзацных отступов для уверенной проверки (${measurements.length}).`
        : `Абзацный отступ соответствует требованию: медиана ${ptToCm(median(measurements.map((entry) => entry.indentPt))).toFixed(2)} см.`;

  return {
    id: "paragraph-indent",
    title: "Абзацный отступ 1,25 см (одинаковый)",
    status,
    message,
    children: failedChildren,
    overlayBoxes: [...paragraphOverlays, ...violationOverlays],
    jumpPageNumbers: pages.map((page) => page.pageNumber),
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

export function buildJustifiedAlignmentRule(
  context: EngineContext,
): RuleResult {
  const { pages, config } = context;
  const typo = config.typography;
  const alignRightTolerancePt = typo.alignRightToleranceCm * POINTS_PER_CM;

  const paragraphs = collectMainTextParagraphs(context);
  const paragraphOverlays = buildParagraphOutlineOverlays(paragraphs);
  const checked: AlignmentMeasurement[] = [];
  const failed: AlignmentMeasurement[] = [];

  for (const paragraph of paragraphs) {
    const lines = paragraph.lines;
    for (let index = 0; index + 1 < lines.length; index += 1) {
      const line = lines[index];
      const next = lines[index + 1];
      const avgFont = averageFontSize(line, next, paragraph.bodyFontPt);
      if (!avgFont) {
        continue;
      }

      const gapPt = line.centerY - next.centerY;
      if (gapPt <= 0 || gapPt > avgFont * typo.linePairMaxFactor) {
        continue;
      }

      if (horizontalOverlapRatio(line, next) < typo.minOverlapRatio) {
        continue;
      }

      const shortfallPt = Math.max(paragraph.mainRight - line.right, 0);
      const measurement: AlignmentMeasurement = {
        pageNumber: line.pageNumber,
        pageBox: line.pageBox,
        bounds: line.bounds,
        shortfallPt,
      };
      checked.push(measurement);

      if (shortfallPt > alignRightTolerancePt) {
        failed.push(measurement);
      }
    }
  }

  const violationOverlays = buildMeasurementOverlays(
    failed,
    styleForAlignment("fail"),
  );

  if (checked.length === 0) {
    const message =
      paragraphs.length > 0
        ? "Абзацы выделены, но недостаточно данных для проверки выравнивания по ширине."
        : "Недостаточно данных для проверки выравнивания по ширине.";
    return {
      id: "text-alignment",
      title: "Выравнивание текста по ширине",
      status: "warn",
      message,
      children: [],
      overlayBoxes: paragraphOverlays,
      jumpPageNumbers: pages.map((page) => page.pageNumber),
      childrenCollapsedByDefault: true,
      countInSummary: true,
    };
  }
  const perPageWorst = collectWorstPerPage(
    failed,
    (entry) => entry.shortfallPt,
  );
  const failedChildren = Array.from(perPageWorst.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([pageNumber, entry]) => ({
      id: `text-alignment-page-${pageNumber}`,
      title: `Страница ${pageNumber}`,
      status: "fail" as const,
      message: `Строка не дотягивается до правой границы на ${ptToCm(entry.shortfallPt).toFixed(2)} см (допуск ${ptToCm(alignRightTolerancePt).toFixed(2)} см).`,
      children: [],
      overlayBoxes: violationOverlays.filter(
        (box) => box.pageNumber === pageNumber,
      ),
      jumpPageNumbers: [pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    }));

  const status: RuleStatus = failed.length > 0 ? "fail" : "pass";
  const message =
    failed.length > 0
      ? `Нарушения выравнивания по ширине на страницах: ${Array.from(
          perPageWorst.keys(),
        )
          .sort((left, right) => left - right)
          .join(", ")}.`
      : `Проверено ${checked.length} строк. Выравнивание по ширине соответствует требованиям.`;

  return {
    id: "text-alignment",
    title: "Выравнивание текста по ширине",
    status,
    message,
    children: failedChildren,
    overlayBoxes: [...paragraphOverlays, ...violationOverlays],
    jumpPageNumbers: pages.map((page) => page.pageNumber),
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}


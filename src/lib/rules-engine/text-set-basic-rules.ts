import { overlayBox } from "./overlays";
import {
  type ColoredRunMeasurement,
  type ColorViolation,
  collectWorstPerPage,
  type FontSizeViolation,
  isFiniteColor,
  isNearBlack,
  maxColorChannel,
  type PageFormatMeasurement,
  POINTS_PER_CM,
  ptToCm,
  styleForFontColor,
  styleForFontSize,
  styleForPageFormat,
} from "./text-set-core";
import type { EngineContext, RuleResult, RuleStatus } from "./types";

const LETTER_OR_DIGIT_REGEX = /[\p{L}\p{N}]/u;

function hasLetterOrDigitContent(text: string): boolean {
  return LETTER_OR_DIGIT_REGEX.test(text);
}

export function buildA4PageFormatRule(context: EngineContext): RuleResult {
  const { pages, config } = context;
  const a4WidthPt = config.pageFormat.widthCm * POINTS_PER_CM;
  const a4HeightPt = config.pageFormat.heightCm * POINTS_PER_CM;
  const a4TolerancePt = config.pageFormat.toleranceCm * POINTS_PER_CM;

  const measurements: PageFormatMeasurement[] = [];
  const missingPages: number[] = [];

  for (const page of pages) {
    if (!page.pageBox) {
      missingPages.push(page.pageNumber);
      continue;
    }

    const widthPt = Math.abs(page.pageBox.right - page.pageBox.left);
    const heightPt = Math.abs(page.pageBox.top - page.pageBox.bottom);

    measurements.push({
      pageNumber: page.pageNumber,
      pageBox: page.pageBox,
      shortSidePt: Math.min(widthPt, heightPt),
      longSidePt: Math.max(widthPt, heightPt),
    });
  }

  if (measurements.length === 0) {
    return {
      id: "page-format",
      title: "Формат листа A4 (21 x 29,7 см)",
      status: "warn",
      message: "Не удалось определить размер страниц автоматически.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: true,
      countInSummary: true,
    };
  }

  const failed = measurements.filter(
    (entry) =>
      Math.abs(entry.shortSidePt - a4WidthPt) > a4TolerancePt ||
      Math.abs(entry.longSidePt - a4HeightPt) > a4TolerancePt,
  );
  const overlayBoxes = failed.map((entry) =>
    overlayBox(
      entry.pageNumber,
      entry.pageBox,
      entry.pageBox,
      styleForPageFormat("fail"),
    ),
  );
  const failedChildren = failed.map((entry) => ({
    id: `page-format-page-${entry.pageNumber}`,
    title: `Страница ${entry.pageNumber}`,
    status: "fail" as const,
    message: `Фактический размер: ${ptToCm(entry.shortSidePt).toFixed(2)} x ${ptToCm(entry.longSidePt).toFixed(2)} см; ожидается A4 (${config.pageFormat.widthCm.toFixed(2)} x ${config.pageFormat.heightCm.toFixed(2)} см).`,
    children: [],
    overlayBoxes: [
      overlayBox(
        entry.pageNumber,
        entry.pageBox,
        entry.pageBox,
        styleForPageFormat("fail"),
      ),
    ],
    jumpPageNumbers: [entry.pageNumber],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  }));

  let status: RuleStatus = "pass";
  if (failed.length > 0) {
    status = "fail";
  } else if (missingPages.length > 0) {
    status = "warn";
  }

  const measuredPages = measurements.length;
  const message =
    failed.length > 0
      ? `Обнаружены страницы не в формате A4: ${failed.map((entry) => entry.pageNumber).join(", ")}.`
      : missingPages.length > 0
        ? `Размер страниц проверен на ${measuredPages} из ${pages.length} страниц.`
        : "Все страницы соответствуют формату A4.";

  return {
    id: "page-format",
    title: "Формат листа A4 (21 x 29,7 см)",
    status,
    message,
    children: failedChildren,
    overlayBoxes,
    jumpPageNumbers: pages.map((page) => page.pageNumber),
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

export function buildMinimumFontSizeRule(context: EngineContext): RuleResult {
  const { pages, config } = context;
  const { minFontSizePt, fontSizeTolerancePt } = config.typography;

  const violations: FontSizeViolation[] = [];
  let measuredRuns = 0;
  let missingMeasurements = 0;
  let minMeasuredFontPt = Number.POSITIVE_INFINITY;

  for (const page of pages) {
    for (const run of page.textRuns) {
      if (!hasLetterOrDigitContent(run.text)) {
        continue;
      }

      if (
        typeof run.fontSizePt !== "number" ||
        !Number.isFinite(run.fontSizePt) ||
        run.fontSizePt <= 0
      ) {
        missingMeasurements += 1;
        continue;
      }

      measuredRuns += 1;
      minMeasuredFontPt = Math.min(minMeasuredFontPt, run.fontSizePt);

      if (run.fontSizePt + fontSizeTolerancePt < minFontSizePt) {
        violations.push({
          pageNumber: page.pageNumber,
          pageBox: page.pageBox,
          bounds: run.bounds,
          fontSizePt: run.fontSizePt,
        });
      }
    }
  }

  if (measuredRuns === 0) {
    return {
      id: "font-size",
      title: "Размер шрифта не менее 12 пт",
      status: "warn",
      message: "Не удалось определить размер шрифта в извлеченном тексте.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: true,
      countInSummary: true,
    };
  }

  const overlayBoxes = violations.flatMap((violation) => {
    if (!violation.pageBox) {
      return [];
    }
    return [
      overlayBox(
        violation.pageNumber,
        violation.pageBox,
        violation.bounds,
        styleForFontSize("fail"),
      ),
    ];
  });
  const pageWorstViolation = new Map<number, number>();
  for (const violation of violations) {
    const current = pageWorstViolation.get(violation.pageNumber);
    if (current === undefined || violation.fontSizePt < current) {
      pageWorstViolation.set(violation.pageNumber, violation.fontSizePt);
    }
  }
  const failedChildren = Array.from(pageWorstViolation.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([pageNumber, minFontPt]) => ({
      id: `font-size-page-${pageNumber}`,
      title: `Страница ${pageNumber}`,
      status: "fail" as const,
      message: `Минимальный найденный размер: ${minFontPt.toFixed(2)} пт; требование: не менее ${minFontSizePt.toFixed(0)} пт.`,
      children: [],
      overlayBoxes: overlayBoxes.filter((box) => box.pageNumber === pageNumber),
      jumpPageNumbers: [pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    }));

  const minMeasuredText =
    minMeasuredFontPt === Number.POSITIVE_INFINITY
      ? "н/д"
      : `${minMeasuredFontPt.toFixed(2)} пт`;
  const failedPages = Array.from(pageWorstViolation.keys()).sort(
    (left, right) => left - right,
  );
  const status: RuleStatus =
    violations.length > 0 ? "fail" : missingMeasurements > 0 ? "warn" : "pass";

  const message =
    violations.length > 0
      ? `Нарушения обнаружены на страницах: ${failedPages.join(", ")}. Минимальный найденный размер: ${minMeasuredText}.`
      : missingMeasurements > 0
        ? `Проверка выполнена частично: ${measuredRuns} фрагментов с размером шрифта, без размера — ${missingMeasurements}. Минимальный найденный размер: ${minMeasuredText}.`
        : `Все проверенные фрагменты соответствуют требованию. Минимальный найденный размер: ${minMeasuredText}.`;

  return {
    id: "font-size",
    title: "Размер шрифта не менее 12 пт",
    status,
    message,
    children: failedChildren,
    overlayBoxes,
    jumpPageNumbers: pages.map((page) => page.pageNumber),
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

export function buildFontColorBlackRule(context: EngineContext): RuleResult {
  const { pages, config } = context;
  const { blackChannelMax, nonBlackFailRatio, nonBlackWarnRatio } =
    config.typography;

  const measured: ColoredRunMeasurement[] = [];
  let missingColorRuns = 0;

  for (const page of pages) {
    for (const run of page.textRuns) {
      if (run.text.trim().length === 0) {
        continue;
      }

      const color = run.textColorRgb;
      if (!color || !isFiniteColor(color)) {
        missingColorRuns += 1;
        continue;
      }

      measured.push({
        pageNumber: page.pageNumber,
        pageBox: page.pageBox,
        bounds: run.bounds,
        color,
      });
    }
  }

  const measuredRuns = measured.length;
  if (measuredRuns === 0) {
    return {
      id: "font-color",
      title: "Цвет шрифта — черный",
      status: "warn",
      message: "Не удалось определить цвет шрифта в извлеченном тексте.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: true,
      countInSummary: true,
    };
  }

  const nonBlackRuns = measured.filter(
    (entry) => !isNearBlack(entry.color, blackChannelMax),
  );
  const nonBlackRatio = nonBlackRuns.length / measuredRuns;

  const violations: ColorViolation[] =
    nonBlackRatio > nonBlackFailRatio
      ? nonBlackRuns.map((entry) => ({
          pageNumber: entry.pageNumber,
          pageBox: entry.pageBox,
          bounds: entry.bounds,
          color: entry.color,
        }))
      : [];

  const overlayBoxes = violations.flatMap((entry) => {
    if (!entry.pageBox) {
      return [];
    }
    return [
      overlayBox(
        entry.pageNumber,
        entry.pageBox,
        entry.bounds,
        styleForFontColor("fail"),
      ),
    ];
  });

  const perPageWorst = collectWorstPerPage(violations, (entry) =>
    maxColorChannel(entry.color),
  );
  const failedChildren = Array.from(perPageWorst.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([pageNumber, entry]) => ({
      id: `font-color-page-${pageNumber}`,
      title: `Страница ${pageNumber}`,
      status: "fail" as const,
      message: `Найден нечерный текст: rgb(${entry.color.r.toFixed(2)}, ${entry.color.g.toFixed(2)}, ${entry.color.b.toFixed(2)}).`,
      children: [],
      overlayBoxes: overlayBoxes.filter((box) => box.pageNumber === pageNumber),
      jumpPageNumbers: [pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    }));

  const ratioPercent = (nonBlackRatio * 100).toFixed(1);
  const status: RuleStatus =
    nonBlackRatio > nonBlackFailRatio
      ? "fail"
      : nonBlackRatio > nonBlackWarnRatio || missingColorRuns > 0
        ? "warn"
        : "pass";
  const message =
    status === "fail"
      ? `Доля нечерного текста слишком велика: ${ratioPercent}% (допуск до ${(nonBlackFailRatio * 100).toFixed(0)}%).`
      : status === "warn"
        ? `Текст в основном черный, но есть отклонения: нечерного текста ${ratioPercent}% (рекомендуемо до ${(nonBlackWarnRatio * 100).toFixed(0)}%), без данных о цвете — ${missingColorRuns}.`
        : `Текст в основном черный: нечерного текста ${ratioPercent}%.`;

  return {
    id: "font-color",
    title: "Цвет шрифта — черный",
    status,
    message,
    children: failedChildren,
    overlayBoxes,
    jumpPageNumbers: pages.map((page) => page.pageNumber),
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

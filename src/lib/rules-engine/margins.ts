import { overlayBox } from "./overlays";
import type {
  EnginePage,
  OverlayBox,
  OverlayStyle,
  PdfRect,
  RuleResult,
} from "./types";

const POINTS_PER_CM = 72 / 2.54;

type MarginMeasurement = {
  marginPt: number;
  pageNumber: number;
  pageBox: PdfRect;
  textBounds: PdfRect;
};

type MarginMeasurements = {
  measuredPages: number;
  left: MarginMeasurement[];
  right: MarginMeasurement[];
  top: MarginMeasurement[];
  bottom: MarginMeasurement[];
};

export function collectMarginMeasurements(
  pages: EnginePage[],
): MarginMeasurements {
  const measurements: MarginMeasurements = {
    measuredPages: 0,
    left: [],
    right: [],
    top: [],
    bottom: [],
  };

  for (const page of pages) {
    const pageBox = page.pageBox;
    const bounds = page.marginBounds;

    if (!pageBox || !bounds) {
      continue;
    }

    const pageMargins = {
      left: Math.max(bounds.left - pageBox.left, 0),
      right: Math.max(pageBox.right - bounds.right, 0),
      top: Math.max(pageBox.top - bounds.top, 0),
      bottom: Math.max(bounds.bottom - pageBox.bottom, 0),
    };

    measurements.measuredPages += 1;
    measurements.left.push(
      buildMeasurement(pageMargins.left, page.pageNumber, pageBox, bounds),
    );
    measurements.right.push(
      buildMeasurement(pageMargins.right, page.pageNumber, pageBox, bounds),
    );
    measurements.top.push(
      buildMeasurement(pageMargins.top, page.pageNumber, pageBox, bounds),
    );
    measurements.bottom.push(
      buildMeasurement(pageMargins.bottom, page.pageNumber, pageBox, bounds),
    );
  }

  return measurements;
}

export function buildMarginRuleNode(
  id: string,
  title: string,
  measurements: MarginMeasurement[],
  expectedCm: number,
  toleranceCm: number,
): RuleResult {
  if (measurements.length === 0) {
    return {
      id,
      title,
      status: "warn",
      message: "Не удалось рассчитать фактическое поле автоматически.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: true,
      countInSummary: true,
    };
  }

  const expectedPt = expectedCm * POINTS_PER_CM;
  const tolerancePt = toleranceCm * POINTS_PER_CM;
  const worstMeasurement = measurements.reduce((worst, current) =>
    current.marginPt < worst.marginPt ? current : worst,
  );
  const worstActualCm = worstMeasurement.marginPt / POINTS_PER_CM;

  const overlayBoxes: OverlayBox[] = [];
  const failedChildren: RuleResult[] = [];
  const failedPageNumbers: number[] = [];

  for (const measurement of measurements) {
    const status =
      measurement.marginPt + tolerancePt < expectedPt ? "fail" : "pass";
    const expectedZone = marginExpectedZone(
      id,
      measurement.pageBox,
      expectedPt,
    );
    const zoneStyle = styleForMarginZone(status);
    const textStyle = styleForMarginText(status);

    const pageOverlays = [
      overlayBox(
        measurement.pageNumber,
        measurement.pageBox,
        expectedZone,
        zoneStyle,
      ),
      overlayBox(
        measurement.pageNumber,
        measurement.pageBox,
        measurement.textBounds,
        textStyle,
      ),
    ];

    overlayBoxes.push(...pageOverlays);

    if (status === "fail") {
      failedPageNumbers.push(measurement.pageNumber);
      failedChildren.push({
        id: `${id}-page-${measurement.pageNumber}`,
        title: `Страница ${measurement.pageNumber}`,
        status: "fail",
        message: `Фактическое значение: ${(measurement.marginPt / POINTS_PER_CM).toFixed(2)} см; требование: не менее ${expectedCm.toFixed(2)} см.`,
        children: [],
        overlayBoxes: pageOverlays,
        jumpPageNumbers: [measurement.pageNumber],
        childrenCollapsedByDefault: false,
        countInSummary: false,
      });
    }
  }

  const status = failedChildren.length === 0 ? "pass" : "fail";

  const message =
    failedPageNumbers.length === 0
      ? `Все проверенные страницы соответствуют требованию. Худшее значение: ${worstActualCm.toFixed(2)} см; требование: не менее ${expectedCm.toFixed(2)} см (допуск ${toleranceCm.toFixed(2)} см).`
      : `Нарушения на страницах: ${failedPageNumbers.join(", ")}. Худшее значение: ${worstActualCm.toFixed(2)} см; требование: не менее ${expectedCm.toFixed(2)} см (допуск ${toleranceCm.toFixed(2)} см).`;

  return {
    id,
    title,
    status,
    message,
    children: failedChildren,
    overlayBoxes,
    jumpPageNumbers: measurements.map((measurement) => measurement.pageNumber),
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function buildMeasurement(
  marginPt: number,
  pageNumber: number,
  pageBox: PdfRect,
  textBounds: PdfRect,
): MarginMeasurement {
  return {
    marginPt,
    pageNumber,
    pageBox,
    textBounds,
  };
}

function marginExpectedZone(
  id: string,
  pageBox: PdfRect,
  expectedPt: number,
): PdfRect {
  if (id === "margin-left") {
    return {
      left: pageBox.left,
      right: Math.min(pageBox.left + expectedPt, pageBox.right),
      bottom: pageBox.bottom,
      top: pageBox.top,
    };
  }

  if (id === "margin-right") {
    return {
      left: Math.max(pageBox.right - expectedPt, pageBox.left),
      right: pageBox.right,
      bottom: pageBox.bottom,
      top: pageBox.top,
    };
  }

  if (id === "margin-top") {
    return {
      left: pageBox.left,
      right: pageBox.right,
      bottom: Math.max(pageBox.top - expectedPt, pageBox.bottom),
      top: pageBox.top,
    };
  }

  return {
    left: pageBox.left,
    right: pageBox.right,
    bottom: pageBox.bottom,
    top: Math.min(pageBox.bottom + expectedPt, pageBox.top),
  };
}

function styleForMarginZone(status: "pass" | "fail"): OverlayStyle {
  if (status === "fail") {
    return {
      borderColor: "#dc2626",
      fillColor: "rgba(239, 68, 68, 0.08)",
      borderWidth: 1,
      dashed: true,
    };
  }

  return {
    borderColor: "#059669",
    fillColor: "rgba(16, 185, 129, 0.08)",
    borderWidth: 1,
    dashed: true,
  };
}

function styleForMarginText(status: "pass" | "fail"): OverlayStyle {
  if (status === "fail") {
    return {
      borderColor: "#dc2626",
      fillColor: "rgba(239, 68, 68, 0.10)",
      borderWidth: 2,
      dashed: false,
    };
  }

  return {
    borderColor: "#059669",
    fillColor: "rgba(16, 185, 129, 0.10)",
    borderWidth: 2,
    dashed: false,
  };
}

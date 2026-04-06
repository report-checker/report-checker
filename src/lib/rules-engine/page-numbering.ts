import type { PageNumberingConfig } from "../checker-config";
import { overlayBox } from "./overlays";
import type {
  EngineContext,
  OverlayBox,
  OverlayStyle,
  PdfRect,
  RuleResult,
} from "./types";

type PageNumberCandidate = {
  valueText: string;
  valueNumber: number;
  placement: "в центре" | "справа";
  bottomDistancePt: number;
  bounds: PdfRect;
};

type DigitRun = {
  text: string;
  bounds: PdfRect;
  centerY: number;
};

type NumberingPattern = {
  preferredPlacement?: "в центре" | "справа";
  bottomDistanceBand?: [number, number];
};

type FailedPageInfo = {
  result: RuleResult;
  offset: number | null; // found - expected for wrong-number errors, null otherwise
  pageNumber: number;
};

function collapseShiftedRuns(infos: FailedPageInfo[]): RuleResult[] {
  const result: RuleResult[] = [];
  let i = 0;
  while (i < infos.length) {
    const current = infos[i];
    if (current.offset === null) {
      result.push(current.result);
      i++;
      continue;
    }
    // Extend run: same offset AND consecutive page numbers
    let j = i + 1;
    while (
      j < infos.length &&
      infos[j].offset === current.offset &&
      infos[j].pageNumber === infos[j - 1].pageNumber + 1
    ) {
      j++;
    }
    const run = infos.slice(i, j);
    if (run.length < 2) {
      result.push(current.result);
    } else {
      const firstPage = run[0].pageNumber;
      const lastPage = run[run.length - 1].pageNumber;
      const offset = current.offset;
      const shiftAbs = Math.abs(offset);
      const direction = offset < 0 ? "меньше" : "больше";
      result.push({
        id: `page-numbering-shifted-${firstPage}-${lastPage}`,
        title: `Страницы ${firstPage}–${lastPage}`,
        status: "fail",
        message: `Нумерация сдвинута: на ${run.length} страницах (${firstPage}–${lastPage}) номера на ${shiftAbs} ${direction} ожидаемых.`,
        children: run.map((info) => info.result),
        overlayBoxes: run.flatMap((info) => info.result.overlayBoxes),
        jumpPageNumbers: run.map((info) => info.pageNumber),
        childrenCollapsedByDefault: true,
        countInSummary: false,
      });
    }
    i = j;
  }
  return result;
}

export function buildPageNumberingRule(context: EngineContext): RuleResult {
  const { pages, config } = context;
  const pnConfig = config.pageNumbering;
  if (pages.length === 0) {
    return {
      id: "page-numbering",
      title: "Нумерация страниц",
      status: "warn",
      message: "Не удалось проверить нумерацию: страницы не найдены.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: true,
      countInSummary: true,
    };
  }

  const pageCount = pages.length;
  const pageCandidates = pages.map((page) =>
    page.pageBox
      ? collectPageNumberCandidates(page.pageBox, page.textRuns, pnConfig)
      : [],
  );
  const pattern = deriveNumberingPattern(pages, pageCandidates, pnConfig);

  const failedPageInfos: FailedPageInfo[] = [];
  const overlayBoxes: OverlayBox[] = [];
  const failedPages: number[] = [];
  let warnCount = 0;

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const candidates = pageCandidates[index];
    const pageBox = page.pageBox;

    if (!pageBox) {
      warnCount += 1;
      continue;
    }

    const expectedZone = overlayBox(
      page.pageNumber,
      pageBox,
      bottomZoneRect(pageBox),
      styleForNumberZone("pass"),
    );
    overlayBoxes.push(expectedZone);

    if (page.pageNumber === 1) {
      const found = selectFirstPageCandidate(candidates, pageCount, pattern);
      if (found) {
        const candidateBox = overlayBox(
          page.pageNumber,
          pageBox,
          found.bounds,
          styleForNumberValue("fail"),
        );
        overlayBoxes.push(candidateBox);
        failedPages.push(page.pageNumber);
        failedPageInfos.push({
          result: {
            id: `page-numbering-page-${page.pageNumber}`,
            title: `Страница ${page.pageNumber}`,
            status: "fail",
            message: `На титульном листе обнаружен номер «${found.valueText}» (${found.placement} внизу страницы).`,
            children: [],
            overlayBoxes: [expectedZone, candidateBox],
            jumpPageNumbers: [page.pageNumber],
            childrenCollapsedByDefault: false,
            countInSummary: false,
          },
          offset: null,
          pageNumber: page.pageNumber,
        });
      }
      continue;
    }

    const found = selectCandidateForExpectedPage(
      page.pageNumber,
      pageCount,
      candidates,
      pattern,
    );

    if (!found) {
      failedPages.push(page.pageNumber);
      failedPageInfos.push({
        result: {
          id: `page-numbering-page-${page.pageNumber}`,
          title: `Страница ${page.pageNumber}`,
          status: "fail",
          message:
            "Номер страницы не найден в нижней части листа (центр или правый угол).",
          children: [],
          overlayBoxes: [expectedZone],
          jumpPageNumbers: [page.pageNumber],
          childrenCollapsedByDefault: false,
          countInSummary: false,
        },
        offset: null,
        pageNumber: page.pageNumber,
      });
      continue;
    }

    if (found.valueNumber === page.pageNumber) {
      const candidateBox = overlayBox(
        page.pageNumber,
        pageBox,
        found.bounds,
        styleForNumberValue("pass"),
      );
      overlayBoxes.push(candidateBox);
      continue;
    }

    const candidateBox = overlayBox(
      page.pageNumber,
      pageBox,
      found.bounds,
      styleForNumberValue("fail"),
    );
    overlayBoxes.push(candidateBox);
    failedPages.push(page.pageNumber);
    failedPageInfos.push({
      result: {
        id: `page-numbering-page-${page.pageNumber}`,
        title: `Страница ${page.pageNumber}`,
        status: "fail",
        message: `Неверный номер страницы: найдено «${found.valueText}», ожидалось «${page.pageNumber}» (${found.placement} внизу страницы).`,
        children: [],
        overlayBoxes: [expectedZone, candidateBox],
        jumpPageNumbers: [page.pageNumber],
        childrenCollapsedByDefault: false,
        countInSummary: false,
      },
      offset: found.valueNumber - page.pageNumber,
      pageNumber: page.pageNumber,
    });
  }

  const failedChildren = collapseShiftedRuns(failedPageInfos);

  const status =
    failedChildren.length > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  const message =
    failedChildren.length === 0
      ? warnCount === 0
        ? "Нумерация страниц соответствует требованиям: титульный лист без номера, далее сквозная арабская нумерация внизу листа (центр/право)."
        : `Нумерация проверена с предупреждениями: ${warnCount} страниц(ы) не удалось оценить полностью.`
      : `Нарушения нумерации обнаружены на страницах: ${failedPages.join(", ")}.`;

  return {
    id: "page-numbering",
    title: "Нумерация страниц",
    status,
    message,
    children: failedChildren,
    overlayBoxes,
    jumpPageNumbers: pages.map((page) => page.pageNumber),
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function deriveNumberingPattern(
  pages: { pageNumber: number; pageBox: PdfRect | null }[],
  pageCandidates: PageNumberCandidate[][],
  pnConfig: PageNumberingConfig,
): NumberingPattern | undefined {
  const confirmed: PageNumberCandidate[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page.pageNumber <= 1 || !page.pageBox) {
      continue;
    }

    const candidates = pageCandidates[index]
      .filter((candidate) => candidate.valueNumber === page.pageNumber)
      .sort(
        (left, right) => positionConfidence(right) - positionConfidence(left),
      );

    if (candidates[0]) {
      confirmed.push(candidates[0]);
    }
  }

  if (confirmed.length === 0) {
    return undefined;
  }

  const centerCount = confirmed.filter(
    (candidate) => candidate.placement === "в центре",
  ).length;
  const rightCount = confirmed.filter(
    (candidate) => candidate.placement === "справа",
  ).length;

  let preferredPlacement: NumberingPattern["preferredPlacement"];
  if (centerCount === 0 && rightCount === 0) {
    preferredPlacement = undefined;
  } else if (centerCount === 0) {
    preferredPlacement = "справа";
  } else if (rightCount === 0) {
    preferredPlacement = "в центре";
  } else if (centerCount >= rightCount + 2) {
    preferredPlacement = "в центре";
  } else if (rightCount >= centerCount + 2) {
    preferredPlacement = "справа";
  }

  const bottomDistanceBand =
    confirmed.length >= 2
      ? ([
          Math.max(
            Math.min(
              ...confirmed.map((candidate) => candidate.bottomDistancePt),
            ) - pnConfig.patternBandPaddingPt,
            0,
          ),
          Math.max(
            ...confirmed.map((candidate) => candidate.bottomDistancePt),
          ) + pnConfig.patternBandPaddingPt,
        ] as [number, number])
      : undefined;

  return {
    preferredPlacement,
    bottomDistanceBand,
  };
}

function selectFirstPageCandidate(
  candidates: PageNumberCandidate[],
  pageCount: number,
  pattern: NumberingPattern | undefined,
): PageNumberCandidate | undefined {
  const filtered = candidates.filter((candidate) =>
    isFirstPageNumberLike(candidate, pageCount, pattern),
  );

  filtered.sort(
    (left, right) =>
      scoreFirstPageCandidate(right, pattern) -
      scoreFirstPageCandidate(left, pattern),
  );

  return filtered[0];
}

function isFirstPageNumberLike(
  candidate: PageNumberCandidate,
  pageCount: number,
  pattern: NumberingPattern | undefined,
): boolean {
  if (!isInDocumentRange(candidate.valueNumber, pageCount)) {
    return false;
  }

  if (!pattern) {
    return candidate.valueNumber === 1;
  }

  return matchesPatternPosition(candidate, pattern);
}

function scoreFirstPageCandidate(
  candidate: PageNumberCandidate,
  pattern: NumberingPattern | undefined,
): number {
  let score = 0;

  if (candidate.valueNumber === 1) {
    score += 100;
  }

  score += positionConfidence(candidate);
  score += patternPositionScore(candidate, pattern) * 20;

  return score;
}

function selectCandidateForExpectedPage(
  expectedPage: number,
  pageCount: number,
  candidates: PageNumberCandidate[],
  pattern: NumberingPattern | undefined,
): PageNumberCandidate | undefined {
  const ranked = candidates
    .slice()
    .sort(
      (left, right) =>
        scoreCandidateForExpectedPage(right, expectedPage, pageCount, pattern) -
        scoreCandidateForExpectedPage(left, expectedPage, pageCount, pattern),
    );

  return ranked[0];
}

function scoreCandidateForExpectedPage(
  candidate: PageNumberCandidate,
  expectedPage: number,
  pageCount: number,
  pattern: NumberingPattern | undefined,
): number {
  let score = 0;

  if (candidate.valueNumber === expectedPage) {
    score += 1000;
  }

  const distance = Math.abs(candidate.valueNumber - expectedPage);
  score -= distance * 5;

  if (isInDocumentRange(candidate.valueNumber, pageCount)) {
    score += 25;
  }

  score += positionConfidence(candidate);
  score += patternPositionScore(candidate, pattern) * 20;

  return score;
}

function isInDocumentRange(value: number, pageCount: number): boolean {
  return value >= 1 && value <= pageCount;
}

function matchesPatternPosition(
  candidate: PageNumberCandidate,
  pattern: NumberingPattern,
): boolean {
  if (
    pattern.preferredPlacement &&
    candidate.placement !== pattern.preferredPlacement
  ) {
    return false;
  }

  if (pattern.bottomDistanceBand) {
    const [min, max] = pattern.bottomDistanceBand;
    if (candidate.bottomDistancePt < min || candidate.bottomDistancePt > max) {
      return false;
    }
  }

  return true;
}

function patternPositionScore(
  candidate: PageNumberCandidate,
  pattern: NumberingPattern | undefined,
): number {
  if (!pattern) {
    return 0;
  }

  let score = 0;

  if (pattern.preferredPlacement) {
    score += candidate.placement === pattern.preferredPlacement ? 1 : -1;
  }

  if (pattern.bottomDistanceBand) {
    const [min, max] = pattern.bottomDistanceBand;
    if (candidate.bottomDistancePt < min) {
      score -= (min - candidate.bottomDistancePt) / 8;
    } else if (candidate.bottomDistancePt > max) {
      score -= (candidate.bottomDistancePt - max) / 8;
    } else {
      score += 1;
    }
  }

  return score;
}

function positionConfidence(candidate: PageNumberCandidate): number {
  return (
    -candidate.bottomDistancePt * 0.01 - placementPenalty(candidate.placement)
  );
}

function collectPageNumberCandidates(
  pageBox: PdfRect,
  runs: { text: string; bounds: PdfRect }[],
  pnConfig: PageNumberingConfig,
): PageNumberCandidate[] {
  if (runs.length === 0) {
    return [];
  }

  const pageHeight = Math.max(pageBox.top - pageBox.bottom, 1);
  const bottomZoneTop = pageBox.bottom + pageHeight * 0.2;

  const digitRuns: DigitRun[] = runs
    .map((run) => ({
      text: run.text,
      bounds: run.bounds,
      compact: run.text
        .split("")
        .filter((character) => !/\s/.test(character))
        .join(""),
    }))
    .filter((run) => run.compact.length > 0)
    .filter((run) => /^\d+$/.test(run.compact))
    .filter((run) => run.bounds.top <= bottomZoneTop)
    .map((run) => ({
      text: run.compact,
      bounds: run.bounds,
      centerY: (run.bounds.bottom + run.bounds.top) / 2,
    }));

  if (digitRuns.length === 0) {
    return [];
  }

  digitRuns.sort((left, right) => left.centerY - right.centerY);

  const lineGroups: DigitRun[][] = [];

  for (const run of digitRuns) {
    if (lineGroups.length === 0) {
      lineGroups.push([run]);
      continue;
    }

    const lastGroup = lineGroups[lineGroups.length - 1];
    const baseline = lastGroup[0].centerY;

    if (Math.abs(run.centerY - baseline) <= pnConfig.baselineGroupTolerancePt) {
      lastGroup.push(run);
    } else {
      lineGroups.push([run]);
    }
  }

  const candidates: PageNumberCandidate[] = [];

  for (const group of lineGroups) {
    group.sort((left, right) => left.bounds.left - right.bounds.left);

    let tokenText = "";
    let tokenBounds: PdfRect | undefined;

    for (const run of group) {
      const shouldMerge = tokenBounds
        ? run.bounds.left - tokenBounds.right <= pnConfig.mergeDigitGapPt
        : true;

      if (shouldMerge) {
        tokenText += run.text;
        tokenBounds = tokenBounds
          ? mergeBounds(tokenBounds, run.bounds)
          : run.bounds;
      } else {
        pushNumberCandidate(candidates, pageBox, tokenText, tokenBounds);
        tokenText = run.text;
        tokenBounds = run.bounds;
      }
    }

    pushNumberCandidate(candidates, pageBox, tokenText, tokenBounds);
  }

  return candidates;
}

function pushNumberCandidate(
  candidates: PageNumberCandidate[],
  pageBox: PdfRect,
  tokenText: string,
  tokenBounds: PdfRect | undefined,
): void {
  if (!tokenBounds || tokenText.length === 0 || !/^\d+$/.test(tokenText)) {
    return;
  }

  const valueNumber = Number.parseInt(tokenText, 10);
  if (!Number.isFinite(valueNumber)) {
    return;
  }

  const pageWidth = Math.max(pageBox.right - pageBox.left, 1);
  const centerX = (tokenBounds.left + tokenBounds.right) / 2;
  const normalizedX = (centerX - pageBox.left) / pageWidth;

  const placement =
    Math.abs(normalizedX - 0.5) <= 0.18
      ? "в центре"
      : normalizedX >= 0.72
        ? "справа"
        : undefined;

  if (!placement) {
    return;
  }

  const bottomDistancePt = Math.max(tokenBounds.bottom - pageBox.bottom, 0);

  candidates.push({
    valueText: tokenText,
    valueNumber,
    placement,
    bottomDistancePt,
    bounds: tokenBounds,
  });
}

function mergeBounds(left: PdfRect, right: PdfRect): PdfRect {
  return {
    left: Math.min(left.left, right.left),
    right: Math.max(left.right, right.right),
    bottom: Math.min(left.bottom, right.bottom),
    top: Math.max(left.top, right.top),
  };
}

function placementPenalty(placement: "в центре" | "справа"): number {
  return placement === "в центре" ? 0 : 1;
}

function bottomZoneRect(pageBox: PdfRect): PdfRect {
  const pageHeight = Math.max(pageBox.top - pageBox.bottom, 1);

  return {
    left: pageBox.left,
    right: pageBox.right,
    bottom: pageBox.bottom,
    top: pageBox.bottom + pageHeight * 0.2,
  };
}

function styleForNumberZone(status: "pass" | "fail"): OverlayStyle {
  if (status === "fail") {
    return {
      borderColor: "#dc2626",
      fillColor: "rgba(239, 68, 68, 0.06)",
      borderWidth: 1,
      dashed: true,
    };
  }

  return {
    borderColor: "#0ea5e9",
    fillColor: "rgba(14, 165, 233, 0.04)",
    borderWidth: 1,
    dashed: true,
  };
}

function styleForNumberValue(status: "pass" | "fail"): OverlayStyle {
  if (status === "fail") {
    return {
      borderColor: "#dc2626",
      fillColor: "rgba(239, 68, 68, 0.12)",
      borderWidth: 2,
      dashed: false,
    };
  }

  return {
    borderColor: "#059669",
    fillColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 2,
    dashed: false,
  };
}

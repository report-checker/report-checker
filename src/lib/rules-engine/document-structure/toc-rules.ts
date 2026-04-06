import { overlayBox } from "../overlays";
import type { OverlayBox, RuleResult, RuleStatus } from "../types";
import { normalizeForMatching, normalizeText } from "./collect-lines";
import { splitTocEntriesByAppendix } from "./detect-structure-toc";
import {
  centerLineOverlay,
  styleForHeading,
  styleForStructuralElement,
} from "./styles";
import type { DetectedStructure, TextLineWithText } from "./types";

export function buildTocPresenceRule(structure: DetectedStructure): RuleResult {
  const found = structure.tocPageNumber !== null;
  const formatIssues = structure.tocHeadingIssues;
  const wrongTitle = found && structure.tocHeadingName !== "СОДЕРЖАНИЕ";
  const hasFormatIssues = found && formatIssues.length > 0;
  const status: RuleStatus =
    found && !wrongTitle && !hasFormatIssues ? "pass" : "fail";

  const overlayBoxes: OverlayBox[] = [];
  const jumpPageNumbers: number[] = [];

  if (found && structure.tocPageNumber !== null) {
    jumpPageNumbers.push(
      ...(structure.tocPageNumbers.length > 0
        ? structure.tocPageNumbers
        : [structure.tocPageNumber]),
    );
    if (structure.tocHeadingBounds && structure.tocHeadingPageBox) {
      overlayBoxes.push(
        overlayBox(
          structure.tocPageNumber,
          structure.tocHeadingPageBox,
          structure.tocHeadingBounds,
          styleForStructuralElement(status),
        ),
      );
      overlayBoxes.push(
        centerLineOverlay(
          structure.tocPageNumber,
          structure.tocHeadingPageBox,
          status,
          structure.tocHeadingMarginBounds,
        ),
      );
    }
  }

  const message = !found
    ? "Раздел «СОДЕРЖАНИЕ» не обнаружен в документе."
    : wrongTitle
      ? `Используется «${structure.tocHeadingName}» вместо «СОДЕРЖАНИЕ» (стр. ${structure.tocPageNumber}).`
      : hasFormatIssues
        ? `Раздел «СОДЕРЖАНИЕ» найден на странице ${structure.tocPageNumber}, но есть нарушения оформления: ${formatIssues.join(" ")}`
        : `Раздел «СОДЕРЖАНИЕ» найден на странице ${structure.tocPageNumber}.`;

  return {
    id: "toc-presence",
    title: "Наличие «СОДЕРЖАНИЕ»",
    status,
    message,
    children: [],
    overlayBoxes,
    jumpPageNumbers,
    childrenCollapsedByDefault: false,
    countInSummary: true,
  };
}

export function buildTocBodyMatchRule(
  structure: DetectedStructure,
): RuleResult {
  if (structure.tocPageNumber === null) {
    return {
      id: "toc-body-match",
      title: "Соответствие содержания заголовкам",
      status: "warn",
      message:
        "«СОДЕРЖАНИЕ» не найдено — сверка с заголовками в тексте невозможна.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const { mainEntries, appendixEntries } = splitTocEntriesByAppendix(
    structure.tocEntries,
  );

  if (mainEntries.length === 0) {
    return {
      id: "toc-body-match",
      title: "Соответствие содержания заголовкам",
      status: "warn",
      message:
        structure.tocEntries.length === 0
          ? "Не удалось разобрать записи из «СОДЕРЖАНИЯ». Проверьте формат: последнее слово заголовка должно соединяться отточием с номером страницы."
          : "В «СОДЕРЖАНИИ» найдены только записи раздела приложений. Проверка выполняется только для основной части до «ПРИЛОЖЕНИЕ».",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers:
        structure.tocPageNumbers.length > 0
          ? structure.tocPageNumbers
          : [structure.tocPageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const bodyCandidates = collectBodyHeadingCandidates(structure.allBodyLines);
  const bodyCandidateByNorm = new Map<string, BodyHeadingCandidate>();
  const bodyCandidateByNormNoNumber = new Map<string, BodyHeadingCandidate>();
  for (const candidate of bodyCandidates) {
    if (!bodyCandidateByNorm.has(candidate.norm)) {
      bodyCandidateByNorm.set(candidate.norm, candidate);
    }
    if (
      candidate.normNoNumber.length >= 4 &&
      !bodyCandidateByNormNoNumber.has(candidate.normNoNumber)
    ) {
      bodyCandidateByNormNoNumber.set(candidate.normNoNumber, candidate);
    }
  }

  const children: RuleResult[] = mainEntries.map((entry) => {
    const norm = normalizeForMatching(entry.title);
    const normNoNumber = normalizeHeadingWithoutNumber(entry.title);
    const canonicalNorm = normalizeCanonicalHeading(entry.title);
    const tokens = headingTokens(entry.title);
    const bodyCandidate = findMatchingBodyCandidate(
      norm,
      normNoNumber,
      canonicalNorm,
      tokens,
      entry.pageRef,
      bodyCandidates,
      bodyCandidateByNorm,
      bodyCandidateByNormNoNumber,
    );
    const matched = bodyCandidate !== undefined;
    const entryStatus: RuleStatus = matched ? "pass" : "fail";

    const overlayBoxes: OverlayBox[] = [];
    const jumpPageNumbers: number[] = [];

    if (matched && bodyCandidate.pageBox) {
      overlayBoxes.push(
        overlayBox(
          bodyCandidate.pageNumber,
          bodyCandidate.pageBox,
          bodyCandidate.bounds,
          styleForHeading("pass"),
        ),
      );
      jumpPageNumbers.push(bodyCandidate.pageNumber);
    } else if (!matched && entry.pageBox) {
      overlayBoxes.push(
        overlayBox(
          entry.pageNumber,
          entry.pageBox,
          entry.bounds,
          styleForHeading("fail"),
        ),
      );
      jumpPageNumbers.push(entry.pageNumber);
    }

    return {
      id: `toc-entry-${norm.slice(0, 40)}`,
      title: `«${entry.title}»`,
      status: entryStatus,
      message: matched
        ? `Найден в тексте документа (стр. ${bodyCandidate.pageNumber}).`
        : `Заголовок из содержания не найден в тексте документа (стр. ${entry.pageRef} по содержанию).`,
      children: [],
      overlayBoxes,
      jumpPageNumbers,
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const unmatchedCount = children.filter((c) => c.status === "fail").length;
  const status: RuleStatus = unmatchedCount === 0 ? "pass" : "fail";
  const jumpPageNumbers =
    unmatchedCount > 0
      ? [
          ...new Set(
            children
              .filter((c) => c.status === "fail")
              .flatMap((c) => c.jumpPageNumbers),
          ),
        ]
      : structure.tocPageNumbers.length > 0
        ? structure.tocPageNumbers
        : [structure.tocPageNumber];

  return {
    id: "toc-body-match",
    title: "Соответствие содержания заголовкам",
    status,
    message:
      unmatchedCount === 0
        ? appendixEntries.length > 0
          ? `Все ${mainEntries.length} записей основной части содержания найдены в тексте документа. Записи после «ПРИЛОЖЕНИЕ» не учитываются.`
          : `Все ${mainEntries.length} записей содержания найдены в тексте документа.`
        : appendixEntries.length > 0
          ? `${unmatchedCount} из ${mainEntries.length} записей основной части содержания не найдены в тексте документа (записи после «ПРИЛОЖЕНИЕ» не учитываются).`
          : `${unmatchedCount} из ${mainEntries.length} записей содержания не найдены в тексте документа.`,
    children,
    overlayBoxes: [],
    jumpPageNumbers,
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

type BodyHeadingCandidate = {
  pageNumber: number;
  pageBox: TextLineWithText["pageBox"];
  bounds: TextLineWithText["bounds"];
  norm: string;
  normNoNumber: string;
  canonicalNorm: string;
  tokens: string[];
};

function collectBodyHeadingCandidates(
  lines: TextLineWithText[],
): BodyHeadingCandidate[] {
  const candidates: BodyHeadingCandidate[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    addCandidate(
      candidates,
      line.text,
      line.pageNumber,
      line.pageBox,
      line.bounds,
    );

    const next = lines[index + 1];
    if (!next || next.pageNumber !== line.pageNumber) {
      continue;
    }

    const gap = line.centerY - next.centerY;
    if (gap <= 0 || gap > 90) {
      continue;
    }

    addCandidate(
      candidates,
      `${line.text} ${next.text}`,
      line.pageNumber,
      line.pageBox,
      unionBounds(line.bounds, next.bounds),
    );
  }

  return candidates;
}

function addCandidate(
  candidates: BodyHeadingCandidate[],
  text: string,
  pageNumber: number,
  pageBox: TextLineWithText["pageBox"],
  bounds: TextLineWithText["bounds"],
): void {
  const norm = normalizeForMatching(text);
  if (norm.length === 0) {
    return;
  }

  candidates.push({
    pageNumber,
    pageBox,
    bounds,
    norm,
    normNoNumber: normalizeHeadingWithoutNumber(text),
    canonicalNorm: normalizeCanonicalHeading(text),
    tokens: headingTokens(text),
  });
}

function normalizeHeadingWithoutNumber(text: string): string {
  return normalizeForMatching(text.replace(/^\s*\d+(?:\.\d+)*\.?\s+/, ""));
}

function findMatchingBodyCandidate(
  norm: string,
  normNoNumber: string,
  canonicalNorm: string,
  tokens: string[],
  pageRef: number,
  bodyCandidates: BodyHeadingCandidate[],
  bodyCandidateByNorm: Map<string, BodyHeadingCandidate>,
  bodyCandidateByNormNoNumber: Map<string, BodyHeadingCandidate>,
): BodyHeadingCandidate | undefined {
  const exact = bodyCandidateByNorm.get(norm);
  if (exact) {
    return exact;
  }

  if (normNoNumber.length >= 4) {
    const noNumber = bodyCandidateByNormNoNumber.get(normNoNumber);
    if (noNumber) {
      return noNumber;
    }
  }

  if (tokens.length === 0 || pageRef < 1) {
    return undefined;
  }

  let best: BodyHeadingCandidate | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of bodyCandidates) {
    const pageDistance = Math.abs(candidate.pageNumber - pageRef);
    if (pageDistance > 2) {
      continue;
    }

    const score = scoreCandidate(
      norm,
      normNoNumber,
      canonicalNorm,
      tokens,
      candidate,
      pageDistance,
    );
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= 0.9 ? best : undefined;
}

function normalizeCanonicalHeading(text: string): string {
  return normalizeForMatching(
    text
      .replace(/^\s*\d+(?:[.\s]+\d+)*\.?\s+/u, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function headingTokens(text: string): string[] {
  const canonical = text
    .replace(/^\s*\d+(?:[.\s]+\d+)*\.?\s+/u, "")
    .toUpperCase();
  const rawTokens = canonical.match(/[А-ЯЁA-Z0-9]+/gu) ?? [];
  return rawTokens.filter((token) => token.length >= 2);
}

function scoreCandidate(
  norm: string,
  normNoNumber: string,
  canonicalNorm: string,
  tokens: string[],
  candidate: BodyHeadingCandidate,
  pageDistance: number,
): number {
  if (candidate.norm === norm) {
    return 3;
  }

  if (normNoNumber.length >= 4 && candidate.normNoNumber === normNoNumber) {
    return 2.7;
  }

  if (
    canonicalNorm.length >= 4 &&
    candidate.canonicalNorm.length >= 4 &&
    canonicalNorm === candidate.canonicalNorm
  ) {
    return 2.4;
  }

  const tokenScore = tokenF1Score(tokens, candidate.tokens);
  if (tokenScore < 0.9) {
    return Number.NEGATIVE_INFINITY;
  }
  if (sharedTokenCount(tokens, candidate.tokens) < 2) {
    return Number.NEGATIVE_INFINITY;
  }

  return tokenScore - pageDistance * 0.05;
}

function tokenF1Score(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  if (intersection === 0) {
    return 0;
  }

  return (2 * intersection) / (leftSet.size + rightSet.size);
}

function sharedTokenCount(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  let count = 0;
  for (const token of new Set(left)) {
    if (rightSet.has(token)) {
      count += 1;
    }
  }
  return count;
}

export function buildNoMainPartHeadingRule(
  structure: DetectedStructure,
): RuleResult {
  if (structure.tocPageNumber === null) {
    return {
      id: "no-main-part-heading",
      title: "Заголовок «Основная часть» не используется",
      status: "warn",
      message:
        "«СОДЕРЖАНИЕ» не найдено — проверка невозможна.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const MAIN_PART_NORM = normalizeForMatching("ОСНОВНАЯ ЧАСТЬ");
  const violations = structure.tocEntries.filter(
    (entry) => normalizeForMatching(entry.title) === MAIN_PART_NORM,
  );

  if (violations.length === 0) {
    return {
      id: "no-main-part-heading",
      title: "Заголовок «Основная часть» не используется",
      status: "pass",
      message: "Заголовок «Основная часть» не обнаружен в содержании.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const overlayBoxes: OverlayBox[] = violations
    .filter((entry) => entry.pageBox !== null)
    .map((entry) =>
      overlayBox(
        entry.pageNumber,
        // biome-ignore lint/style/noNonNullAssertion: filtered above
        entry.pageBox!,
        entry.bounds,
        styleForHeading("fail"),
      ),
    );

  const jumpPageNumbers = [...new Set(violations.map((e) => e.pageNumber))];

  return {
    id: "no-main-part-heading",
    title: "Заголовок «Основная часть» не используется",
    status: "fail",
    message: `Заголовок «Основная часть» запрещён — обнаружен в содержании на стр. ${violations[0].pageRef}.`,
    children: [],
    overlayBoxes,
    jumpPageNumbers,
    childrenCollapsedByDefault: false,
    countInSummary: true,
  };
}

function unionBounds(
  left: TextLineWithText["bounds"],
  right: TextLineWithText["bounds"],
): TextLineWithText["bounds"] {
  return {
    left: Math.min(left.left, right.left),
    right: Math.max(left.right, right.right),
    bottom: Math.min(left.bottom, right.bottom),
    top: Math.max(left.top, right.top),
  };
}

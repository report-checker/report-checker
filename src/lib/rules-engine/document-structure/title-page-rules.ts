import type { CheckerConfig, TitlePageConfig } from "../../checker-config";
import { overlayBox } from "../overlays";
import { aggregateStatus } from "../status";
import type { OverlayBox, PdfRect, RuleResult, RuleStatus } from "../types";
import { styleForHeading } from "./styles";
import type { DetectedStructure, TextLineWithText } from "./types";

type TitlePageCandidate = {
  text: string;
  bounds: PdfRect;
  pageNumber: number;
  pageBox: PdfRect | null;
};

type AllowedValueMatch = {
  value: string;
  candidate: TitlePageCandidate;
};

type RegexMatch = {
  pattern: string;
  candidate: TitlePageCandidate;
};

function normalizeDigits(value: string): string {
  return value.replace(/[^0-9]+/g, "");
}

function buildSpacedDigitsPattern(digits: string): string {
  return digits.split("").join("\\s*");
}

function looksLikeDateWithYear(text: string, yearDigits: string): boolean {
  const source = text.replace(/\s+/g, " ").trim();
  if (!source) return false;

  const yearPattern = buildSpacedDigitsPattern(yearDigits);
  const yearRegex = new RegExp(`(?<!\\d)${yearPattern}(?!\\d)`, "u");
  if (!yearRegex.test(source)) return false;

  const normalizedSource = source.toLowerCase().replace(/[ё]/g, "е");
  const dayPattern = "(?:0?[1-9]|[12][0-9]|3[01])";
  const monthNumberPattern = "(?:0?[1-9]|1[0-2])";
  const dateLabelRegex = /(^|[^\p{L}\p{N}])дата([^\p{L}\p{N}]|$)/u;
  const monthWordRegex =
    /(^|[^\p{L}])(январ[ьяе]?|феврал[ьяе]?|март[ае]?|апрел[ьяе]?|ма[йяе]|июн[ьяе]?|июл[ьяе]?|август[ае]?|сентябр[ьяе]?|октябр[ьяе]?|ноябр[ьяе]?|декабр[ьяе]?)([^\p{L}]|$)/u;

  const datePatterns = [
    new RegExp(
      `(?<!\\d)${dayPattern}\\s*[./-]\\s*${monthNumberPattern}\\s*[./-]\\s*${yearPattern}(?!\\d)`,
      "u",
    ),
    new RegExp(
      `(?<!\\d)${yearPattern}\\s*[./-]\\s*${monthNumberPattern}\\s*[./-]\\s*${dayPattern}(?!\\d)`,
      "u",
    ),
    new RegExp(
      `(?<!\\d)${dayPattern}\\s+${monthNumberPattern}\\s+${yearPattern}(?!\\d)`,
      "u",
    ),
    new RegExp(
      `(?<!\\d)${yearPattern}\\s+${monthNumberPattern}\\s+${dayPattern}(?!\\d)`,
      "u",
    ),
  ];

  if (datePatterns.some((pattern) => pattern.test(source))) return true;
  if (dateLabelRegex.test(normalizedSource)) return true;
  if (monthWordRegex.test(normalizedSource)) {
    return true;
  }

  return false;
}

function resolveTitlePageConfig(config: CheckerConfig): TitlePageConfig {
  const fallback: TitlePageConfig = {
    allowedEducationalPrograms: [],
    allowedPracticeNames: [],
    practiceNameRegexes: [],
    allowedYears: [],
    studentGroupRegexes: [],
    studentNamePattern: "",
  };
  if (!config || typeof config !== "object") return fallback;
  const raw = (config as { titlePage?: Partial<TitlePageConfig> }).titlePage;
  if (!raw || typeof raw !== "object") return fallback;

  return {
    allowedEducationalPrograms: Array.isArray(raw.allowedEducationalPrograms)
      ? raw.allowedEducationalPrograms
      : fallback.allowedEducationalPrograms,
    allowedPracticeNames: Array.isArray(raw.allowedPracticeNames)
      ? raw.allowedPracticeNames
      : fallback.allowedPracticeNames,
    practiceNameRegexes: Array.isArray(raw.practiceNameRegexes)
      ? raw.practiceNameRegexes
      : fallback.practiceNameRegexes,
    allowedYears: Array.isArray(raw.allowedYears)
      ? raw.allowedYears
      : fallback.allowedYears,
    studentGroupRegexes: Array.isArray(raw.studentGroupRegexes)
      ? raw.studentGroupRegexes
      : fallback.studentGroupRegexes,
    studentNamePattern:
      typeof raw.studentNamePattern === "string"
        ? raw.studentNamePattern
        : fallback.studentNamePattern,
  };
}

function normalizeLooseText(value: string): string {
  return value
    .replace(/[ёЁ]/g, "е")
    .toUpperCase()
    .replace(/[‐‑–—−]/g, "-")
    .replace(/[^A-ZА-Я0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompactText(value: string): string {
  return normalizeLooseText(value).replace(/[^A-ZА-Я0-9]+/g, "");
}

function mergeBounds(first: PdfRect, second: PdfRect): PdfRect {
  return {
    left: Math.min(first.left, second.left),
    right: Math.max(first.right, second.right),
    bottom: Math.min(first.bottom, second.bottom),
    top: Math.max(first.top, second.top),
  };
}

function buildTitlePageCandidates(
  lines: TextLineWithText[],
): TitlePageCandidate[] {
  const candidates: TitlePageCandidate[] = lines.map((line) => ({
    text: line.text,
    bounds: line.bounds,
    pageNumber: line.pageNumber,
    pageBox: line.pageBox,
  }));

  for (let i = 0; i < lines.length - 1; i += 1) {
    const first = lines[i];
    const second = lines[i + 1];
    candidates.push({
      text: `${first.text} ${second.text}`.replace(/\s+/g, " ").trim(),
      bounds: mergeBounds(first.bounds, second.bounds),
      pageNumber: first.pageNumber,
      pageBox: first.pageBox,
    });
  }

  return candidates;
}

function findAllowedValueMatch(
  allowedValues: string[],
  candidates: TitlePageCandidate[],
): AllowedValueMatch | null {
  const preparedAllowed = allowedValues
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  for (const value of preparedAllowed) {
    const looseAllowed = normalizeLooseText(value);
    const compactAllowed = normalizeCompactText(value);
    if (!looseAllowed || !compactAllowed) continue;

    for (const candidate of candidates) {
      const looseCandidate = normalizeLooseText(candidate.text);
      const compactCandidate = normalizeCompactText(candidate.text);
      if (
        looseCandidate.includes(looseAllowed) ||
        compactCandidate.includes(compactAllowed)
      ) {
        return { value, candidate };
      }
    }
  }

  return null;
}

function buildAllowedValuesRule(
  id: string,
  title: string,
  emptyConfigMessage: string,
  allowedValues: string[],
  candidates: TitlePageCandidate[],
): RuleResult {
  const preparedAllowed = allowedValues
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (preparedAllowed.length === 0) {
    return {
      id,
      title,
      status: "fail",
      message: emptyConfigMessage,
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const matched = findAllowedValueMatch(preparedAllowed, candidates);
  const status: RuleStatus = matched ? "pass" : "fail";
  const overlayBoxes: OverlayBox[] = matched?.candidate.pageBox
    ? [
        overlayBox(
          matched.candidate.pageNumber,
          matched.candidate.pageBox,
          matched.candidate.bounds,
          styleForHeading(status),
        ),
      ]
    : [];
  const jumpPageNumbers = matched?.candidate.pageNumber
    ? [matched.candidate.pageNumber]
    : [];

  return {
    id,
    title,
    status,
    message: matched
      ? `Найдено совпадение: «${matched.value}».`
      : `Не найдено ни одного допустимого значения: ${preparedAllowed
          .map((value) => `«${value}»`)
          .join(", ")}.`,
    children: [],
    overlayBoxes,
    jumpPageNumbers,
    childrenCollapsedByDefault: false,
    countInSummary: true,
  };
}

function findYearValueMatch(
  allowedYears: string[],
  candidates: TitlePageCandidate[],
): AllowedValueMatch | null {
  const preparedAllowed = allowedYears
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  for (const value of preparedAllowed) {
    const allowedDigits = normalizeDigits(value);
    if (!allowedDigits) continue;

    for (const candidate of candidates) {
      const candidateDigits = normalizeDigits(candidate.text);
      if (candidateDigits !== allowedDigits) continue;
      if (looksLikeDateWithYear(candidate.text, allowedDigits)) continue;
      return { value, candidate };
    }
  }

  return null;
}

function buildYearRule(
  id: string,
  title: string,
  emptyConfigMessage: string,
  allowedYears: string[],
  candidates: TitlePageCandidate[],
): RuleResult {
  const preparedAllowed = allowedYears
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (preparedAllowed.length === 0) {
    return {
      id,
      title,
      status: "fail",
      message: emptyConfigMessage,
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const matched = findYearValueMatch(preparedAllowed, candidates);
  const status: RuleStatus = matched ? "pass" : "fail";
  const overlayBoxes: OverlayBox[] = matched?.candidate.pageBox
    ? [
        overlayBox(
          matched.candidate.pageNumber,
          matched.candidate.pageBox,
          matched.candidate.bounds,
          styleForHeading(status),
        ),
      ]
    : [];
  const jumpPageNumbers = matched?.candidate.pageNumber
    ? [matched.candidate.pageNumber]
    : [];

  return {
    id,
    title,
    status,
    message: matched
      ? `Найдено совпадение: «${matched.value}».`
      : `Не найдено ни одного допустимого значения: ${preparedAllowed
          .map((value) => `«${value}»`)
          .join(", ")}.`,
    children: [],
    overlayBoxes,
    jumpPageNumbers,
    childrenCollapsedByDefault: false,
    countInSummary: true,
  };
}

function findRegexMatch(
  patterns: string[],
  candidates: TitlePageCandidate[],
): RegexMatch | null {
  for (const pattern of patterns) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "iu");
    } catch {
      continue;
    }
    for (const candidate of candidates) {
      if (regex.test(candidate.text)) {
        return {
          pattern,
          candidate,
        };
      }
    }
  }
  return null;
}

function buildRegexValuesRule(
  id: string,
  title: string,
  emptyConfigMessage: string,
  invalidConfigMessage: string,
  patterns: string[],
  candidates: TitlePageCandidate[],
): RuleResult {
  const prepared = patterns
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (prepared.length === 0) {
    return {
      id,
      title,
      status: "fail",
      message: emptyConfigMessage,
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const validPatterns = prepared.filter((pattern) => {
    try {
      new RegExp(pattern, "iu");
      return true;
    } catch {
      return false;
    }
  });

  if (validPatterns.length === 0) {
    return {
      id,
      title,
      status: "fail",
      message: invalidConfigMessage,
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const matched = findRegexMatch(validPatterns, candidates);
  const status: RuleStatus = matched ? "pass" : "fail";
  const overlayBoxes: OverlayBox[] = matched?.candidate.pageBox
    ? [
        overlayBox(
          matched.candidate.pageNumber,
          matched.candidate.pageBox,
          matched.candidate.bounds,
          styleForHeading(status),
        ),
      ]
    : [];
  const jumpPageNumbers = matched?.candidate.pageNumber
    ? [matched.candidate.pageNumber]
    : [];

  return {
    id,
    title,
    status,
    message: matched
      ? `Найдено совпадение по regex \`${matched.pattern}\`.`
      : `Не найдено ни одного совпадения по regex: ${validPatterns
          .map((value) => `\`${value}\``)
          .join(", ")}.`,
    children: [],
    overlayBoxes,
    jumpPageNumbers,
    childrenCollapsedByDefault: false,
    countInSummary: true,
  };
}

function compileRegexList(patterns: string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (!trimmed) continue;
    try {
      compiled.push(new RegExp(trimmed, "iu"));
    } catch {
      // Ignore invalid user patterns to keep checks running.
    }
  }
  return compiled;
}

function compileOptionalRegex(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (!trimmed) return null;
  try {
    return new RegExp(trimmed, "iu");
  } catch {
    return null;
  }
}

function stripCommonStudentPrefixes(line: string): string {
  return line
    .replace(/\bобучающийся\b\s*:?\s*/iu, "")
    .replace(/\bстудент\b\s*:?\s*/iu, "")
    .trim();
}

export function buildTitlePageNode(
  structure: DetectedStructure,
  config: CheckerConfig,
): RuleResult {
  const titlePageConfig = resolveTitlePageConfig(config);
  const titlePageNumber = structure.titlePageNumber;
  const titlePageLines = structure.titlePageLines;
  const candidates = buildTitlePageCandidates(titlePageLines);
  const children: RuleResult[] = [];

  if (titlePageNumber === null || titlePageLines.length === 0) {
    return {
      id: "title-page",
      title: "Титульный лист",
      status: "fail",
      message:
        "Не удалось извлечь текст с первой страницы. Проверка титульного листа не выполнена.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  }

  const groupRegexes = compileRegexList(titlePageConfig.studentGroupRegexes);
  const studentNameRegex = compileOptionalRegex(
    titlePageConfig.studentNamePattern,
  );

  if (groupRegexes.length === 0) {
    return {
      id: "title-page",
      title: "Титульный лист",
      status: "fail",
      message:
        "Не задано ни одного валидного regex для группы обучающегося (`titlePage.studentGroupRegexes`).",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [titlePageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  }

  let matchedGroupCandidate: TitlePageCandidate | null = null;
  let matchedGroupText: string | null = null;

  outerGroupLoop: for (const candidate of candidates) {
    for (const groupRegex of groupRegexes) {
      const match = candidate.text.match(groupRegex);
      if (match?.[0]) {
        matchedGroupCandidate = candidate;
        matchedGroupText = match[0];
        break outerGroupLoop;
      }
    }
  }

  if (!matchedGroupCandidate || !matchedGroupText) {
    const studentRule: RuleResult = {
      id: "title-page-student",
      title: "Обучающийся",
      status: "fail",
      message:
        "Группа обучающегося не найдена по regex из `titlePage.studentGroupRegexes`. Остальные проверки титульного листа пропущены.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [titlePageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };

    children.push(studentRule);

    return {
      id: "title-page",
      title: "Титульный лист",
      status: aggregateStatus(children),
      message:
        "Проверка остановлена: сначала нужно найти строку обучающегося по номеру группы.",
      children,
      overlayBoxes: [],
      jumpPageNumbers: [titlePageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  }

  const withoutGroup = stripCommonStudentPrefixes(
    matchedGroupCandidate.text
      .replace(matchedGroupText, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const studentNameOk = studentNameRegex
    ? studentNameRegex.test(withoutGroup)
    : false;
  const studentStatus: RuleStatus = studentNameOk ? "pass" : "fail";
  const studentOverlays: OverlayBox[] = matchedGroupCandidate.pageBox
    ? [
        overlayBox(
          matchedGroupCandidate.pageNumber,
          matchedGroupCandidate.pageBox,
          matchedGroupCandidate.bounds,
          styleForHeading(studentStatus),
        ),
      ]
    : [];

  children.push({
    id: "title-page-student",
    title: "Обучающийся",
    status: studentStatus,
    message: !studentNameRegex
      ? "Некорректный regex в `titlePage.studentNamePattern`."
      : studentNameOk
        ? `Группа найдена (${matchedGroupText.trim()}), формат ФИО с инициалами корректен.`
        : `Группа найдена (${matchedGroupText.trim()}), но формат ФИО не соответствует "фамилия и инициалы в именительном падеже" (\`${titlePageConfig.studentNamePattern}\`).`,
    children: [],
    overlayBoxes: studentOverlays,
    jumpPageNumbers: [matchedGroupCandidate.pageNumber],
    childrenCollapsedByDefault: false,
    countInSummary: true,
  });

  children.push(
    buildAllowedValuesRule(
      "title-page-education-program",
      "Образовательная программа",
      "Не задано ни одного допустимого значения в `titlePage.allowedEducationalPrograms`.",
      titlePageConfig.allowedEducationalPrograms,
      candidates,
    ),
  );

  children.push(
    buildRegexValuesRule(
      "title-page-practice-name",
      "Наименование практики",
      "Не задано ни одного regex в `titlePage.practiceNameRegexes`.",
      "Не задано ни одного валидного regex в `titlePage.practiceNameRegexes`.",
      titlePageConfig.practiceNameRegexes,
      candidates,
    ),
  );

  children.push(
    buildYearRule(
      "title-page-year",
      "Год",
      "Не задано ни одного допустимого значения в `titlePage.allowedYears`.",
      titlePageConfig.allowedYears,
      candidates,
    ),
  );

  return {
    id: "title-page",
    title: "Титульный лист",
    status: aggregateStatus(children),
    message:
      "Проверка обязательных полей титульного листа.",
    children,
    overlayBoxes: [],
    jumpPageNumbers: [titlePageNumber],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };
}

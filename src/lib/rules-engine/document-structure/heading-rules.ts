import { overlayBox } from "../overlays";
import { aggregateStatus } from "../status";
import type { OverlayBox, RuleResult, RuleStatus } from "../types";
import {
  centerLineOverlay,
  styleForHeading,
  styleForStructuralElement,
} from "./styles";
import type { DetectedStructure } from "./types";

export function buildStructuralElementsNode(
  structure: DetectedStructure,
): RuleResult {
  const children: RuleResult[] = structure.requiredStructuralElements.map(
    (el) => {
      const { name, id: elementId } = el;
      const found = structure.structuralElements.find((e) => e.name === name);

      if (!found) {
        return {
          id: elementId,
          title: `«${name}»`,
          status: "fail" as RuleStatus,
          message: `Структурный элемент «${name}» не найден в документе.`,
          children: [],
          overlayBoxes: [],
          jumpPageNumbers: [],
          childrenCollapsedByDefault: false,
          countInSummary: true,
        };
      }

      const status: RuleStatus = found.issues.length === 0 ? "pass" : "fail";
      const overlayBoxes: OverlayBox[] = found.pageBox
        ? [
            overlayBox(
              found.pageNumber,
              found.pageBox,
              found.bounds,
              styleForStructuralElement(status),
            ),
            centerLineOverlay(
              found.pageNumber,
              found.pageBox,
              status,
              found.marginBounds,
            ),
          ]
        : [];

      return {
        id: elementId,
        title: `«${name}»`,
        status,
        message:
          found.issues.length === 0
            ? `Структурный элемент «${name}» найден на странице ${found.pageNumber}.`
            : found.issues.join(" "),
        children: [],
        overlayBoxes,
        jumpPageNumbers: [found.pageNumber],
        childrenCollapsedByDefault: false,
        countInSummary: true,
      };
    },
  );

  return {
    id: "structural-elements",
    title: "Заголовки структурных элементов",
    status: aggregateStatus(children),
    message:
      "Проверка наличия и оформления обязательных структурных элементов отчёта.",
    children,
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };
}

export function buildSectionHeadingsFormatRule(
  structure: DetectedStructure,
): RuleResult {
  const { sectionHeadings } = structure;

  if (sectionHeadings.length === 0) {
    return {
      id: "section-headings-format",
      title: "Оформление заголовков разделов",
      status: "fail",
      message:
        "Пронумерованные заголовки разделов не обнаружены. Основная часть должна содержать разделы/подразделы с нумерацией.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const children: RuleResult[] = sectionHeadings.map((heading, index) => {
    const entryStatus: RuleStatus =
      heading.issues.length === 0 ? "pass" : "fail";
    const overlayBoxes: OverlayBox[] = heading.pageBox
      ? [
          overlayBox(
            heading.pageNumber,
            heading.pageBox,
            heading.bounds,
            styleForHeading(entryStatus),
          ),
        ]
      : [];
    const fontSizeText =
      heading.fontSizePt === null
        ? "размер шрифта не определён"
        : `размер шрифта ${heading.fontSizePt.toFixed(1)} пт`;

    return {
      id: `section-heading-${heading.pageNumber}-${index}`,
      title: heading.rawText,
      status: entryStatus,
      message:
        heading.issues.length === 0
          ? `Стр. ${heading.pageNumber}: оформление корректно (${fontSizeText}).`
          : `Стр. ${heading.pageNumber}: ${heading.issues.join(" ")}`,
      children: [],
      overlayBoxes,
      jumpPageNumbers: [heading.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const violations = children.filter((child) => child.status === "fail");
  const status: RuleStatus = aggregateStatus(children);

  const jumpPageNumbers = [
    ...new Set(violations.flatMap((c) => c.jumpPageNumbers)),
  ];
  const overlayBoxes: OverlayBox[] = violations.flatMap((c) => c.overlayBoxes);

  return {
    id: "section-headings-format",
    title: "Оформление заголовков разделов",
    status,
    message:
      violations.length === 0
        ? `Найдено ${sectionHeadings.length} заголовков разделов, нарушений не обнаружено.`
        : `Нарушения оформления в ${violations.length} из ${sectionHeadings.length} заголовков разделов.`,
    children,
    overlayBoxes,
    jumpPageNumbers,
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

export function buildSectionNumberingSequenceRule(
  structure: DetectedStructure,
): RuleResult {
  const sectionHeadings = structure.sectionHeadings;

  if (sectionHeadings.length === 0) {
    return {
      id: "section-numbering-sequence",
      title: "Порядковая нумерация разделов",
      status: "warn",
      message: "Пронумерованные заголовки разделов не обнаружены — проверка невозможна.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  // Group headings by parent prefix (e.g. "1.2.3" → parent "1.2", last num 3).
  // Each group is checked for sequence 1, 2, 3, … independently.
  type Entry = { index: number; lastNum: number };
  const groups = new Map<string, Entry[]>();

  for (let i = 0; i < sectionHeadings.length; i++) {
    const parts = sectionHeadings[i].number.split(".");
    const lastNum = Number.parseInt(parts[parts.length - 1], 10);
    if (Number.isNaN(lastNum)) continue;
    const parentPrefix = parts.slice(0, -1).join(".");
    const group = groups.get(parentPrefix) ?? [];
    group.push({ index: i, lastNum });
    groups.set(parentPrefix, group);
  }

  if (groups.size === 0) {
    return {
      id: "section-numbering-sequence",
      title: "Порядковая нумерация разделов",
      status: "warn",
      message: "Разделы верхнего уровня не обнаружены — проверка невозможна.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  // Collect violations per heading index
  const violationExpected = new Map<number, number>();
  for (const entries of groups.values()) {
    for (let i = 0; i < entries.length; i++) {
      const expected = i + 1;
      if (entries[i].lastNum !== expected) {
        violationExpected.set(entries[i].index, expected);
      }
    }
  }

  const children: RuleResult[] = sectionHeadings.map((heading, index) => {
    const expected = violationExpected.get(index);
    const entryStatus: RuleStatus = expected === undefined ? "pass" : "fail";
    const parts = heading.number.split(".");
    const lastNum = Number.parseInt(parts[parts.length - 1], 10);
    return {
      id: `section-numbering-sequence-${heading.pageNumber}-${heading.number.replace(/\./g, "-")}`,
      title: heading.rawText,
      status: entryStatus,
      message:
        entryStatus === "pass"
          ? `Стр. ${heading.pageNumber}: корректно.`
          : `Стр. ${heading.pageNumber}: ожидается ${expected}, найден ${lastNum}.`,
      children: [],
      overlayBoxes: heading.pageBox
        ? [overlayBox(heading.pageNumber, heading.pageBox, heading.bounds, styleForHeading(entryStatus))]
        : [],
      jumpPageNumbers: [heading.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const violationCount = violationExpected.size;
  const status: RuleStatus = violationCount === 0 ? "pass" : "fail";

  return {
    id: "section-numbering-sequence",
    title: "Порядковая нумерация разделов",
    status,
    message:
      violationCount === 0
        ? `Нумерация ${sectionHeadings.length} заголовков разделов корректна.`
        : `Нарушена порядковая нумерация в ${violationCount} из ${sectionHeadings.length} заголовков.`,
    children,
    overlayBoxes: children.filter((c) => c.status === "fail").flatMap((c) => c.overlayBoxes),
    jumpPageNumbers: [...new Set(children.filter((c) => c.status === "fail").flatMap((c) => c.jumpPageNumbers))],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

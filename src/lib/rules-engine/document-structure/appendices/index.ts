import type { CheckerConfig } from "../../../checker-config";
import { overlayBox } from "../../overlays";
import { aggregateStatus } from "../../status";
import { median, POINTS_PER_CM } from "../../text-set-core";
import type { OverlayBox, PdfRect, RuleResult, RuleStatus } from "../../types";
import { normalizeText } from "../collect-lines";
import { splitTocEntriesByAppendix } from "../detect-structure-toc";
import {
  compareByDocumentOrder,
  isCenteredWithinTolerance,
} from "../shared-utils";
import { centerLineOverlay, styleForHeading } from "../styles";
import type { TocEntry } from "../types";
import { detectAppendices } from "./detection";
import type {
  AppendicesDetection,
  AppendixHeading,
  AppendixReference,
  AppendixTocEntry,
  AppendixTocItem,
} from "./types";

const SOURCES_ELEMENT_NAME = "СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ";
const SOURCES_TOC_TITLE_ALIASES = new Set<string>([
  SOURCES_ELEMENT_NAME,
  "СПИСОК ИСТОЧНИКОВ",
  "СПИСОК ЛИТЕРАТУРЫ",
  "СПИСОК ИСПОЛЬЗОВАННОЙ ЛИТЕРАТУРЫ",
  "БИБЛИОГРАФИЧЕСКИЙ СПИСОК",
]);
const PAGE_NUMBER_ONLY_REGEX = /^\d(?:\s*\d)*$/u;

export function buildAppendicesNode(
  pages: Parameters<typeof detectAppendices>[0],
  config: CheckerConfig,
  structure: Parameters<typeof detectAppendices>[1],
): RuleResult {
  const detection = detectAppendices(pages, structure);

  const children: RuleResult[] = [
    buildAppendicesInTocRule(detection),
    buildAppendixReferencesRule(detection),
    buildAppendixOrderByReferenceRule(detection),
    buildAppendixAfterSourcesRule(detection),
    buildAppendixNewPageRule(detection),
    buildAppendixNumberingRule(detection),
    buildAppendixLabelPositionRule(detection),
    buildAppendixTitleFormatRule(detection, config),
  ];

  const noAppendicesDeclared = detection.tocItems.length === 0;
  const status: RuleStatus = noAppendicesDeclared
    ? "pass"
    : aggregateStatus(children);
  return {
    id: "appendices",
    title: "Оформление приложений",
    status,
    message: noAppendicesDeclared
      ? "Раздел приложений в содержании не обнаружен; проверки раздела пропущены."
      : "Проверка ссылок, порядка и оформления приложений.",
    children,
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };
}

function buildAppendicesInTocRule(detection: AppendicesDetection): RuleResult {
  if (detection.tocItems.length === 0) {
    return emptyAppendixRule(
      "appendices-in-toc",
      "Приложения в содержании",
      "Записи приложений в «СОДЕРЖАНИИ» не обнаружены.",
    );
  }

  const children = detection.tocItems.map((item, index) => {
    const status: RuleStatus = item.heading ? "pass" : "fail";
    const overlayBoxes = buildTocWithOptionalHeadingOverlay(item, status);
    const jumpPageNumbers = [
      ...new Set([
        item.tocEntry.tocEntry.pageNumber,
        item.tocEntry.tocEntry.pageRef,
        ...(item.heading ? [item.heading.pageNumber] : []),
      ]),
    ];

    return {
      id: `appendix-in-toc-${index}`,
      title: appendixTocTitle(item.tocEntry),
      status,
      message: item.heading
        ? `Запись из содержания подтверждена заголовком приложения (стр. ${item.heading.pageNumber}).`
        : `Для записи из содержания не найден заголовок приложения на странице ${item.tocEntry.tocEntry.pageRef}.`,
      children: [],
      overlayBoxes,
      jumpPageNumbers,
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "appendices-in-toc",
    title: "Приложения в содержании",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "Все записи приложений из содержания подтверждены заголовками в документе."
        : `Для ${failed.length} записей приложений из содержания не найден соответствующий заголовок в документе.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [
      ...new Set(failed.flatMap((child) => child.jumpPageNumbers)),
    ],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function buildAppendixReferencesRule(
  detection: AppendicesDetection,
): RuleResult {
  if (detection.headings.length === 0) {
    return emptyAppendixRule(
      "appendices-references",
      "Ссылки на приложения в тексте",
      "Заголовки приложений не найдены по данным содержания.",
    );
  }

  const children: RuleResult[] = detection.headings.map((heading, index) => {
    const referencesBeforeHeading = referencesBefore(
      detection.referencesByIdentifier.get(heading.identifierNorm ?? "") ?? [],
      heading,
    );
    const status: RuleStatus =
      referencesBeforeHeading.length > 0 ? "pass" : "fail";
    const firstReference = referencesBeforeHeading[0];
    const overlayBoxes = buildHeadingWithOptionalReferenceOverlay(
      heading,
      firstReference,
      status,
    );

    return {
      id: `appendix-reference-${heading.pageNumber}-${index}`,
      title: appendixHeadingTitle(heading),
      status,
      message:
        status === "pass"
          ? `Найдена ссылка в тексте до приложения (стр. ${firstReference.pageNumber}).`
          : "В тексте до приложения не найдена ссылка на это приложение.",
      children: [],
      overlayBoxes,
      jumpPageNumbers: [
        ...new Set([
          heading.pageNumber,
          ...(firstReference ? [firstReference.pageNumber] : []),
        ]),
      ],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "appendices-references",
    title: "Ссылки на приложения в тексте",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "Для всех приложений найдены ссылки в тексте до их размещения."
        : `Для ${failed.length} приложений не найдены ссылки в тексте до их размещения.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [
      ...new Set(failed.flatMap((child) => child.jumpPageNumbers)),
    ],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function buildAppendixOrderByReferenceRule(
  detection: AppendicesDetection,
): RuleResult {
  if (detection.headings.length === 0) {
    return emptyAppendixRule(
      "appendices-order-by-reference",
      "Порядок приложений по упоминанию",
      "Заголовки приложений не найдены по данным содержания.",
    );
  }

  const issuesByHeading = new Map<AppendixHeading, string[]>();
  for (const heading of detection.headings) {
    issuesByHeading.set(heading, []);
  }

  const firstRefs = detection.headings.map((heading) =>
    firstReferenceBeforeHeading(
      detection.referencesByIdentifier.get(heading.identifierNorm ?? "") ?? [],
      heading,
    ),
  );

  for (let index = 0; index < detection.headings.length; index += 1) {
    if (!firstRefs[index]) {
      issuesByHeading
        .get(detection.headings[index])
        ?.push(
          "Невозможно проверить порядок: ссылка на приложение не найдена.",
        );
    }
  }

  for (let index = 1; index < detection.headings.length; index += 1) {
    const current = firstRefs[index];
    if (!current) continue;

    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = firstRefs[previousIndex];
      if (!previous) continue;

      const order = compareByDocumentOrder(
        previous.pageNumber,
        previous.centerY,
        current.pageNumber,
        current.centerY,
      );
      if (order > 0) {
        issuesByHeading
          .get(detection.headings[index])
          ?.push(
            "Порядок приложений не соответствует порядку их первого упоминания в тексте.",
          );
        break;
      }
    }
  }

  const children = detection.headings.map((heading, index) => {
    const issues = issuesByHeading.get(heading) ?? [];
    const status: RuleStatus = issues.length === 0 ? "pass" : "fail";
    const firstRef = firstRefs[index];
    const overlayBoxes = buildHeadingWithOptionalReferenceOverlay(
      heading,
      firstRef,
      status,
    );
    return {
      id: `appendix-order-${heading.pageNumber}-${index}`,
      title: appendixHeadingTitle(heading),
      status,
      message:
        issues.length === 0
          ? "Порядок приложения соответствует порядку первого упоминания."
          : issues.join(" "),
      children: [],
      overlayBoxes,
      jumpPageNumbers: [
        ...new Set([
          heading.pageNumber,
          ...(firstRef ? [firstRef.pageNumber] : []),
        ]),
      ],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "appendices-order-by-reference",
    title: "Порядок приложений по упоминанию",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "Порядок приложений соответствует порядку их первого упоминания."
        : `Для ${failed.length} приложений нарушен порядок относительно первых упоминаний.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [
      ...new Set(failed.flatMap((child) => child.jumpPageNumbers)),
    ],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function buildAppendixAfterSourcesRule(detection: AppendicesDetection): RuleResult {
  if (detection.headings.length === 0) {
    return emptyAppendixRule(
      "appendices-after-sources",
      "Приложения после списка источников",
      "Заголовки приложений не найдены по данным содержания.",
    );
  }

  const sourcesTocEntry = findSourcesTocEntry(detection.structure.tocEntries);
  const firstAppendix = detection.headings[0];
  const overlayBoxes: OverlayBox[] = [];
  const jumpPageNumbers: number[] = [firstAppendix.pageNumber];

  if (firstAppendix.pageBox) {
    overlayBoxes.push(
      overlayBox(
        firstAppendix.pageNumber,
        firstAppendix.pageBox,
        firstAppendix.bounds,
        styleForHeading("pass"),
      ),
    );
  }

  if (!sourcesTocEntry) {
    return {
      id: "appendices-after-sources",
      title: "Приложения после списка источников",
      status: "pass",
      message:
        "Раздел «СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ» не найден в «СОДЕРЖАНИИ», правило порядка приложений пропущено.",
      children: [],
      overlayBoxes,
      jumpPageNumbers,
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const sourcesPageNumber = resolveTocPageRefToPhysicalPageNumber(
    detection,
    sourcesTocEntry.pageRef,
  );

  if (sourcesTocEntry.pageBox) {
    overlayBoxes.push(
      overlayBox(
        sourcesTocEntry.pageNumber,
        sourcesTocEntry.pageBox,
        sourcesTocEntry.bounds,
        styleForHeading("pass"),
      ),
    );
    jumpPageNumbers.push(sourcesTocEntry.pageNumber);
  }
  jumpPageNumbers.push(sourcesPageNumber);

  const status: RuleStatus =
    firstAppendix.pageNumber > sourcesPageNumber ? "pass" : "fail";
  const message =
    status === "pass"
      ? `Первое приложение расположено после списка источников (стр. ${sourcesPageNumber} → ${firstAppendix.pageNumber}).`
      : `Первое приложение должно идти после списка источников (источники: стр. ${sourcesPageNumber}, первое приложение: стр. ${firstAppendix.pageNumber}).`;

  const styledOverlayBoxes = overlayBoxes.map((box) => ({
    ...box,
    style: styleForHeading(status),
  }));

  return {
    id: "appendices-after-sources",
    title: "Приложения после списка источников",
    status,
    message,
    children: [],
    overlayBoxes: styledOverlayBoxes,
    jumpPageNumbers: [...new Set(jumpPageNumbers)],
    childrenCollapsedByDefault: false,
    countInSummary: true,
  };
}

function buildAppendixNewPageRule(detection: AppendicesDetection): RuleResult {
  if (detection.headings.length === 0) {
    return emptyAppendixRule(
      "appendices-new-page",
      "Каждое приложение с новой страницы",
      "Заголовки приложений не найдены по данным содержания.",
    );
  }

  const countByPage = new Map<number, number>();
  for (const heading of detection.headings) {
    countByPage.set(
      heading.pageNumber,
      (countByPage.get(heading.pageNumber) ?? 0) + 1,
    );
  }

  const children = detection.headings.map((heading, index) => {
    const issues: string[] = [];
    const pageLines = detection.linesByPage.get(heading.pageNumber) ?? [];
    const linesAbove = pageLines.filter(
      (line, lineIndex) =>
        lineIndex < heading.lineIndex &&
        line.text.trim().length > 0 &&
        !PAGE_NUMBER_ONLY_REGEX.test(line.text.trim()),
    );
    if (linesAbove.length > 0) {
      issues.push(
        "Перед заголовком приложения есть другой текст на странице: приложение должно начинаться с новой страницы.",
      );
    }
    if ((countByPage.get(heading.pageNumber) ?? 0) > 1) {
      issues.push(
        "На одной странице обнаружено несколько заголовков приложений.",
      );
    }

    if (heading.pageBox) {
      const pageHeight = heading.pageBox.top - heading.pageBox.bottom;
      const topGap = heading.pageBox.top - heading.bounds.top;
      if (topGap > pageHeight * 0.28) {
        issues.push(
          "Заголовок приложения расположен слишком низко: приложение должно начинаться с начала страницы.",
        );
      }
    }

    const status: RuleStatus = issues.length === 0 ? "pass" : "fail";
    return {
      id: `appendix-new-page-${heading.pageNumber}-${index}`,
      title: appendixHeadingTitle(heading),
      status,
      message:
        status === "pass"
          ? "Приложение начинается с новой страницы."
          : issues.join(" "),
      children: [],
      overlayBoxes: heading.pageBox
        ? [
            overlayBox(
              heading.pageNumber,
              heading.pageBox,
              heading.bounds,
              styleForHeading(status),
            ),
          ]
        : [],
      jumpPageNumbers: [heading.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "appendices-new-page",
    title: "Каждое приложение с новой страницы",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "Все приложения начинаются с новой страницы."
        : `Для ${failed.length} приложений нарушено правило начала с новой страницы.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [
      ...new Set(failed.flatMap((child) => child.jumpPageNumbers)),
    ],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function buildAppendixNumberingRule(detection: AppendicesDetection): RuleResult {
  if (detection.headings.length === 0) {
    return emptyAppendixRule(
      "appendices-numbering",
      "Нумерация приложений",
      "Заголовки приложений не найдены по данным содержания.",
    );
  }

  const issuesByHeading = new Map<AppendixHeading, string[]>();
  for (const heading of detection.headings) {
    issuesByHeading.set(heading, []);
    if (!heading.identifierNorm || !heading.scheme || !heading.sequenceValue) {
      issuesByHeading
        .get(heading)
        ?.push(
          "Не удалось распознать номер приложения (ожидается число или русская буква).",
        );
    }
    if (heading.trailingDot) {
      issuesByHeading
        .get(heading)
        ?.push("После номера приложения точка не допускается.");
    }
  }

  const schemes = new Set(
    detection.headings
      .map((heading) => heading.scheme)
      .filter((value): value is NonNullable<typeof value> => value !== null),
  );
  if (schemes.size > 1) {
    for (const heading of detection.headings) {
      issuesByHeading
        .get(heading)
        ?.push(
          "Смешаны разные схемы нумерации приложений (числа и буквы). Используйте одну схему по всему документу.",
        );
    }
  }

  const headingsWithSequence = detection.headings.filter(
    (heading) =>
      heading.scheme !== null &&
      heading.sequenceValue !== null &&
      issuesByHeading.get(heading)?.length === 0,
  );
  for (let index = 0; index < headingsWithSequence.length; index += 1) {
    const heading = headingsWithSequence[index];
    const expected = index + 1;
    if (heading.sequenceValue !== expected) {
      issuesByHeading
        .get(heading)
        ?.push(
          `Нарушена сквозная последовательность приложений: ожидается ${expected}.`,
        );
    }
  }

  const children = detection.headings.map((heading, index) => {
    const issues = issuesByHeading.get(heading) ?? [];
    const status: RuleStatus = issues.length === 0 ? "pass" : "fail";
    return {
      id: `appendix-numbering-${heading.pageNumber}-${index}`,
      title: appendixHeadingTitle(heading),
      status,
      message:
        status === "pass"
          ? "Нумерация приложения корректна."
          : issues.join(" "),
      children: [],
      overlayBoxes: heading.pageBox
        ? [
            overlayBox(
              heading.pageNumber,
              heading.pageBox,
              heading.bounds,
              styleForHeading(status),
            ),
          ]
        : [],
      jumpPageNumbers: [heading.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "appendices-numbering",
    title: "Нумерация приложений",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "Нумерация приложений корректна."
        : `Для ${failed.length} приложений обнаружены нарушения нумерации.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [
      ...new Set(failed.flatMap((child) => child.jumpPageNumbers)),
    ],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function buildAppendixLabelPositionRule(
  detection: AppendicesDetection,
): RuleResult {
  if (detection.headings.length === 0) {
    return emptyAppendixRule(
      "appendices-label-position",
      "Позиция номера приложения",
      "Заголовки приложений не найдены по данным содержания.",
    );
  }

  const children = detection.headings.map((heading, index) => {
    const issues: string[] = [];
    if (!heading.pageBox) {
      issues.push("Не удалось определить геометрию страницы.");
    } else {
      const pageWidth = heading.pageBox.right - heading.pageBox.left;
      const pageHeight = heading.pageBox.top - heading.pageBox.bottom;
      const lineCenterX = (heading.bounds.left + heading.bounds.right) / 2;
      if (lineCenterX < heading.pageBox.left + pageWidth * 0.6) {
        issues.push(
          "Номер приложения должен быть размещен в правой части страницы.",
        );
      }
      if (heading.bounds.top < heading.pageBox.bottom + pageHeight * 0.72) {
        issues.push(
          "Номер приложения должен быть размещен в верхней части страницы.",
        );
      }
    }

    const status: RuleStatus = issues.length === 0 ? "pass" : "fail";
    return {
      id: `appendix-position-${heading.pageNumber}-${index}`,
      title: appendixHeadingTitle(heading),
      status,
      message:
        status === "pass"
          ? "Номер приложения расположен в верхнем правом углу."
          : issues.join(" "),
      children: [],
      overlayBoxes: heading.pageBox
        ? [
            overlayBox(
              heading.pageNumber,
              heading.pageBox,
              heading.bounds,
              styleForHeading(status),
            ),
          ]
        : [],
      jumpPageNumbers: [heading.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "appendices-label-position",
    title: "Позиция номера приложения",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "Позиция номера приложений соответствует требованиям."
        : `Для ${failed.length} приложений неверно расположение номера.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [
      ...new Set(failed.flatMap((child) => child.jumpPageNumbers)),
    ],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function buildAppendixTitleFormatRule(
  detection: AppendicesDetection,
  config: CheckerConfig,
): RuleResult {
  if (detection.headings.length === 0) {
    return emptyAppendixRule(
      "appendices-title-format",
      "Формат заголовка приложения",
      "Заголовки приложений не найдены по данным содержания.",
    );
  }

  const centerTolerancePt =
    config.documentStructure.centerToleranceCm * POINTS_PER_CM;
  const globalCenterX = resolveDocumentMedianCenterX(detection);

  const children = detection.headings.map((heading, index) => {
    const issues: string[] = [];
    const pageLines = detection.linesByPage.get(heading.pageNumber) ?? [];
    const page = detection.pagesByNumber.get(heading.pageNumber);
    const referenceBox = page?.marginBounds ?? page?.pageBox ?? null;
    const targetCenterX =
      globalCenterX ??
      resolvePageMarginAwareCenterX(
        {
          marginBounds: referenceBox,
          pageBox: heading.pageBox,
        },
      );
    const overlayReferenceBox = buildCenterReferenceBox(
      heading.pageBox,
      targetCenterX,
    );
    const titleLine = findFirstTitleLineAfterHeading(
      pageLines,
      heading.lineIndex,
    );

    if (heading.inlineTitleText.length > 0) {
      issues.push(
        "Заголовок приложения должен быть на отдельной строке ниже номера приложения.",
      );
    }

    if (!titleLine) {
      issues.push("После номера приложения не найден заголовок приложения.");
    } else {
      const titleText = titleLine.text.trim();
      if (!/\p{L}/u.test(titleText)) {
        issues.push("Заголовок приложения должен содержать текст.");
      } else if (isAllLettersUppercase(titleText)) {
        issues.push(
          "Заголовок приложения должен быть напечатан строчными буквами.",
        );
      }

      if (targetCenterX !== null) {
        const centerReferenceBox =
          buildCenterReferenceBox(
            referenceBox ?? heading.pageBox,
            targetCenterX,
          ) ??
          referenceBox ??
          heading.pageBox;
        if (
          centerReferenceBox &&
          !isCenteredWithinTolerance(
            titleLine.bounds,
            centerReferenceBox,
            centerTolerancePt,
          )
        ) {
          issues.push("Заголовок приложения должен быть выровнен по центру.");
        }
      }
    }

    const status: RuleStatus = issues.length === 0 ? "pass" : "fail";
    const overlayBoxes: OverlayBox[] = [];
    if (heading.pageBox) {
      overlayBoxes.push(
        centerLineOverlay(
          heading.pageNumber,
          heading.pageBox,
          status,
          overlayReferenceBox ?? referenceBox,
        ),
      );
      overlayBoxes.push(
        overlayBox(
          heading.pageNumber,
          heading.pageBox,
          heading.bounds,
          styleForHeading(status),
        ),
      );
      if (titleLine) {
        overlayBoxes.push(
          overlayBox(
            heading.pageNumber,
            heading.pageBox,
            titleLine.bounds,
            styleForHeading(status),
          ),
        );
      }
    }

    return {
      id: `appendix-title-${heading.pageNumber}-${index}`,
      title: appendixHeadingTitle(heading),
      status,
      message:
        status === "pass"
          ? "Заголовок приложения оформлен корректно."
          : issues.join(" "),
      children: [],
      overlayBoxes,
      jumpPageNumbers: [heading.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "appendices-title-format",
    title: "Формат заголовка приложения",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "Формат заголовков приложений соответствует требованиям."
        : `Для ${failed.length} приложений нарушен формат заголовка.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [
      ...new Set(failed.flatMap((child) => child.jumpPageNumbers)),
    ],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function firstReferenceBeforeHeading(
  references: AppendixReference[],
  heading: AppendixHeading,
): AppendixReference | null {
  return referencesBefore(references, heading)[0] ?? null;
}

function referencesBefore(
  references: AppendixReference[],
  heading: AppendixHeading,
): AppendixReference[] {
  const result = references.filter((reference) => {
    const order = compareByDocumentOrder(
      reference.pageNumber,
      reference.centerY,
      heading.pageNumber,
      heading.centerY,
    );
    return order < 0;
  });

  result.sort((left, right) =>
    compareByDocumentOrder(
      left.pageNumber,
      left.centerY,
      right.pageNumber,
      right.centerY,
    ),
  );
  return result;
}

function findFirstTitleLineAfterHeading(
  lines: AppendicesDetection["linesByPage"] extends Map<number, infer T>
    ? T
    : never,
  headingLineIndex: number,
) {
  for (let index = headingLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const text = line.text.trim();
    if (!text) {
      continue;
    }
    if (PAGE_NUMBER_ONLY_REGEX.test(text)) {
      continue;
    }
    return line;
  }

  return null;
}

function isAllLettersUppercase(text: string): boolean {
  let hasLetter = false;

  for (const char of text) {
    if (!/\p{L}/u.test(char)) {
      continue;
    }
    hasLetter = true;
    if (/\p{Ll}/u.test(char)) {
      return false;
    }
  }

  return hasLetter;
}

function resolveDocumentMedianCenterX(
  detection: AppendicesDetection,
): number | null {
  const centers: number[] = [];

  for (const page of detection.pagesByNumber.values()) {
    const centerX = resolvePageMarginAwareCenterX({
      marginBounds: page.marginBounds,
      pageBox: page.pageBox,
    });
    if (centerX !== null) {
      centers.push(centerX);
    }
  }

  if (centers.length === 0) {
    return null;
  }

  return median(centers);
}

function resolvePageMarginAwareCenterX(
  page: {
    marginBounds: PdfRect | null | undefined;
    pageBox: PdfRect | null | undefined;
  },
): number | null {
  const detectedCenterX = referenceCenterX(page.marginBounds);
  if (detectedCenterX !== null) {
    return detectedCenterX;
  }

  return referenceCenterX(page.pageBox);
}

function referenceCenterX(referenceBox: PdfRect | null | undefined): number | null {
  if (!referenceBox) {
    return null;
  }
  return (referenceBox.left + referenceBox.right) / 2;
}

function buildCenterReferenceBox(
  pageBox: PdfRect | null | undefined,
  centerX: number | null,
): PdfRect | null {
  if (!pageBox || centerX === null) {
    return null;
  }

  return {
    left: centerX - 0.5,
    right: centerX + 0.5,
    bottom: pageBox.bottom,
    top: pageBox.top,
  };
}

function buildHeadingWithOptionalReferenceOverlay(
  heading: AppendixHeading,
  reference: AppendixReference | null,
  status: RuleStatus,
): OverlayBox[] {
  const overlayBoxes: OverlayBox[] = [];
  if (heading.pageBox) {
    overlayBoxes.push(
      overlayBox(
        heading.pageNumber,
        heading.pageBox,
        heading.bounds,
        styleForHeading(status),
      ),
    );
  }

  if (reference?.pageBox) {
    overlayBoxes.push(
      overlayBox(
        reference.pageNumber,
        reference.pageBox,
        reference.bounds,
        styleForHeading(status),
      ),
    );
  }

  return overlayBoxes;
}

function buildTocWithOptionalHeadingOverlay(
  item: AppendixTocItem,
  status: RuleStatus,
): OverlayBox[] {
  const overlayBoxes: OverlayBox[] = [];
  if (item.tocEntry.tocEntry.pageBox) {
    overlayBoxes.push(
      overlayBox(
        item.tocEntry.tocEntry.pageNumber,
        item.tocEntry.tocEntry.pageBox,
        item.tocEntry.tocEntry.bounds,
        styleForHeading(status),
      ),
    );
  }
  if (item.heading?.pageBox) {
    overlayBoxes.push(
      overlayBox(
        item.heading.pageNumber,
        item.heading.pageBox,
        item.heading.bounds,
        styleForHeading(status),
      ),
    );
  }

  return overlayBoxes;
}

function appendixHeadingTitle(heading: AppendixHeading): string {
  const suffix = heading.identifierRaw ? ` ${heading.identifierRaw}` : "";
  return `Приложение${suffix}`;
}

function appendixTocTitle(tocEntry: AppendixTocEntry): string {
  const suffix = tocEntry.identifierRaw ? ` ${tocEntry.identifierRaw}` : "";
  return `Приложение${suffix}`;
}

function findSourcesTocEntry(tocEntries: TocEntry[]): TocEntry | null {
  const { mainEntries } = splitTocEntriesByAppendix(tocEntries);
  for (let index = mainEntries.length - 1; index >= 0; index -= 1) {
    const entry = mainEntries[index];
    if (isSourcesTocTitle(entry.title)) {
      return entry;
    }
  }

  return null;
}

function isSourcesTocTitle(title: string): boolean {
  const normalized = normalizeTocTitle(title);
  if (SOURCES_TOC_TITLE_ALIASES.has(normalized)) {
    return true;
  }

  return (
    normalized.startsWith("СПИСОК ") &&
    (normalized.includes("ИСТОЧНИК") ||
      normalized.includes("ЛИТЕРАТУР") ||
      normalized.includes("БИБЛИОГРАФ"))
  );
}

function normalizeTocTitle(title: string): string {
  return normalizeText(title).replace(/^\d+(?:[.\s]+\d+)*\.?\s+/u, "");
}

function resolveTocPageRefToPhysicalPageNumber(
  detection: AppendicesDetection,
  pageRef: number,
): number {
  const page =
    detection.pagesByPrintedNumber.get(pageRef) ??
    detection.pagesByNumber.get(pageRef);
  return page?.pageNumber ?? pageRef;
}

function emptyAppendixRule(
  id: string,
  title: string,
  message: string,
): RuleResult {
  return {
    id,
    title,
    status: "pass",
    message,
    children: [],
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: true,
  };
}

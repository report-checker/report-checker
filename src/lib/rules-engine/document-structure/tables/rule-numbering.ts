import { overlayBox } from "../../overlays";
import type { RuleResult, RuleStatus } from "../../types";
import { styleForHeading } from "../styles";
import { sortByDocumentOrder } from "../shared-utils";
import type { TableCaption, TableDetection, TableNumberScheme } from "./types";

export function buildTableNumberingRule(detection: TableDetection): RuleResult {
  const numberedCaptions = detection.captions.filter(
    (caption) => !caption.isAppendix && !caption.isContinuation,
  );

  if (numberedCaptions.length === 0) {
    return {
      id: "tables-numbering",
      title: "Нумерация таблиц",
      status: "pass",
      message: "Таблицы вне приложений не обнаружены.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const issuesByCaption = new Map<TableCaption, string[]>();
  for (const caption of numberedCaptions) {
    issuesByCaption.set(caption, []);
  }

  const schemes = new Set(
    numberedCaptions
      .map((caption) => caption.scheme)
      .filter((scheme): scheme is TableNumberScheme => scheme !== null),
  );

  for (const caption of numberedCaptions) {
    if (caption.scheme === null) {
      issuesByCaption.get(caption)?.push("Некорректный формат номера таблицы.");
    }
  }

  if (schemes.size > 1) {
    for (const caption of numberedCaptions) {
      issuesByCaption
        .get(caption)
        ?.push("Смешаны разные схемы нумерации таблиц (сквозная и по разделам).");
    }
  } else if (schemes.has("continuous")) {
    const ordered = sortByDocumentOrder(numberedCaptions);
    for (let index = 0; index < ordered.length; index += 1) {
      const expected = index + 1;
      if (ordered[index].continuousIndex !== expected) {
        issuesByCaption
          .get(ordered[index])
          ?.push(`Ожидается номер «${expected}» в сквозной нумерации.`);
      }
    }
  } else if (schemes.has("sectioned")) {
    const ordered = sortByDocumentOrder(numberedCaptions);
    const expectedBySection = new Map<number, number>();
    let previousSection = 0;
    for (const caption of ordered) {
      if (caption.sectionIndex === null || caption.sectionItemIndex === null) {
        continue;
      }

      if (caption.sectionIndex < previousSection) {
        issuesByCaption
          .get(caption)
          ?.push("Номер раздела в названии таблицы не должен уменьшаться.");
      }
      previousSection = Math.max(previousSection, caption.sectionIndex);

      const expected = (expectedBySection.get(caption.sectionIndex) ?? 0) + 1;
      if (caption.sectionItemIndex !== expected) {
        issuesByCaption
          .get(caption)
          ?.push(
            `Для раздела ${caption.sectionIndex} ожидается номер таблицы ${caption.sectionIndex}.${expected}.`,
          );
      }
      expectedBySection.set(caption.sectionIndex, expected);
    }
  }

  const children = numberedCaptions.map((caption, index) => {
    const issues = issuesByCaption.get(caption) ?? [];
    const status: RuleStatus = issues.length === 0 ? "pass" : "fail";
    return {
      id: `table-numbering-${caption.pageNumber}-${index}`,
      title: `Таблица ${caption.numberRaw}`,
      status,
      message:
        status === "pass"
          ? `Стр. ${caption.pageNumber}: нумерация корректна.`
          : `Стр. ${caption.pageNumber}: ${issues.join(" ")}`,
      children: [],
      overlayBoxes: caption.pageBox
        ? [
            overlayBox(
              caption.pageNumber,
              caption.pageBox,
              caption.bounds,
              styleForHeading(status),
            ),
          ]
        : [],
      jumpPageNumbers: [caption.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "tables-numbering",
    title: "Нумерация таблиц",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "Нумерация таблиц корректна."
        : `Найдены нарушения нумерации таблиц: ${failed.length}.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [...new Set(failed.flatMap((child) => child.jumpPageNumbers))],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}


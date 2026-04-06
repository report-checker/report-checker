import { overlayBox } from "../../overlays";
import type { OverlayBox, RuleResult, RuleStatus } from "../../types";
import { styleForHeading } from "../styles";
import { flattenMapValues, sortByDocumentOrder } from "../shared-utils";
import type { TableDetection, TableReference } from "./types";

export function buildTableReferencesRule(detection: TableDetection): RuleResult {
  const numberedCaptions = detection.captions.filter(
    (caption) => !caption.isAppendix && !caption.isContinuation,
  );
  const allReferences = sortByDocumentOrder(
    flattenMapValues(detection.referencesByNumber),
  );

  if (numberedCaptions.length === 0) {
    if (allReferences.length === 0) {
      return {
        id: "tables-references",
        title: "Ссылки на таблицы в тексте",
        status: "pass",
        message: "Таблицы вне приложений не обнаружены.",
        children: [],
        overlayBoxes: [],
        jumpPageNumbers: [],
        childrenCollapsedByDefault: false,
        countInSummary: true,
      };
    }

    const orphanChildren = allReferences.map((reference, index) => ({
      id: `table-orphan-reference-${reference.pageNumber}-${index}`,
      title: `Ссылка: ${formatReferenceLabel(reference)}`,
      status: "fail" as RuleStatus,
      message: `Стр. ${reference.pageNumber}: название соответствующей таблицы не найдено.`,
      children: [],
      overlayBoxes: reference.pageBox
        ? [
            overlayBox(
              reference.pageNumber,
              reference.pageBox,
              reference.bounds,
              styleForHeading("fail"),
            ),
          ]
        : [],
      jumpPageNumbers: [reference.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    }));

    return {
      id: "tables-references",
      title: "Ссылки на таблицы в тексте",
      status: "fail",
      message:
        "Обнаружены ссылки на таблицы, но названия таблиц не найдены. Проверьте формат названия таблиц.",
      children: orphanChildren,
      overlayBoxes: orphanChildren.flatMap((child) => child.overlayBoxes),
      jumpPageNumbers: [
        ...new Set(orphanChildren.flatMap((child) => child.jumpPageNumbers)),
      ],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const children = numberedCaptions.map((caption, index) => {
    const references = sortByDocumentOrder(
      detection.referencesByNumber.get(caption.numberRaw) ?? [],
    );
    const issues: string[] = [];
    if (references.length === 0) {
      issues.push("В тексте отсутствует ссылка на эту таблицу.");
    }
    const status: RuleStatus = issues.length === 0 ? "pass" : "fail";

    const referenceChildren =
      references.length > 0
        ? references.map((reference, referenceIndex) => ({
            id: `table-reference-hit-${caption.pageNumber}-${index}-${referenceIndex}`,
            title: formatReferenceLabel(reference),
            status: "pass" as RuleStatus,
            message: `Стр. ${reference.pageNumber}: ссылка найдена.`,
            children: [],
            overlayBoxes: reference.pageBox
              ? [
                  overlayBox(
                    reference.pageNumber,
                    reference.pageBox,
                    reference.bounds,
                    styleForHeading("pass"),
                  ),
                ]
              : [],
            jumpPageNumbers: [reference.pageNumber],
            childrenCollapsedByDefault: false,
            countInSummary: false,
          }))
        : [
            {
              id: `table-reference-missing-${caption.pageNumber}-${index}`,
              title: `Таблица ${caption.numberRaw}`,
              status: "fail" as RuleStatus,
              message: "Ссылка в тексте не найдена.",
              children: [],
              overlayBoxes: [],
              jumpPageNumbers: [],
              childrenCollapsedByDefault: false,
              countInSummary: false,
            },
          ];

    const overlayBoxes: OverlayBox[] = [];
    if (caption.pageBox) {
      overlayBoxes.push(
        overlayBox(
          caption.pageNumber,
          caption.pageBox,
          caption.bounds,
          styleForHeading(status),
        ),
      );
    }
    overlayBoxes.push(...referenceChildren.flatMap((child) => child.overlayBoxes));

    return {
      id: `table-reference-${caption.pageNumber}-${index}`,
      title: `Таблица ${caption.numberRaw}`,
      status,
      message:
        status === "pass"
          ? `Найдена ссылка(и) в тексте: ${references.length}.`
          : issues.join(" "),
      children: referenceChildren,
      overlayBoxes,
      jumpPageNumbers: [
        ...new Set([
          caption.pageNumber,
          ...referenceChildren.flatMap((child) => child.jumpPageNumbers),
        ]),
      ],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "tables-references",
    title: "Ссылки на таблицы в тексте",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "На все таблицы есть ссылки в тексте."
        : `Для ${failed.length} таблиц отсутствуют ссылки в тексте.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [...new Set(failed.flatMap((child) => child.jumpPageNumbers))],
    childrenCollapsedByDefault: false,
    countInSummary: true,
  };
}

function formatReferenceLabel(reference: TableReference): string {
  return `${reference.label} ${reference.numberRaw}`.trim();
}


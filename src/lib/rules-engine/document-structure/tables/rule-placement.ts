import { overlayBox } from "../../overlays";
import type { OverlayBox, RuleResult, RuleStatus } from "../../types";
import { styleForHeading } from "../styles";
import { compareByDocumentOrder, sortByDocumentOrder } from "../shared-utils";
import type { TableDetection } from "./types";

export function buildTablePlacementByReferenceRule(
  detection: TableDetection,
): RuleResult {
  const numberedCaptions = detection.captions.filter(
    (caption) => !caption.isAppendix && !caption.isContinuation,
  );

  if (numberedCaptions.length === 0) {
    return {
      id: "tables-placement-by-reference",
      title: "Размещение таблицы относительно первой ссылки",
      status: "pass",
      message: "Таблицы вне приложений не обнаружены.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const children = numberedCaptions.map((caption, index) => {
    const references = sortByDocumentOrder(
      detection.referencesByNumber.get(caption.numberRaw) ?? [],
    );
    const firstReference = references[0];
    const issues: string[] = [];
    const overlays: OverlayBox[] = [];
    const jumpPages: number[] = [caption.pageNumber];

    if (!firstReference) {
      issues.push("Первая ссылка не найдена, невозможно проверить размещение.");
    } else {
      const referenceComesBefore =
        compareByDocumentOrder(
          firstReference.pageNumber,
          firstReference.centerY,
          caption.pageNumber,
          caption.centerY,
        ) < 0;
      if (!referenceComesBefore) {
        issues.push(
          "Первая ссылка на таблицу должна встречаться в тексте до названия таблицы.",
        );
      }

      const pageDistance = caption.pageNumber - firstReference.pageNumber;
      if (pageDistance < 0 || pageDistance > 1) {
        issues.push(
          "Таблица должна располагаться после первой ссылки в тексте на той же или следующей странице.",
        );
      }

      if (firstReference.pageBox) {
        overlays.push(
          overlayBox(
            firstReference.pageNumber,
            firstReference.pageBox,
            firstReference.bounds,
            styleForHeading(issues.length === 0 ? "pass" : "fail"),
          ),
        );
      }
      jumpPages.push(firstReference.pageNumber);
    }

    if (caption.pageBox) {
      overlays.push(
        overlayBox(
          caption.pageNumber,
          caption.pageBox,
          caption.bounds,
          styleForHeading(issues.length === 0 ? "pass" : "fail"),
        ),
      );
    }

    const status: RuleStatus = issues.length === 0 ? "pass" : "fail";
    return {
      id: `table-placement-${caption.pageNumber}-${index}`,
      title: `Таблица ${caption.numberRaw}`,
      status,
      message:
        status === "pass"
          ? "Размещение относительно первой ссылки корректно."
          : issues.join(" "),
      children: [],
      overlayBoxes: overlays,
      jumpPageNumbers: [...new Set(jumpPages)],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "tables-placement-by-reference",
    title: "Размещение таблицы относительно первой ссылки",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "Таблицы размещены на той же или следующей странице после первой ссылки."
        : `Для ${failed.length} таблиц нарушено правило размещения после первой ссылки.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [...new Set(failed.flatMap((child) => child.jumpPageNumbers))],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}


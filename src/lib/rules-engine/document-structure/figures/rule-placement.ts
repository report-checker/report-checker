import { overlayBox } from "../../overlays";
import type { OverlayBox, RuleResult, RuleStatus } from "../../types";
import { styleForHeading } from "../styles";
import type { FigureDetection } from "./types";
import { compareByDocumentOrder, sortReferencesByDocumentOrder } from "./utils";

export function buildFigurePlacementByReferenceRule(
  detection: FigureDetection,
): RuleResult {
  const numberedCaptions = detection.captions.filter(
    (caption) => !caption.isAppendix,
  );

  if (numberedCaptions.length === 0) {
    return {
      id: "figures-placement-by-reference",
      title: "Размещение рисунка относительно первой ссылки",
      status: "pass",
      message: "Рисунки вне приложений не обнаружены.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const children = numberedCaptions.map((caption, index) => {
    const references = sortReferencesByDocumentOrder(
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
          "Первая ссылка на рисунок должна встречаться в тексте до подписи.",
        );
      }

      const pageDistance = caption.pageNumber - firstReference.pageNumber;
      if (pageDistance < 0 || pageDistance > 1) {
        issues.push(
          "Рисунок должен располагаться после первой ссылки в тексте на той же или следующей странице.",
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
      id: `figure-placement-${caption.pageNumber}-${index}`,
      title: `Рисунок ${caption.numberRaw}`,
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
    id: "figures-placement-by-reference",
    title: "Размещение рисунка относительно первой ссылки",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "Рисунки размещены на той же или следующей странице после первой ссылки."
        : `Для ${failed.length} рисунков нарушено правило размещения после первой ссылки.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [
      ...new Set(failed.flatMap((child) => child.jumpPageNumbers)),
    ],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

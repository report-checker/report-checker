import { overlayBox } from "../../overlays";
import type { OverlayBox, RuleResult, RuleStatus } from "../../types";
import { styleForHeading } from "../styles";
import type { TableCaption, TableDetection } from "./types";

export function buildTableCaptionFormatRule(detection: TableDetection): RuleResult {
  if (detection.captions.length === 0) {
    return {
      id: "tables-caption-format",
      title: "Оформление названий таблиц",
      status: "pass",
      message: "Название таблиц формата «Таблица N — ...» не обнаружены.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const children = detection.captions.map((caption, index) => {
    const status: RuleStatus =
      caption.formatIssues.length === 0 ? "pass" : "fail";
    const overlays = buildCaptionOverlays(caption, status);
    const captionKind = caption.isContinuation ? "Продолжение таблицы" : "Таблица";

    return {
      id: `table-caption-format-${caption.pageNumber}-${index}`,
      title: `${captionKind} ${caption.numberRaw}`,
      status,
      message:
        status === "pass"
          ? `Стр. ${caption.pageNumber}: оформление названия таблицы корректно.`
          : `Стр. ${caption.pageNumber}: ${caption.formatIssues.join(" ")}`,
      children: [],
      overlayBoxes: overlays,
      jumpPageNumbers: [caption.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "tables-caption-format",
    title: "Оформление названий таблиц",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? `Проверено ${children.length} названий таблиц, нарушений не обнаружено.`
        : `Нарушения оформления в ${failed.length} из ${children.length} названий таблиц.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [...new Set(failed.flatMap((child) => child.jumpPageNumbers))],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function buildCaptionOverlays(
  caption: TableCaption,
  status: RuleStatus,
): OverlayBox[] {
  if (!caption.pageBox) {
    return [];
  }

  const overlays: OverlayBox[] = [
    overlayBox(
      caption.pageNumber,
      caption.pageBox,
      caption.bounds,
      styleForHeading(status),
    ),
  ];

  if (caption.linkedTableContentBounds) {
    overlays.push(
      overlayBox(
        caption.pageNumber,
        caption.pageBox,
        caption.linkedTableContentBounds,
        styleForHeading(status),
      ),
    );
  }

  return overlays;
}


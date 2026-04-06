import { overlayBox } from "../../overlays";
import type { OverlayBox, RuleResult, RuleStatus } from "../../types";
import { styleForHeading } from "../styles";
import type { FigureCaption, FigureDetection } from "./types";

export function buildFigureCaptionFormatRule(
  detection: FigureDetection,
): RuleResult {
  if (detection.captions.length === 0) {
    return {
      id: "figures-caption-format",
      title: "Подписи к рисункам",
      status: "pass",
      message: "Подписи рисунков формата «Рисунок N — ...» не обнаружены.",
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
    return {
      id: `figure-caption-format-${caption.pageNumber}-${index}`,
      title: `${caption.captionLabel} ${caption.numberRaw}`,
      status,
      message:
        status === "pass"
          ? `Стр. ${caption.pageNumber}: подпись рисунка оформлена корректно.`
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
    id: "figures-caption-format",
    title: "Подписи к рисункам",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? `Проверено ${children.length} подписей рисунков, нарушений не обнаружено.`
        : `Нарушения оформления в ${failed.length} из ${children.length} подписей рисунков.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [
      ...new Set(failed.flatMap((child) => child.jumpPageNumbers)),
    ],
    childrenCollapsedByDefault: true,
    countInSummary: true,
  };
}

function buildCaptionOverlays(
  caption: FigureCaption,
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

  if (caption.linkedObjectBounds) {
    overlays.push(
      overlayBox(
        caption.pageNumber,
        caption.pageBox,
        caption.linkedObjectBounds,
        styleForHeading(status),
      ),
    );
  }

  return overlays;
}

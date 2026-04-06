import { overlayBox } from "../overlays";
import type { OverlayBox, OverlayStyle, PdfRect, RuleStatus } from "../types";

export function centerLineOverlay(
  pageNumber: number,
  pageBox: PdfRect,
  status: RuleStatus,
  referenceBox?: PdfRect | null,
): OverlayBox {
  const ref = referenceBox ?? pageBox;
  const centerX = (ref.left + ref.right) / 2;
  return overlayBox(
    pageNumber,
    pageBox,
    {
      left: centerX - 0.5,
      right: centerX + 0.5,
      bottom: pageBox.bottom,
      top: pageBox.top,
    },
    {
      borderColor: "transparent",
      fillColor:
        status === "pass"
          ? "rgba(16, 185, 129, 0.35)"
          : "rgba(239, 68, 68, 0.35)",
      borderWidth: 0,
      dashed: false,
    },
  );
}

export function styleForStructuralElement(status: RuleStatus): OverlayStyle {
  return status === "fail"
    ? {
        borderColor: "#d97706",
        fillColor: "rgba(217, 119, 6, 0.10)",
        borderWidth: 2,
        dashed: false,
      }
    : {
        borderColor: "#059669",
        fillColor: "rgba(16, 185, 129, 0.10)",
        borderWidth: 1,
        dashed: true,
      };
}

export function styleForHeading(status: RuleStatus): OverlayStyle {
  return status === "fail"
    ? {
        borderColor: "#dc2626",
        fillColor: "rgba(239, 68, 68, 0.10)",
        borderWidth: 2,
        dashed: false,
      }
    : {
        borderColor: "#059669",
        fillColor: "rgba(16, 185, 129, 0.10)",
        borderWidth: 1,
        dashed: true,
      };
}

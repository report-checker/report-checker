import type { OverlayBox, OverlayStyle, PdfRect } from "./types";

export function overlayBox(
  pageNumber: number,
  pageBox: PdfRect,
  rect: PdfRect,
  style: OverlayStyle,
): OverlayBox {
  return {
    pageNumber,
    pageBox,
    rect,
    style,
  };
}

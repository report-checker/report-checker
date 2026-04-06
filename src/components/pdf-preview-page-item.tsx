import type { PageCanvasMetrics } from "@/components/pdf-preview-types";
import { rectToPixels } from "@/components/pdf-preview-utils";
import type { OverlayBox } from "@/lib/report-checker";

type PdfPreviewPageItemProps = {
  pageNumber: number;
  metrics?: PageCanvasMetrics;
  overlays: OverlayBox[];
  onPageRef: (pageNumber: number, node: HTMLDivElement | null) => void;
  onCanvasRef: (pageNumber: number, node: HTMLCanvasElement | null) => void;
};

export function PdfPreviewPageItem({
  pageNumber,
  metrics,
  overlays,
  onPageRef,
  onCanvasRef,
}: PdfPreviewPageItemProps) {
  const overlayPixels = metrics
    ? overlays.map((overlay) => ({
        overlay,
        pixels: rectToPixels(overlay.rect, overlay.pageBox, metrics),
      }))
    : [];

  return (
    <div
      ref={(node) => {
        onPageRef(pageNumber, node);
      }}
      className="bg-background relative mx-auto w-fit rounded-md border shadow-xs"
    >
      <canvas
        ref={(node) => {
          onCanvasRef(pageNumber, node);
        }}
        className="block rounded-md"
      />

      <div className="bg-background/90 text-muted-foreground absolute top-2 right-2 rounded px-2 py-1 text-[10px] shadow-xs">
        Стр. {pageNumber}
      </div>

      {overlayPixels.length > 0 ? (
        <div className="pointer-events-none absolute inset-0">
          {overlayPixels.map(({ overlay, pixels }, index) => {
            const overlayKey = [
              pageNumber,
              index,
              pixels.left,
              pixels.top,
              pixels.width,
              pixels.height,
            ].join("|");

            return (
              <div
                key={overlayKey}
                className="absolute"
                style={{
                  left: `${pixels.left}px`,
                  top: `${pixels.top}px`,
                  width: `${pixels.width}px`,
                  height: `${pixels.height}px`,
                  borderColor: overlay.style.borderColor,
                  borderWidth: `${overlay.style.borderWidth}px`,
                  borderStyle: overlay.style.dashed ? "dashed" : "solid",
                  backgroundColor: overlay.style.fillColor,
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

import { Maximize, Minimize, Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type ScaleMode = "custom" | "fit-width" | "fit-page";

type PdfPreviewZoomControlsProps = {
  zoomPercent: number;
  pageCount: number;
  currentPageNumber: number | null;
  disabled: boolean;
  scaleMode: ScaleMode;
  nextFitMode: "fit-width" | "fit-page";
  canZoomOut: boolean;
  canZoomIn: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onToggleFitMode: () => void;
  onResetZoom: () => void;
};

export function PdfPreviewZoomControls({
  zoomPercent,
  pageCount,
  currentPageNumber,
  disabled,
  scaleMode,
  nextFitMode,
  canZoomOut,
  canZoomIn,
  onZoomOut,
  onZoomIn,
  onToggleFitMode,
  onResetZoom,
}: PdfPreviewZoomControlsProps) {
  const fitToggleTitle =
    nextFitMode === "fit-page" ? "По странице" : "По ширине";

  return (
    <div className="border-b bg-background/90 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          disabled={disabled || !canZoomOut}
          onClick={onZoomOut}
          aria-label="Уменьшить масштаб"
        >
          <Minus className="size-3" />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          disabled={disabled || !canZoomIn}
          onClick={onZoomIn}
          aria-label="Увеличить масштаб"
        >
          <Plus className="size-3" />
        </Button>

        <Button
          type="button"
          variant={scaleMode === "custom" ? "outline" : "default"}
          size="icon-xs"
          disabled={disabled}
          onClick={onToggleFitMode}
          title={fitToggleTitle}
          aria-label={fitToggleTitle}
        >
          {nextFitMode === "fit-page" ? (
            <Minimize className="size-3" />
          ) : (
            <Maximize className="size-3" />
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          disabled={disabled || zoomPercent === 100}
          onClick={onResetZoom}
          title="Сбросить масштаб"
          aria-label="Сбросить масштаб"
        >
          <RotateCcw className="size-3" />
        </Button>

        <span className="text-muted-foreground min-w-14 text-center text-xs tabular-nums">
          {zoomPercent}%
        </span>

        <div className="text-muted-foreground ml-auto text-xs tabular-nums">
          {pageCount > 0 && currentPageNumber
            ? `Стр. ${currentPageNumber} / ${pageCount}`
            : "Стр. -"}
        </div>
      </div>
    </div>
  );
}

import { FileText, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  computeFilteredSummary,
  formatFileSize,
  makeFileKey,
} from "@/features/report-checker/helpers";
import type { FileCheckResult } from "@/lib/report-checker";
import { cn } from "@/lib/utils";

function getSummaryRatios(summary: FileCheckResult["summary"]) {
  const fallbackTotal = summary.pass + summary.fail + summary.warn;
  const total = Math.max(summary.total || fallbackTotal, 1);

  return {
    pass: (summary.pass / total) * 100,
    fail: (summary.fail / total) * 100,
    warn: (summary.warn / total) * 100,
  };
}

type FilePanelProps = {
  inputRef: React.RefObject<HTMLInputElement | null>;
  selectedFiles: File[];
  activeFileKey: string | null;
  isChecking: boolean;
  checkProgress: { step: string; progress: number } | null;
  checkError: string | null;
  resultsByFile: Map<string, FileCheckResult>;
  hideBaselines: boolean;
  hasBaseline: (fileName: string, ruleId: string, message: string) => boolean;
  onOpenFilePicker: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFilesDrop: (files: File[]) => void;
  onRunChecks: () => void;
  onActivateFile: (key: string) => void;
};

export function FilePanel({
  inputRef,
  selectedFiles,
  activeFileKey,
  isChecking,
  checkProgress,
  checkError,
  resultsByFile,
  hideBaselines,
  hasBaseline,
  onOpenFilePicker,
  onFileSelect,
  onFilesDrop,
  onRunChecks,
  onActivateFile,
}: FilePanelProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = () => {
    setIsDragging(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) {
      return;
    }

    onFilesDrop(files);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b px-4 pb-3">
        <div className="flex items-start gap-3">
          <div>
            <h2 className="text-lg font-semibold">Файлы</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Выберите один или несколько PDF и запустите проверку.
            </p>
          </div>
        </div>
      </div>

      <div className="flex h-full flex-col gap-3 overflow-y-auto pt-4">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={onFileSelect}
          className="hidden"
        />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onOpenFilePicker}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "rounded-md border-2 border-dashed p-4 text-center transition-colors",
              "cursor-pointer",
              isDragging
                ? "border-primary bg-primary/8"
                : "border-border hover:border-primary/60",
            )}
          >
            <Upload className="mx-auto mb-2 size-5" />
            <p className="text-sm font-medium">Перетащите PDF сюда</p>
            <p className="text-muted-foreground text-xs">
              или нажмите для выбора
            </p>
          </button>
          <Button
            variant="secondary"
            disabled={selectedFiles.length === 0 || isChecking}
            onClick={onRunChecks}
          >
            {isChecking ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Проверяем...
              </>
            ) : (
              "Запустить проверку"
            )}
          </Button>

          {isChecking ? (
            <div className="space-y-1">
              <p className="text-muted-foreground truncate text-xs">
                {checkProgress?.step ?? "Подготовка..."}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <Progress
                  value={(checkProgress?.progress ?? 0) * 100}
                  className="w-full"
                />
              </div>
            </div>
          ) : null}
        </div>

        {checkError ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
            {checkError}
          </div>
        ) : null}

        <div className="space-y-2">
          {selectedFiles.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Пока нет выбранных PDF-файлов.
            </p>
          ) : null}

          {selectedFiles.map((file) => {
            const key = makeFileKey(file);
            const result = resultsByFile.get(key);
            const isActive = key === activeFileKey;
            const summary =
              result && hideBaselines
                ? computeFilteredSummary(
                    result.rules,
                    result.fileName,
                    hasBaseline,
                  )
                : result?.summary ?? null;
            const summaryRatios = summary ? getSummaryRatios(summary) : null;

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onActivateFile(key);
                }}
                className={cn(
                  "w-full rounded-md px-2.5 py-2 text-left transition-colors",
                  isActive
                    ? "bg-primary/10"
                    : "bg-transparent hover:bg-muted/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0" />
                    <span className="truncate text-sm">{file.name}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {formatFileSize(file.size)}
                  </span>
                </div>

                <div className="mt-2 space-y-2">
                  <div className="flex h-5 items-center">
                    {summary ? (
                      <div className="inline-flex overflow-hidden rounded-md border border-border/70">
                        <Badge
                          variant="segment"
                          className="bg-emerald-600 text-white dark:bg-emerald-700"
                        >
                          {summary.pass}
                        </Badge>
                        <Badge
                          variant="segment"
                          className="bg-red-600 text-white dark:bg-red-700"
                        >
                          {summary.fail}
                        </Badge>
                        <Badge
                          variant="segment"
                          className="bg-amber-500 text-black dark:bg-amber-600 dark:text-black"
                        >
                          {summary.warn}
                        </Badge>
                      </div>
                    ) : isChecking ? (
                      <div className="flex items-center gap-1">
                        <div className="h-5 w-6 animate-pulse rounded-full bg-muted" />
                        <div className="h-5 w-6 animate-pulse rounded-full bg-muted" />
                        <div className="h-5 w-6 animate-pulse rounded-full bg-muted" />
                      </div>
                    ) : (
                      <span className="text-muted-foreground inline-flex h-5 items-center text-xs">
                        Не проверено
                      </span>
                    )}
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    {summaryRatios ? (
                      <div className="flex h-full w-full">
                        <span
                          className="h-full bg-emerald-600 dark:bg-emerald-700"
                          style={{ width: `${summaryRatios.pass}%` }}
                        />
                        <span
                          className="h-full bg-red-600 dark:bg-red-700"
                          style={{ width: `${summaryRatios.fail}%` }}
                        />
                        <span
                          className="h-full bg-amber-500 dark:bg-amber-600"
                          style={{ width: `${summaryRatios.warn}%` }}
                        />
                      </div>
                    ) : (
                      <span className="block h-full w-full" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

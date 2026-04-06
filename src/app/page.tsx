"use client";

import { invoke } from "@tauri-apps/api/core";
import { EyeOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ModeToggle } from "@/components/mode-toggle";
import type { PreviewHighlight } from "@/components/pdf-preview";
import { ConfigEditor } from "@/features/report-checker/config-editor";
import { FilePanel } from "@/features/report-checker/file-panel";
import { makeFileKey, makeResultKey } from "@/features/report-checker/helpers";
import { PreviewPanel } from "@/features/report-checker/preview-panel";
import { ResultsPanel } from "@/features/report-checker/results-panel";
import type { SelectedRule } from "@/features/report-checker/types";
import { useBaselines } from "@/features/report-checker/use-baselines";
import {
  type CheckerConfig,
  defaultCheckerConfig,
  normalizeCheckerConfig,
} from "@/lib/checker-config";
import { type FileCheckResult, runReportChecks } from "@/lib/report-checker";
import { cn } from "@/lib/utils";

type MainTab = "preview" | "settings";
type DragSide = "left" | "right";

type DragState = {
  side: DragSide;
  startX: number;
  startLeftWidth: number;
  startRightWidth: number;
  containerWidth: number;
};

const LEFT_PANEL_DEFAULT_WIDTH = 280;
const LEFT_PANEL_MIN_WIDTH = 220;
const MIDDLE_PANEL_MIN_WIDTH = 360;
const RIGHT_PANEL_DEFAULT_WIDTH = 720;
const RIGHT_PANEL_MIN_WIDTH = 320;
const RESIZE_HANDLE_WIDTH = 12;
const MAIN_TABS: MainTab[] = ["preview", "settings"];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function makeMaxSize(minSize: number, value: number) {
  return Math.max(minSize, value);
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const checkRequestIdRef = useRef(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeFileKey, setActiveFileKey] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<FileCheckResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{
    step: string;
    progress: number;
  } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [hoverHighlight, setHoverHighlight] = useState<PreviewHighlight | null>(
    null,
  );
  const [selectedRule, setSelectedRule] = useState<SelectedRule | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<MainTab>("preview");
  const [config, setConfig] = useState<CheckerConfig>(defaultCheckerConfig);
  const [hideBaselines, setHideBaselines] = useState(false);

  useEffect(() => {
    setHideBaselines(localStorage.getItem("hideBaselines") === "true");
  }, []);
  const { hasBaseline, addBaselinesMany, removeBaselinesMany } = useBaselines();
  const [leftPanelWidth, setLeftPanelWidth] = useState(
    LEFT_PANEL_DEFAULT_WIDTH,
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(
    RIGHT_PANEL_DEFAULT_WIDTH,
  );
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    invoke<string>("read_checker_config")
      .then((text) => {
        setConfig(normalizeCheckerConfig(JSON.parse(text)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!layoutRef.current) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const containerWidth = entry.contentRect.width;
      const maxLeft = makeMaxSize(
        LEFT_PANEL_MIN_WIDTH,
        containerWidth -
          rightPanelWidth -
          MIDDLE_PANEL_MIN_WIDTH -
          RESIZE_HANDLE_WIDTH * 2,
      );
      const nextLeft = clamp(leftPanelWidth, LEFT_PANEL_MIN_WIDTH, maxLeft);

      const maxRight = makeMaxSize(
        RIGHT_PANEL_MIN_WIDTH,
        containerWidth -
          nextLeft -
          MIDDLE_PANEL_MIN_WIDTH -
          RESIZE_HANDLE_WIDTH * 2,
      );
      const nextRight = clamp(rightPanelWidth, RIGHT_PANEL_MIN_WIDTH, maxRight);

      if (nextLeft !== leftPanelWidth) {
        setLeftPanelWidth(nextLeft);
      }
      if (nextRight !== rightPanelWidth) {
        setRightPanelWidth(nextRight);
      }
    });

    observer.observe(layoutRef.current);

    return () => {
      observer.disconnect();
    };
  }, [leftPanelWidth, rightPanelWidth]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onPointerMove = (event: PointerEvent) => {
      const deltaX = event.clientX - dragState.startX;

      if (dragState.side === "left") {
        const maxLeft = makeMaxSize(
          LEFT_PANEL_MIN_WIDTH,
          dragState.containerWidth -
            dragState.startRightWidth -
            MIDDLE_PANEL_MIN_WIDTH -
            RESIZE_HANDLE_WIDTH * 2,
        );
        setLeftPanelWidth(
          clamp(
            dragState.startLeftWidth + deltaX,
            LEFT_PANEL_MIN_WIDTH,
            maxLeft,
          ),
        );
        return;
      }

      const maxRight = makeMaxSize(
        RIGHT_PANEL_MIN_WIDTH,
        dragState.containerWidth -
          dragState.startLeftWidth -
          MIDDLE_PANEL_MIN_WIDTH -
          RESIZE_HANDLE_WIDTH * 2,
      );
      setRightPanelWidth(
        clamp(
          dragState.startRightWidth - deltaX,
          RIGHT_PANEL_MIN_WIDTH,
          maxRight,
        ),
      );
    };

    const stopDragging = () => {
      setDragState(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [dragState]);

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setActiveFileKey(null);
      return;
    }

    const hasCurrent = selectedFiles.some(
      (file) => makeFileKey(file) === activeFileKey,
    );
    if (!hasCurrent) {
      setActiveFileKey(makeFileKey(selectedFiles[0]));
    }
  }, [selectedFiles, activeFileKey]);

  const resultsByFile = useMemo(
    () =>
      new Map(checkResults.map((result) => [makeResultKey(result), result])),
    [checkResults],
  );

  const activeFile = useMemo(
    () =>
      selectedFiles.find((file) => makeFileKey(file) === activeFileKey) ?? null,
    [selectedFiles, activeFileKey],
  );

  const activeResult = useMemo(
    () =>
      activeFile ? (resultsByFile.get(makeFileKey(activeFile)) ?? null) : null,
    [activeFile, resultsByFile],
  );

  const openFilePicker = () => {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.value = "";
    inputRef.current.click();
  };

  const resetOverlayState = () => {
    setHoverHighlight(null);
    setSelectedRule(null);
  };

  const runChecksForFiles = async (
    files: File[],
    checkerConfig: CheckerConfig = config,
  ) => {
    if (files.length === 0) {
      return;
    }

    const requestId = ++checkRequestIdRef.current;
    setIsChecking(true);
    setCheckError(null);
    setCheckResults([]);
    setCheckProgress(null);
    resetOverlayState();

    try {
      await runReportChecks(
        files,
        checkerConfig,
        (step, progress) => {
          if (checkRequestIdRef.current !== requestId) return;
          setCheckProgress((prev) => ({
            step,
            progress: Math.max(prev?.progress ?? 0, progress),
          }));
        },
        (result) => {
          if (checkRequestIdRef.current !== requestId) return;
          setCheckResults((prev) => [...prev, result]);
        },
      );
      if (checkRequestIdRef.current !== requestId) {
        return;
      }
    } catch (error) {
      if (checkRequestIdRef.current !== requestId) {
        return;
      }
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Не удалось выполнить проверку PDF.";
      setCheckError(errorMessage);
      setCheckResults([]);
    } finally {
      if (checkRequestIdRef.current === requestId) {
        setIsChecking(false);
        setCheckProgress(null);
      }
    }
  };

  const applySelectedFiles = (files: File[]) => {
    const pdfFiles = files.filter((file) =>
      file.name.toLowerCase().endsWith(".pdf"),
    );

    // Invalidate any in-flight run when file selection changes.
    checkRequestIdRef.current += 1;
    setIsChecking(false);
    setSelectedFiles(pdfFiles);
    setActiveFileKey(pdfFiles.length > 0 ? makeFileKey(pdfFiles[0]) : null);
    setCheckResults([]);
    setCheckError(null);
    resetOverlayState();

    if (pdfFiles.length > 0) {
      void runChecksForFiles(pdfFiles);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    applySelectedFiles(Array.from(event.target.files ?? []));
  };

  const handleFilesDrop = (files: File[]) => {
    applySelectedFiles(files);
  };

  const runChecks = async () => {
    await runChecksForFiles(selectedFiles);
  };

  const applyConfig = async (parsed: CheckerConfig) => {
    const normalizedConfig = normalizeCheckerConfig(parsed);

    try {
      await invoke("write_checker_config", {
        content: JSON.stringify(normalizedConfig, null, 2),
      });
    } catch (e) {
      toast.error("Не удалось сохранить", {
        description: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    setConfig(normalizedConfig);
    toast.success("Настройки сохранены");
    if (selectedFiles.length > 0) {
      void runChecksForFiles(selectedFiles, normalizedConfig);
    }
  };

  const startDrag = (side: DragSide) => (event: React.PointerEvent) => {
    event.preventDefault();

    const containerWidth = layoutRef.current?.getBoundingClientRect().width;
    if (!containerWidth) {
      return;
    }

    setDragState({
      side,
      startX: event.clientX,
      startLeftWidth: leftPanelWidth,
      startRightWidth: rightPanelWidth,
      containerWidth,
    });
  };

  const activePreviewHighlight =
    hoverHighlight ?? selectedRule?.highlight ?? null;
  const middleTitle =
    activeMainTab === "preview" ? "Предпросмотр PDF" : "Настройки";
  const middleSubtitle =
    activeMainTab === "preview"
      ? (activeFile?.name ?? "Файл не выбран")
      : "Параметры проверки документа";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background p-3 text-foreground">
      <div className="absolute right-3 top-3 z-30 flex items-center gap-1">
        {config.showBaselineFilter && (
          <button
            type="button"
            title={
              hideBaselines ? "Показать все результаты" : "Скрыть сохранённые"
            }
            onClick={() => {
              setHideBaselines((v) => {
                const next = !v;
                localStorage.setItem("hideBaselines", String(next));
                return next;
              });
            }}
            className={`rounded-md p-1.5 transition-colors ${
              hideBaselines
                ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <EyeOff className="size-4" />
          </button>
        )}
        <ModeToggle />
      </div>
      <div
        ref={layoutRef}
        className="grid h-full"
        style={{
          gridTemplateColumns: `${leftPanelWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(${MIDDLE_PANEL_MIN_WIDTH}px, 1fr) ${RESIZE_HANDLE_WIDTH}px ${rightPanelWidth}px`,
        }}
      >
        <FilePanel
          inputRef={inputRef}
          selectedFiles={selectedFiles}
          activeFileKey={activeFileKey}
          isChecking={isChecking}
          checkProgress={checkProgress}
          checkError={checkError}
          resultsByFile={resultsByFile}
          hideBaselines={hideBaselines}
          hasBaseline={hasBaseline}
          onOpenFilePicker={openFilePicker}
          onFileSelect={handleFileSelect}
          onFilesDrop={handleFilesDrop}
          onRunChecks={() => {
            void runChecks();
          }}
          onActivateFile={(key) => {
            setActiveFileKey(key);
            resetOverlayState();
          }}
        />

        <button
          type="button"
          aria-label="Изменить ширину панели файлов"
          className="group relative cursor-col-resize touch-none"
          onPointerDown={startDrag("left")}
        >
          <span className="bg-border group-hover:bg-primary/70 absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors" />
        </button>

        <section className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="border-b px-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{middleTitle}</h2>
                <p className="text-muted-foreground truncate text-sm">
                  {middleSubtitle}
                </p>
              </div>
              <div className="flex shrink-0 gap-1 rounded-md border bg-muted/40 p-0.5">
                {MAIN_TABS.map((tab) => {
                  const label =
                    tab === "preview" ? "Предпросмотр PDF" : "Настройки";
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveMainTab(tab)}
                      className={cn(
                        "rounded px-2 py-1 text-xs font-medium transition-colors",
                        activeMainTab === tab
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden pt-4">
            {activeMainTab === "preview" ? (
              <PreviewPanel
                activeFile={activeFile}
                highlight={activePreviewHighlight}
              />
            ) : (
              <section className="h-full overflow-hidden">
                <div className="h-full overflow-y-auto">
                  <ConfigEditor
                    config={config}
                    onSave={(parsed) => {
                      void applyConfig(parsed);
                    }}
                  />
                </div>
              </section>
            )}
          </div>
        </section>

        <button
          type="button"
          aria-label="Изменить ширину панели результатов"
          className="group relative cursor-col-resize touch-none"
          onPointerDown={startDrag("right")}
        >
          <span className="bg-border group-hover:bg-primary/70 absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors" />
        </button>

        <ResultsPanel
          activeFile={activeFile}
          activeResult={activeResult}
          selectedRule={selectedRule}
          hideBaselines={hideBaselines}
          hasBaseline={hasBaseline}
          onAddBaselinesMany={addBaselinesMany}
          onRemoveBaselinesMany={removeBaselinesMany}
          onHover={setHoverHighlight}
          onSelectRule={setSelectedRule}
        />
      </div>
    </main>
  );
}

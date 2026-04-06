"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { PreviewHighlight } from "@/components/pdf-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  collectSubtreeNodes,
  nodeHasDifferences,
} from "@/features/report-checker/helpers";
import type { BaselineEntry } from "@/features/report-checker/use-baselines";
import { RuleTreeItem } from "@/features/report-checker/rule-tree-item";
import type { SelectedRule } from "@/features/report-checker/types";
import type { FileCheckResult, RuleResult } from "@/lib/report-checker";
import { cn } from "@/lib/utils";

type ResultsTab = "tree" | "errors-text";

type RulePathItem = {
  id: string;
  title: string;
};

type ErrorTextEntry = {
  ruleId: string;
  pathTitles: string[];
  message: string;
  pages: number[];
};

const RESULTS_TABS: Array<{ id: ResultsTab; label: string }> = [
  { id: "tree", label: "Дерево" },
  { id: "errors-text", label: "Текст ошибок" },
];

function uniqueSorted(numbers: number[]): number[] {
  return Array.from(
    new Set(numbers.filter((value) => Number.isFinite(value) && value > 0)),
  ).sort((left, right) => left - right);
}

function dedupeConsecutive(items: string[]): string[] {
  const deduped: string[] = [];
  for (const item of items) {
    if (deduped[deduped.length - 1] !== item) {
      deduped.push(item);
    }
  }
  return deduped;
}

function collectNodePages(node: RuleResult): number[] {
  return uniqueSorted([
    ...node.jumpPageNumbers,
    ...node.overlayBoxes.map((box) => box.pageNumber),
  ]);
}

function collectFailLeafPages(node: RuleResult): number[] {
  const pages: number[] = [];

  const walk = (current: RuleResult) => {
    if (current.status !== "fail") {
      return;
    }

    const failedChildren = current.children.filter(
      (child) => child.status === "fail",
    );

    if (failedChildren.length === 0) {
      pages.push(...collectNodePages(current));
      return;
    }

    for (const child of failedChildren) {
      walk(child);
    }
  };

  walk(node);

  if (pages.length === 0) {
    pages.push(...collectNodePages(node));
  }

  return uniqueSorted(pages);
}

function collectErrorTextEntries(nodes: RuleResult[]): ErrorTextEntry[] {
  const entries: ErrorTextEntry[] = [];

  const walk = (node: RuleResult, path: RulePathItem[]) => {
    const nextPath = [...path, { id: node.id, title: node.title }];

    if (node.status === "fail" && node.countInSummary) {
      const visiblePath = nextPath
        .filter((item) => item.id !== "formatting")
        .map((item) => item.title);

      entries.push({
        ruleId: node.id,
        pathTitles: dedupeConsecutive(visiblePath),
        message: node.message,
        pages: collectFailLeafPages(node),
      });
    }

    for (const child of node.children) {
      walk(child, nextPath);
    }
  };

  for (const node of nodes) {
    walk(node, []);
  }

  return entries;
}

function fixSuggestionForRule(ruleId: string): string {
  if (ruleId === "page-format") {
    return "Приведите размер страниц к A4 (21 x 29,7 см).";
  }
  if (ruleId === "font-size") {
    return "Используйте размер шрифта не меньше 12 пт в основном тексте.";
  }
  if (ruleId === "line-spacing") {
    return "Установите межстрочный интервал 1,5 для основного текста.";
  }
  if (ruleId === "font-color") {
    return "Приведите цвет основного текста к черному.";
  }
  if (ruleId === "paragraph-indent") {
    return "Сделайте абзацный отступ 1,25 см и одинаковым по документу.";
  }
  if (ruleId === "text-alignment") {
    return "Выравнивайте основной текст по ширине.";
  }
  if (
    ruleId === "margin-left" ||
    ruleId === "margin-right" ||
    ruleId === "margin-top" ||
    ruleId === "margin-bottom"
  ) {
    return "Проверьте настройки полей и приведите их к требованиям шаблона.";
  }
  if (ruleId === "page-numbering") {
    return "Оставьте титульный лист без номера и проверьте сквозную нумерацию со 2-й страницы.";
  }
  if (ruleId === "toc-presence" || ruleId === "toc-body-match") {
    return "Исправьте раздел «СОДЕРЖАНИЕ» и синхронизируйте его с заголовками в тексте.";
  }
  if (ruleId === "section-headings-format") {
    return "Приведите оформление заголовков разделов к единому формату по требованиям.";
  }
  if (ruleId.startsWith("struct-elem-")) {
    return "Добавьте или исправьте обязательный структурный элемент отчета.";
  }
  if (ruleId.startsWith("title-page-")) {
    return "Исправьте данные на титульном листе по требованиям кафедры/программы.";
  }
  return "Исправьте пункт по описанию проблемы и повторите проверку.";
}

function buildErrorsText(result: FileCheckResult): string {
  const entries = collectErrorTextEntries(result.rules);
  const lines: string[] = [
    `Отчет: ${result.fileName}`,
    `Дата проверки: ${result.checkedAt}`,
    "",
  ];

  if (entries.length === 0) {
    lines.push("Ошибок оформления не обнаружено.");
    return lines.join("\n");
  }

  lines.push(`Выявлены ошибки оформления (${entries.length}):`, "");

  for (const [index, entry] of entries.entries()) {
    lines.push(`${index + 1}. ${entry.pathTitles.join(" -> ")}`);
    if (entry.pages.length > 0) {
      lines.push(`Страницы: ${entry.pages.join(", ")}`);
    }
    lines.push(`Проблема: ${entry.message}`);
    lines.push(`Как исправить: ${fixSuggestionForRule(entry.ruleId)}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

type ResultsPanelProps = {
  activeFile: File | null;
  activeResult: FileCheckResult | null;
  selectedRule: SelectedRule | null;
  hideBaselines: boolean;
  hasBaseline: (fileName: string, ruleId: string, message: string) => boolean;
  onAddBaselinesMany: (entries: BaselineEntry[]) => void;
  onRemoveBaselinesMany: (entries: BaselineEntry[]) => void;
  onHover: (highlight: PreviewHighlight | null) => void;
  onSelectRule: (selectedRule: SelectedRule | null) => void;
};

export function ResultsPanel({
  activeFile,
  activeResult,
  selectedRule,
  hideBaselines,
  hasBaseline,
  onAddBaselinesMany,
  onRemoveBaselinesMany,
  onHover,
  onSelectRule,
}: ResultsPanelProps) {
  const [activeTab, setActiveTab] = useState<ResultsTab>("tree");

  const errorsText = useMemo(
    () => (activeResult ? buildErrorsText(activeResult) : ""),
    [activeResult],
  );

  const fileName = activeResult?.fileName ?? "";

  const visibleRules = useMemo(() => {
    if (!activeResult) return [];
    if (!hideBaselines) return activeResult.rules;
    return activeResult.rules.filter((rule) =>
      nodeHasDifferences(rule, fileName, hasBaseline),
    );
  }, [activeResult, hideBaselines, fileName, hasBaseline]);

  const handleCopyErrorsText = async () => {
    try {
      await navigator.clipboard.writeText(errorsText);
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать текст");
    }
  };

  const sharedTreeProps = {
    selectedRuleKey: selectedRule?.key ?? null,
    fileName,
    hideBaselines,
    hasBaseline,
    onAddBaseline: (node: RuleResult) => {
      onAddBaselinesMany(
        collectSubtreeNodes(node).map((n) => ({
          fileName,
          ruleId: n.id,
          message: n.message,
        })),
      );
    },
    onRemoveBaseline: (node: RuleResult) => {
      onRemoveBaselinesMany(
        collectSubtreeNodes(node).map((n) => ({
          fileName,
          ruleId: n.id,
          message: n.message,
        })),
      );
    },
    onHover,
    onSelect: onSelectRule,
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b px-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Результаты</h2>
            <p className="text-muted-foreground text-sm">
              Наведение подсвечивает, клик закрепляет подсветку.
            </p>
          </div>

        </div>
      </div>
      <div className="h-full overflow-y-auto pt-4">
        {!activeFile ? (
          <p className="text-muted-foreground text-sm">
            Выберите файл слева, чтобы посмотреть результаты.
          </p>
        ) : null}

        {activeFile && !activeResult ? (
          <p className="text-muted-foreground text-sm">
            Для выбранного файла пока нет результатов проверки.
          </p>
        ) : null}

        {activeResult ? (
          <div className="space-y-4">
            <div className="inline-flex overflow-hidden rounded-md border border-border/70">
              <Badge
                variant="segment"
                className="bg-emerald-600 text-white dark:bg-emerald-700"
              >
                OK {activeResult.summary.pass}
              </Badge>
              <Badge
                variant="segment"
                className="bg-red-600 text-white dark:bg-red-700"
              >
                FAIL {activeResult.summary.fail}
              </Badge>
              <Badge
                variant="segment"
                className="bg-amber-500 text-black dark:bg-amber-600 dark:text-black"
              >
                WARN {activeResult.summary.warn}
              </Badge>
              <Badge
                variant="segment"
                className="bg-muted text-foreground dark:bg-muted"
              >
                Всего {activeResult.summary.total}
              </Badge>
            </div>

            <div className="flex w-fit gap-1 rounded-md border bg-muted/40 p-0.5">
              {RESULTS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === "errors-text") {
                      onHover(null);
                    }
                    setActiveTab(tab.id);
                  }}
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition-colors",
                    activeTab === tab.id
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "tree" && selectedRule ? (
              <div className="bg-muted/50 flex items-center justify-between rounded-sm border px-2 py-1 text-xs">
                <span className="truncate">
                  Закреплено: {selectedRule.title}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    onSelectRule(null);
                  }}
                >
                  Снять
                </Button>
              </div>
            ) : null}

            {activeTab === "tree" ? (
              visibleRules.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Все результаты совпадают с сохранёнными базовыми.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {visibleRules.map((rule, index) => (
                    <RuleTreeItem
                      key={`${rule.id}-${index}`}
                      node={rule}
                      depth={0}
                      path={`root.${index}`}
                      {...sharedTreeProps}
                    />
                  ))}
                </ul>
              )
            ) : (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      void handleCopyErrorsText();
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <textarea
                  readOnly
                  value={errorsText}
                  className="min-h-80 w-full resize-y rounded-md border bg-muted/20 p-2 font-mono text-xs leading-5"
                  aria-label="Текст ошибок"
                />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

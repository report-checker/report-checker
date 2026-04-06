"use client";

import {
  AlertTriangle,
  BookmarkCheck,
  BookmarkMinus,
  BookmarkPlus,
  CheckCircle2,
  ChevronRight,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import type { PreviewHighlight } from "@/components/pdf-preview";
import { Badge } from "@/components/ui/badge";
import {
  nodeHasDifferences,
  nodeIsFullySaved,
  statusBadgeClassName,
  statusLabel,
  toPreviewHighlight,
} from "@/features/report-checker/helpers";
import type { SelectedRule } from "@/features/report-checker/types";
import type { RuleResult } from "@/lib/report-checker";
import { cn } from "@/lib/utils";

function StatusIcon({ status }: { status: RuleResult["status"] }) {
  if (status === "pass") {
    return <CheckCircle2 className="size-3.5 text-emerald-700" />;
  }
  if (status === "fail") {
    return <XCircle className="size-3.5 text-red-700" />;
  }
  return <AlertTriangle className="size-3.5 text-amber-700" />;
}

type RuleTreeItemProps = {
  node: RuleResult;
  depth: number;
  path: string;
  selectedRuleKey: string | null;
  fileName: string;
  hideBaselines: boolean;
  hasBaseline: (fileName: string, ruleId: string, message: string) => boolean;
  onAddBaseline: (node: RuleResult) => void;
  onRemoveBaseline: (node: RuleResult) => void;
  onHover: (highlight: PreviewHighlight | null) => void;
  onSelect: (selected: SelectedRule | null) => void;
};

export function RuleTreeItem({
  node,
  depth,
  path,
  selectedRuleKey,
  fileName,
  hideBaselines,
  hasBaseline,
  onAddBaseline,
  onRemoveBaseline,
  onHover,
  onSelect,
}: RuleTreeItemProps) {
  const previewHighlight = toPreviewHighlight(node);
  const nodeKey = `${path}/${node.id}`;
  const isSelected = selectedRuleKey === nodeKey;
  const hasChildren = node.children.length > 0;
  const [isExpanded, setIsExpanded] = useState(
    !node.childrenCollapsedByDefault,
  );

  const savedAsBaseline = nodeIsFullySaved(node, fileName, hasBaseline);

  return (
    <li>
      <div
        className="group/item flex items-start gap-1"
        style={{ marginLeft: `${depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="text-muted-foreground mt-1 rounded-sm p-0.5 hover:bg-muted/40"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsExpanded((value) => !value);
            }}
            aria-label={isExpanded ? "Свернуть раздел" : "Развернуть раздел"}
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                isExpanded ? "rotate-90" : "rotate-0",
              )}
            />
          </button>
        ) : (
          <span className="mt-1 size-4 shrink-0" />
        )}

        <button
          type="button"
          disabled={!previewHighlight}
          className={cn(
            "w-full rounded-sm px-2 py-1.5 text-left transition-colors disabled:opacity-100",
            previewHighlight ? "cursor-pointer hover:bg-muted/35" : "",
            isSelected ? "bg-muted/60 ring-1 ring-primary/25" : "",
          )}
          onClick={() => {
            if (!previewHighlight) {
              return;
            }

            if (isSelected) {
              onSelect(null);
              return;
            }

            onSelect({
              key: nodeKey,
              title: node.title,
              highlight: previewHighlight,
            });
          }}
          onMouseEnter={() => {
            if (!previewHighlight) {
              return;
            }
            onHover(previewHighlight);
          }}
          onMouseLeave={() => {
            if (!previewHighlight) {
              return;
            }
            onHover(null);
          }}
        >
          <div className="flex items-start gap-1.5">
            <StatusIcon status={node.status} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium leading-4">{node.title}</p>
                <Badge
                  variant="outline"
                  className={cn(
                    "h-4 rounded px-1 text-[10px]",
                    statusBadgeClassName(node.status),
                  )}
                >
                  {statusLabel(node.status)}
                </Badge>
                {savedAsBaseline ? (
                  <Badge
                    variant="outline"
                    className="h-4 rounded border-sky-200 bg-sky-50 px-1 text-[10px] text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
                  >
                    <BookmarkCheck className="mr-0.5 size-2.5" />
                    сохранено
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-0.5 text-[11px] leading-4">
                {node.message}
              </p>
            </div>
          </div>
        </button>

        <div className="mt-1 flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
          {savedAsBaseline ? (
            <button
              type="button"
              title="Убрать из базовых"
              className="rounded-sm p-0.5 text-sky-600 hover:bg-muted/40 hover:text-red-600 dark:text-sky-400"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveBaseline(node);
              }}
            >
              <BookmarkMinus className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              title="Сохранить как базовый"
              className="text-muted-foreground rounded-sm p-0.5 hover:bg-muted/40 hover:text-sky-600"
              onClick={(event) => {
                event.stopPropagation();
                onAddBaseline(node);
              }}
            >
              <BookmarkPlus className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {hasChildren && isExpanded ? (
        <ul className="mt-0.5 space-y-0.5">
          {node.children
            .filter(
              (child) =>
                !hideBaselines ||
                nodeHasDifferences(child, fileName, hasBaseline),
            )
            .map((child, index) => (
              <RuleTreeItem
                key={`${child.id}-${index}`}
                node={child}
                depth={depth + 1}
                path={`${nodeKey}.${index}`}
                selectedRuleKey={selectedRuleKey}
                fileName={fileName}
                hideBaselines={hideBaselines}
                hasBaseline={hasBaseline}
                onAddBaseline={onAddBaseline}
                onRemoveBaseline={onRemoveBaseline}
                onHover={onHover}
                onSelect={onSelect}
              />
            ))}
        </ul>
      ) : null}
    </li>
  );
}
